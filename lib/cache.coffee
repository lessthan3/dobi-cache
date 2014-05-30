
# dependencies
MongoCache = require 'mongo-cache'

# exports
module.exports = exports = (config) ->

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

      fetch = (callback) ->
        if fn.length == 1
          fn callback
        else
          fn req, req, callback

      # if disabled, don't use cache
      return fetch(res.send) if config.disabled

      # if it's a POST, don't use cache
      return fetch(res.send) if req.method is 'POST'

      # setup cache key
      protocol = req.protocol
      host = req.get 'host'
      url = req.originalUrl
      url_noquery = req._parsedUrl.pathname

      key = "#{protocol}://#{host}#{url_noquery}"
      options.query ?= options.qs
      options.query ?= '*'

      # allow comma separated fields
      if typeof options.query is 'string'
        options.query = options.query.split ','

      # allow boolean for all or no query params
      if typeof options.query is 'boolean'
        if options.query
          options.query = '*'
        else
          options.query = null

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
      cache.get key, (err, value) ->
        return res.send value if value
        fetch (data) ->
          cache.set key, data, options.age, (err) ->
            res.send data



