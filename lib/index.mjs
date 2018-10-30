import isJSON from 'koa-is-json';
import streamToArray from 'stream-to-array';
import qs from 'querystring';
import CacheHelper from './cacheHelper';

const buildDocument = async (ctx) => {
  const { body } = ctx;
  const output = {
    body,
    type: ctx.response.get('Content-Type') || null,
  };
  if (isJSON(body)) {
    output.body = JSON.stringify(body);
  }
  if (typeof body.pipe === 'function') {
    const arr = await streamToArray(body);
    output.body = Buffer.concat(arr);
  }

  output.isBuffer = Buffer.isBuffer(output.body);
  return output;
};

export default class Cache {
  /**
   * @param {Object} config
   * @param {boolean} config.enabled=true
   * @param {string} config.keyPrefix=dobiCache prefix for redis keys
   * @param {number} config.lruMaxItems max number of lru items
   * @param {string} config.redisUri uri for redis server
   */
  constructor({
    enabled = true,
    keyPrefix = 'dobiCacheV2',
    lruMaxItems = 100,
    redisUri,
  }) {
    // connect to redis
    this.enabled = enabled;
    this.cacheHelper = new CacheHelper({
      enabled, keyPrefix, lruMaxItems, redisUri,
    });
    this.flushCache = this.cacheHelper.flushCache.bind(this.cacheHelper);
    this.cache = this.cache.bind(this);
  }

  static configure(_options) {
    let options = _options;

    if (!options) {
      options = '5 minutes';
    }
    if (typeof options === 'string') {
      options = { age: options };
    }
    if (typeof options.age === 'string') {
      const [ageString, type] = options.age.split(' ');
      let age = Number.parseInt(ageString, 10);
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
      options.age = age;
    }

    return options;
  }

  cache(_options) {
    const options = Cache.configure(_options);

    return async (ctx, next) => {
      await this.cacheHelper.connect();

      const {
        hostname,
        method,
        originalUrl,
        path,
        protocol,
        query: requestQuery,
        query: {
          _: skipCache,
        },
      } = ctx.request;

      const {
        headers = {},
        query: optionsQuery,
        qs: optionsQs = '*',
      } = options;

      // set headers
      for (const [k, v] of Object.entries(headers)) {
        ctx.set(k, v);
      }

      // only cache GETs && HEADs
      if (!(this.enabled && ['HEAD', 'GET'].includes(method) && !skipCache)) {
        await next();
        return;
      }

      let query = optionsQuery || optionsQs;
      if (typeof query === 'string') {
        query = query.split(',');
      } else if (typeof query === 'boolean') {
        if (query) {
          query = ['*'];
        } else {
          query = [];
        }
      } else if (query === null) {
        query = [];
      }

      let key = `${protocol}://${hostname}${path}`;
      if (query.includes('*') >= 0) {
        key = `${protocol}://${hostname}${originalUrl}`;
      } else if (query.length) {
        const keyQuery = query.sort().reduce((obj, field) => (
          requestQuery[field] ? {
            ...obj,
            [field]: requestQuery[field],
          } : obj
        ), []);
        if (keyQuery.length > 0) {
          key = `${protocol}://${hostname}${path}?${qs.stringify(keyQuery)}`;
        }
      }

      let cacheValue;
      let surrogateValue;
      if (options.age === 0) {
        cacheValue = 'private, max-age=0, no-cacheHelper, no-store, must-revalidate';
        surrogateValue = 'max-age=0';
      } else {
        cacheValue = `public, max-age=${Math.min(options.age, 300)}, must-revalidate`;
        surrogateValue = `max-age=${options.age}`;
      }
      ctx.set('Cache-Control', cacheValue);
      ctx.set('Surrogate-Control', surrogateValue);
      ctx.set('Surrogate-Key', `${hostname} ${key}`);

      const value = await this.cacheHelper.get(key);

      if (value && value.body && value.type) {
        ctx.set('Dobi-Cache', 'HIT');
        const {
          body, isBuffer, lastModified, type,
        } = value;

        if (lastModified) {
          ctx.response.lastModified = lastModified;
        }
        if (ctx.fresh) {
          ctx.status = 304;
          return;
        }

        ctx.set('Content-Type', type);
        ctx.body = isBuffer ? Buffer.from(body) : body;
        return;
      }
      await next();

      if (!ctx.body) {
        return;
      }

      ctx.set('Dobi-Cache', 'MISS');
      const document = await buildDocument(ctx);
      await this.cacheHelper.set(key, document, options.age);
    };
  }
}
