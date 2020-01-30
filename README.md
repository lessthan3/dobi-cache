
# USAGE

```js
  const Cache = require('dobi-cache');
  const { cache, flushCache } = new Cache({
    disabled: false,
    keyPrefix: 'myKeyPrefix',
    redisUri: 'localhost'
  });


  app.get('/', cache('5 minutes'), (ctx) => {
    ctx.body = 'hello world'
  })

  app.get('/bar', cache({
    age: 300,
    query: ['name', 'title'],
  });

  app.get('/bar', cache({
    age: '5 minutes',
    query: '*'
  });
```
