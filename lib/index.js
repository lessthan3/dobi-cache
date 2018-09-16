'use strict';

const parseUrl = require('parseurl');
const { promisify } = require('util');
const CacheHelper = require('./cacheHelper');
const asyncWrapper = require('./asyncWrapper');

module.exports = class Cache {
  constructor(config) {
    this.config = config;

    // connect to redis
    const { disabled, keyPrefix, redisUri } = config;
    this.cacheHelper = new CacheHelper({ disabled, keyPrefix, redisUri });
    this.flushCache = this.cacheHelper.flushCache.bind(this.cacheHelper);
    this.cache = this.cache.bind(this);
  }

  static configure(_options, _fn) {
    let options = _options;
    let fn = _fn;

    if (!fn) {
      fn = options;
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

    return { fn, options };
  }

  cache(_options, _fn) {
    const { fn, options } = Cache.configure(_options, _fn);

    return asyncWrapper(async (req, res) => {
      const fetch = (callback) => {
        const cb = value => callback(null, value);
        if (fn.length === 1) {
          fn(cb);
        } else {
          fn(req, res, cb);
        }
      };
      const asyncFetch = promisify(fetch);

      await this.cacheHelper.connect();

      const {
        hostname,
        method,
        originalUrl: url,
        protocol,
        query: {
          _: skipCache,
        },
      } = req;

      const { disabled = false } = this.config;

      const {
        headers = {},
        query: optionsQuery,
        qs: optionsQs = '*',
      } = options;

      // set headers
      res.set(headers);

      if (disabled || method === 'POST' || skipCache) {
        const data = await asyncFetch();
        return res.send(data);
      }

      let query = optionsQuery || optionsQs;
      if (typeof query === 'string') {
        query = query.split(',');
      } else if (typeof query === 'boolean') {
        if (query) {
          query = '*';
        } else {
          query = [];
        }
      } else if (query === null) {
        query = [];
      }

      const { pathname: urlNoQuery } = parseUrl(req);

      let key = `${protocol}://${hostname}${urlNoQuery}`;
      if (query.includes('*') >= 0) {
        key = `${protocol}://${hostname}${url}`;
      } else {
        const fields = query.sort();
        if (fields.length > 0) {
          const keyQuery = fields.reduce((arr, field) => {
            if (req.query[field]) {
              return [...arr, `${field}=${req.query[field]}`];
            }
            return arr;
          }, []);
          if (keyQuery.length > 0) {
            key = `${protocol}://${hostname}${urlNoQuery}?${keyQuery.join('&')}`;
          }
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
      res.set('Cache-Control', cacheValue);
      res.set('Surrogate-Control', surrogateValue);
      res.set('Surrogate-Key', `${hostname} ${key}`);

      const value = await this.cacheHelper.get(key);
      if (value) {
        res.set('Dobi-Cache', 'HIT');
        return res.send(value);
      }
      res.set('Dobi-Cache', 'MISS');
      const data = await asyncFetch();
      await this.cacheHelper.set(key, data, options.age);
      return res.send(data);
    });
  }
};
