
== Usage

```
  cacheHelper = require('dobi-cacheHelper')(config)
  app.get '/', (req, res, next) ->
    console.log 'do something'
    cacheHelper('5 minutes', (next) ->
      next 'hello world'
    )(req, res, next)

  app.get '/foo', cacheHelper '5 minutes', (next) ->
    next 'data'

  app.get '/bar', cacheHelper {
    age: 300
    query: ['name', 'title']
  }

  app.get '/bar', cacheHelper {
    age: '5 minutes'
    query: '*'
  }
```
