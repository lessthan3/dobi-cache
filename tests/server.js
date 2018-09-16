const express = require('express');

module.exports = (cache) => {
  const app = express();
  app.get('/', (req, res, next) => {
    cache({ age: '5 minutes' }, (_req, _res, _next) => {
      _next('hello world');
    })(req, res, next);
  });
  return app;
};
