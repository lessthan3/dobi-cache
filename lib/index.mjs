import isJSON from 'koa-is-json';
import bytes from 'bytes';
import streamToArray from 'stream-to-array';
import qs from 'querystring';
import { promisify } from 'util';
import zlib from 'zlib';
import compressible from 'compressible';
import CacheHelper from './cacheHelper';

const compress = promisify(zlib.gzip);

const buildDocument = async (ctx) => {
  let { body } = ctx;
  if (isJSON(body)) {
    body = JSON.stringify(body);
  }
  if (typeof body.pipe === 'function') {
    const arr = await streamToArray(body);
    body = Buffer.concat(arr);
  }
  return {
    body,
    etag: ctx.response.get('etag') || null,
    lastModified: ctx.response.lastModified || null,
    type: ctx.response.get('Content-Type') || null,
  };
};

export default class Cache {
  /**
   * @param {Object} config
   * @param {boolean} config.enabled=true
   * @param {string} config.keyPrefix=dobiCache prefix for redis keys
   * @param {number} config.lruMaxItems max number of lru items
   * @param {string} config.redisUri uri for redis server
   * @param {string} config.threshold threshold before compressor kicks in
   */
  constructor({
    enabled = true,
    keyPrefix = 'dobiCacheV2',
    lruMaxItems = 100,
    redisUri,
    threshold = '1kb',
  }) {
    // connect to redis
    this.enabled = enabled;
    this.threshold = bytes(threshold);
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
          body, etag, gzip, lastModified,
        } = value;

        if (lastModified) {
          ctx.response.lastModified = lastModified;
        }
        if (etag) {
          ctx.response.etag = etag;
        }
        if (ctx.fresh) {
          ctx.status = 304;
          return;
        }

        const isGzip = gzip && ctx.request.acceptsEncodings('gzip', 'identity') === 'gzip';
        ctx.set('Content-Encoding', isGzip ? 'gzip' : 'identity');
        ctx.body = isGzip ? Buffer.from(gzip) : body;
        return;
      }
      await next();

      if (!ctx.body) {
        return;
      }

      if ((ctx.response.get('Content-Encoding') || 'identity') !== 'identity') {
        throw new Error('Place koa-cache below any compression middleware.');
      }
      ctx.set('Dobi-Cache', 'MISS');
      const document = await buildDocument(ctx);
      if (compressible(document.type) && ctx.response.length >= this.threshold) {
        document.gzip = await compress(ctx.body);
        if (ctx.request.acceptsEncodings('gzip', 'identity') === 'gzip') {
          ctx.body = document.gzip;
          ctx.set('Content-Encoding', 'gzip');
        }
      }

      if (!ctx.response.get('Content-Encoding')) {
        ctx.set('Content-Encoding', 'identity');
      }

      await this.cacheHelper.set(key, document, options.age);
    };
  }
}
