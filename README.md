
== Usage

```js
  const Cache = require('dobi-cache');
  const { cache, flushCache } = new Cache({
    disabled: false,
    keyPrefix: 'myKeyPrefix',
    redisUri: 'localhost'
  });


  app.get('/', (req, res, next) => {
    console.log 'do something'
    cache('5 minutes', (callback) => {
      callback 'hello world'
    })(req, res);
  })


  app.get('/foo', cache('5 minutes', (callback) => {
    next('data');
  });

  app.get('/bar', cache({
    age: 300,
    query: ['name', 'title'],
  });

  app.get('/bar', cache({
    age: '5 minutes'
    query: '*'
  });
```
