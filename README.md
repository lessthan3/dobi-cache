
== Usage

```
  cache = require('dobi-cache')(config)
  app.get '/', (req, res, next) ->
    console.log 'do something'
    cache('5 minutes', (next) ->
      next 'hello world'
    )(req, res, next)

  app.get '/foo', cache '5 minutes', (next) ->
    next 'data'

  app.get '/bar', cache {
    age: 300
    query: ['name', 'title']
  }

  app.get '/bar', cache {
    age: '5 minutes'
    query: '*'
  }
```
