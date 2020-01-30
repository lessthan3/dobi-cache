import { stringify } from 'querystring';
import RedisDriver from './RedisDriver';
import { Context } from 'koa'

import { generateCacheData } from './utils'

interface ICacheOptions {
  age?: string;
  headers?: Record<string, string>;
  query?: string | string[] | boolean;
}

interface ICacheConfig {
  age: number;
  headers: Record<string, string>;
  query: string[];
}

interface IConstructor {
  enabled: boolean;
  keyPrefix: string;
  redisUri: string;
}

interface IGenerateKey {
  ctx: Context;
  query: string[];

}

const defaultConfig: ICacheConfig = {
  age: 300, // default 5 minutes cache,
  headers: {},
  query: ['*'],
}

class Index {
  private _enabled: boolean;
  private _redisDriver: RedisDriver;
  constructor(params: IConstructor) {
    this._enabled = params.enabled;
    this._redisDriver = new RedisDriver(params);
    this.cache = this.cache.bind(this);
  }

  // force local cache to be max 5 minutes
  static generateCacheControl(age: number): string {
    if (age === 0) {
      return 'private, max-age=0, no-cacheHelper, no-store, must-revalidate'
    }
    return `public, max-age=${Math.min(age, 300)}, must-revalidate`
  }

  static generateConfig(rawParams?: ICacheOptions | string): ICacheConfig {
    const config: ICacheConfig = { ...defaultConfig };
    if (!rawParams) {
      return config;
    }
    const params: ICacheOptions = typeof rawParams === 'string' ?
      { age: rawParams } : rawParams;

    // set config.headers
    if (params.headers) {
      config.headers = {...params.headers}
    }

    // set config.query
    if (params.query) {
      if (Array.isArray(params.query)) {
        config.query = [...params.query];
      } else if (typeof params.query === 'boolean') {
        config.query = params.query ? ['*'] : [];
      } else {
        config.query = params.query.split(',');
      }
    }

    if (params.age) {
      const [rawAge, type] = params.age.split(' ');
      let age = Number.parseInt(rawAge, 10);
      switch (type) {
        case 'minute':
        case 'minutes': {
          age *= 60;
          break;
        }
        case 'hour':
        case 'hours': {
          age *= 3600;
          break;
        }
        case 'day':
        case 'days': {
          age *= 86400;
          break;
        }
        case 'week':
        case 'weeks': {
          age *= 604800;
          break;
        }
        default: {
          break;
        }
      }
      config.age = age;
    }
    return config;
  }

  static generateKey({ctx, query}: IGenerateKey): string {
    const {
      hostname,
      originalUrl,
      path,
      protocol,
      query: requestQuery,
    } = ctx.request;

    let key = `${protocol}://${hostname}${path}`;
    if (query.includes('*')) {
      key = `${protocol}://${hostname}${originalUrl}`
    } else if (query.length) {
      const keyQuery = query.sort().reduce<Record<string, any>>((obj, field) => ({
        ...obj,
        ...(requestQuery[field] ? { [field]: requestQuery[field] } : null),
      }), {});
      if (Object.keys(keyQuery).length) {
        key = `${protocol}://${hostname}${path}?${stringify(keyQuery)}`
      }
    }

    return key;
  }

  // allow fastly to cache however long it needs
  static generateSurrogateControl(age: number): string {
    return `max-age=${age}`;
  }

  cache(options: ICacheOptions) {
    const config = Index.generateConfig(options);
    const enabled = this._enabled;
    const redisDriver = this._redisDriver;
    return async (ctx: Context, next: () => void): Promise<void> => {
      const skipCache = !!ctx.request.query._;

      // set headers
      for (const [k, v] of Object.entries(config.headers)) {
        ctx.set(k, v);
      }

      // only cache GETs and HEADs
      if (!(enabled && ['HEAD', 'GET'].includes(ctx.request.method) && !skipCache)) {
        await next();
        return;
      }

      // generate key
      const cacheKey = Index.generateKey({ ctx, query: config.query });

      // set headers
      ctx.set('Cache-Control', Index.generateCacheControl(config.age));
      ctx.set('Surrogate-Control', Index.generateSurrogateControl(config.age));
      ctx.set('Surrogate-Key', `${ctx.request.hostname} ${cacheKey}`);

      // check if data is still fresh
      const cacheHeaders = await redisDriver.getHeaders(cacheKey);
      if (cacheHeaders) {
        const { etag, lastModified } = cacheHeaders;
        ctx.status = 200;
        ctx.response.lastModified = new Date(lastModified);
        ctx.response.etag = etag;
        if (ctx.fresh) {
          ctx.set('X-Dobi-Cache', 'HIT');
          ctx.status = 304;
          return;
        }
      }

      // check for cached data
      const cacheData = await redisDriver.getData(cacheKey);
      if (cacheData && cacheData.body && cacheData.type) {
        ctx.set('X-Dobi-Cache', 'HIT');
        ctx.set('Content-Type', cacheData.type);
        ctx.response.lastModified = new Date(cacheData.lastModified);
        ctx.response.etag = cacheData.etag;
        // @ts-ignore
        ctx.body = cacheData.isBuffer ? Buffer.from(cacheData.body) : cacheData.body;
        return;
      }

      // request missed
      await next();
      if (!ctx.body) {
        return;
      }
      ctx.set('X-Dobi-Cache', 'MISS');

      // update cache
      const freshCacheData = await generateCacheData(ctx);
      await redisDriver.setHeaders(cacheKey, {
        etag: freshCacheData.etag,
        lastModified: freshCacheData.lastModified,
      }, config.age);
      await redisDriver.setData(cacheKey, freshCacheData, config.age);

      if (freshCacheData.isBuffer) {
        ctx.body = freshCacheData.body;
      }

    }
  }

  async flushCache(): Promise<number> {
    if (!this._enabled) {
      return 0;
    }
    return this._redisDriver.flushCache();
  }
}

export default Index;
