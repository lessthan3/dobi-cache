const MongoCache = require('dobi-mongo-cache');
const parseUrl = require('parseurl');

module.exports = (_config) => {
  const config = _config;
  const cache = new MongoCache(config.mongo);
  if (config.disabled == null) {
    config.disabled = false;
  }
  return (_options, _fn) => {
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
      const parts = options.age.split(' ');
      const type = parts[1];
      let age = parseInt(parts[0], 10);
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
    return function (req, res) {
      const fetch = function (callback) {
        if (fn.length === 1) {
          return fn(callback);
        }
        return fn(req, res, callback);
      };

      // set headers
      if (options.headers == null) {
        options.headers = {};
      }
      res.set(options.headers);

      if (config.disabled) {
        return fetch(d => res.send(d));
      }
      if (req.method === 'POST') {
        return fetch(d => res.send(d));
      }
      if (req.query._) {
        return fetch(d => res.send(d));
      }

      if (options.query == null) {
        options.query = options.qs;
      }
      if (options.query == null) {
        options.query = '*';
      }
      if (typeof options.query === 'string') {
        options.query = options.query.split(',');
      }
      if (typeof options.query === 'boolean') {
        if (options.query) {
          options.query = '*';
        } else {
          options.query = null;
        }
      }
      if (options.query === null) {
        options.query = [];
      }

      const {
        originalUrl: url,
        protocol,
      } = req;
      const host = req.get('host');
      const urlNoQuery = parseUrl(req).pathname;

      let key = `${protocol}://${host}${urlNoQuery}`;
      if (options.query.includes('*') >= 0) {
        key = `${protocol}://${host}${url}`;
      } else {
        const fields = options.query.sort();
        if (fields.length > 0) {
          const query = [];
          for (let i = 0; i < fields.length; i++) {
            const k = fields[i];
            const v = req.query[k];
            if (v) {
              query.push(`${k}=${v}`);
            }
          }
          if (query.length > 0) {
            key = `${protocol}://${host}${urlNoQuery}?${query.join('&')}`;
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

      return cache.get(key, (err, value) => {
        if (value) {
          res.set('Dobi-Cache', 'HIT');
          return res.send(value);
        }
        res.set('Dobi-Cache', 'MISS');
        return fetch(data => cache.set(key, data, options.age, () => res.send(data)));
      });
    };
  };
};
