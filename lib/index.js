'use strict';

const { flushCache, middleware } = require('./middleware');

const fn = (_config) => {
  const config = _config;
  return (_options, _fn) => {
    let options = _options;
    let fn = _fn;
    if (!fn) {
      fn = options;
      options = '5 minutes';
    }
    if (typeof options === 'string') {
      options = { age: options };
    }
    if (typeof options.age === 'string') {
      const [ageString, type] = options.age.split(' ');
      let age = Number.parseInt(ageString, 10);
      switch (type) {
        case 'minute':
        case 'minutes': {
          age *= 60;
          break;
        }
        case 'hour':
        case 'hours': {
          age *= 3600;
          break;
        }
        case 'day':
        case 'days': {
          age *= 86400;
          break;
        }
        case 'week':
        case 'weeks': {
          age *= 604800;
          break;
        }
        default: {
          break;
        }
      }
      options.age = age;
    }
    return middleware({ config, fn, options });
  };
};

module.exports = {
  flushCache,
  middleware,
};
