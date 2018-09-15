'use strict';

const parseUrl = require('parseurl');
const { promisify } = require('util');
const Cache = require('./cache');
const asyncWrapper = require('./asyncWrapper');

module.exports = ({ config, fn, options }) => asyncWrapper(async (req, res) => {
  const fetch = (callback) => {
    const _callback = value => callback(null, value);
    if (fn.length === 1) {
      fn(_callback);
    } else {
      fn(req, res, _callback);
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

  const {
    disabled = false,
    redisUri,
  } = config;

  const {
    headers = {},
    query: optionsQuery,
    qs: optionsQs = '*',
  } = options;

  // connect to redis
  const cache = new Cache({ disabled, redisUri });
  await cache.connect();


  // set headers
  res.set(headers);

  if (disabled || method === 'POST' || skipCache || cache.disabled) {
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

  const value = await cache.get(key);
  if (value) {
    res.set('Dobi-Cache', 'HIT');
    return res.send(value);
  }
  res.set('Dobi-Cache', 'MISS');
  const data = await asyncFetch();
  await cache.set(key, data, options.age);
  return res.send(data);
});
