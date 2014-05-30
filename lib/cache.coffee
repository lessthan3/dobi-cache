###
  Usage

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
###

# dependencies
MongoCache = require 'mongo-cache'

# exports
exports = (config) ->

  # defaults
  config.disabled ?= false

  # setup
  cache = new MongoCache config.mongo

  # middleware
  (options, fn) ->

    # if only one argument, assume it's the function
    # and default options to 5 minutes
    [options, fn] = ['5 minutes', options] unless fn

    # if options is a string, convert it to an object
    if typeof options is 'string'
      options = {age: options}

    # if options.age is a string, convert it to seconds
    if typeof options.age is 'string'
      [age, type] = options.age.split ' '
      age = parseInt age, 10
      switch type
        when 'minute', 'minutes'  then age *= 60
        when 'hour', 'hours'      then age *= 3600
        when 'day', 'days'        then age *= 86400
        when 'week', 'weeks'      then age *= 604800
      options.age = age

    # handle request
    (req, res, next) ->

      # if disabled, don't use cache
      if options.disabled
        if fn.length == 1
          fn (data) ->
            res.send data
        else
          fn req, req, (data) ->
            res.send data
        return

      # setup cache key
      protocol = req.protocol
      host = req.get 'host'
      url = req.originalUrl
      url_noquery = req._parsedUrl.pathname

      key = "#{protocol}://#{host}#{url_noquery}"
      options.query ?= '*'

      # allow comma separated fields
      if typeof options.query is 'string'
        options.query = options.query.split ','

      # use null or empty array to specify no query params
      if options.query == null
        options.query = []

      # include all query parameters if '*'
      if '*' in options.query
        key = "#{protocol}://#{host}#{url}"

      # else only cache with specific parameters
      else
        fields = options.query.sort()
        if fields.length > 0
          query = []
          for k in fields
            v = req.query[k]
            query.push "#{k}=#{v}" if v
          if query.length > 0
            key = "#{protocol}://#{host}#{url_noquery}?#{query.join '&'}"

      # headers
      val = 'private, max-age=0, no-cache, no-store, must-revalidate'
      if options.age == 0
        cval = 'private, max-age=0, no-cache, no-store, must-revalidate'
        sval = 'max-age=0'
      else
        # max browser cache is 5 minutes, but store anything on fastly
        cval = "public, max-age=#{Math.min options.age, 300}, must-revalidate"
        sval = "max-age=#{options.age}"

      res.set 'Cache-Control', cval
      res.set 'Surrogate-Control', sval
      res.set 'Surrogate-Key', "#{host} #{key}"

      # check cache
      mcache.get key, (err, value) ->
        return res.send value if value
        set = (data) ->
          mcache.set key, data, options.age, (err) ->
            res.send data
        if fn.length == 1
          fn set
        else
          fn req, req, set



