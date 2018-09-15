const express = require('express');
const Cache = require('../lib');

const cacheInstance = new Cache({
  disabled: false,
  redisUri: 'localhost',
});
// console.log({ cache: cacheInstance.middleware.toString(), flushCache: cacheInstance.flushCache });
const cache = (...args) => {
  cacheInstance.middleware(...args);
};

const app = express();
app.get('/', (req, res, next) => {
  cache({ age: '5 minutes' }, (_req, _res, _next) => {
    _next('hello world');
  })(req, res, next);
});

module.exports = app;
