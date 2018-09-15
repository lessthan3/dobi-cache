'use strict';

const parseUrl = require('parseurl');
const { promisify } = require('util');
const CacheHelper = require('./cache');
const asyncWrapper = require('./asyncWrapper');

module.exports = class Cache {
  constructor(config) {
    console.log({ config });
    this.config = config;
    this.flushCache = async () => {
      // eslint-disable-next-line no-console
      console.error('dobi-cache disabled');
    };

    // connect to redis
    const { disabled, redisUri } = config;
    this.cache = new CacheHelper({ disabled, redisUri });
    this.cache.connect().then(() => {
      if (!this.cache.disabled) {
        this.flushCache = this.cache.flushCache;
      }
    });
  }

  middleware(_options, _fn) {
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

    return (req, res) => asyncWrapper(async (req, res) => {
      console.log('hit');
      await this.cache.connect();
      const fetch = (callback) => {
        const cb = value => callback(null, value);
        if (fn.length === 1) {
          fn(cb);
        } else {
          fn(req, res, cb);
        }
      };
      const asyncFetch = promisify(fetch);

      const {
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

      if (disabled || method === 'POST' || skipCache || this.cache.disabled) {
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

      const host = req.get('host');
      const { pathname: urlNoQuery } = parseUrl(req);

      let key = `${protocol}://${host}${urlNoQuery}`;
      if (query.includes('*') >= 0) {
        key = `${protocol}://${host}${url}`;
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
            key = `${protocol}://${host}${urlNoQuery}?${keyQuery.join('&')}`;
          }
        }
      }

      let cacheValue;
      let surrogateValue;
      if (options.age === 0) {
        cacheValue = 'private, max-age=0, no-cache, no-store, must-revalidate';
        surrogateValue = 'max-age=0';
      } else {
        cacheValue = `public, max-age=${Math.min(options.age, 300)}, must-revalidate`;
        surrogateValue = `max-age=${options.age}`;
      }
      res.set('Cache-Control', cacheValue);
      res.set('Surrogate-Control', surrogateValue);
      res.set('Surrogate-Key', `${host} ${key}`);

      const value = await this.cache.get(key);
      if (value) {
        res.set('Dobi-Cache', 'HIT');
        return res.send(value);
      }
      res.set('Dobi-Cache', 'MISS');
      const data = await asyncFetch();
      await this.cache.set(key, data, options.age);
      return res.send(data);
    })(res, req);
  }
};
