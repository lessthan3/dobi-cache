const express = require('express');
const { middleware: Cache } = require('../lib/index');

const cache = Cache({
  disabled: false,
  redisUri: 'localhost',
});

const app = express();
app.get('/', (req, res, next) => {
  cache({ age: '5 minutes' }, (_req, _res, _next) => {
    _next('hello world');
  })(req, res, next);
});

module.exports = app;
