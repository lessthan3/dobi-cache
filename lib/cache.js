/* eslint-disable no-process-env */

'use strict';

const Redis = require('ioredis');
const { isNil } = require('lodash');

class Cache {
  constructor({ disabled = false, redisUri }) {
    this.disabled = disabled;
    this.redisUri = redisUri;
  }

  async connect() {
    if (this.redis || this.disabled) {
      return;
    }
    const { redisUri } = this;
    try {
      this.redis = new Redis(redisUri, {
        lazyConnect: true,
        showFriendlyErrorStack: process.env.NODE_ENV === 'production',
      });
      await this.redis.connect();
      this.disabled = false;
    } catch (err) {
      // eslint-disable-next-line
      console.warn(`redis server not found, cache disabled: ${redisUri}`)
    }
  }

  async flushCache() {
    const keys = this.redis.keys('dobiCache:*');
    for (const key of keys) {
      await this.delete(key);
    }
  }

  static getKey(key) {
    return `dobiCache:${key}`;
  }

  async delete(key) {
    if (this.disabled) {
      return null;
    }
    return this.redis.del(Cache.getKey(key));
  }

  async get(key) {
    if (this.disabled) {
      return null;
    }
    try {
      const { type, value } = await this.redis.get(Cache.getKey(key));
      if (type === 'object') {
        return JSON.parse(value);
      }
      return value;
    } catch (err) {
      await this.delete(key);
      return null;
    }
  }

  async set(key, _value, ttl) {
    let value = _value;
    let type;

    if (isNil(value)) {
      return;
    }

    if (typeof value === 'object') {
      type = 'object';
      value = JSON.stringify(value);
    } else {
      type = 'primitive';
    }

    if (this.disabled) {
      return;
    }
    await this.redis.set(Cache.getKey(key), JSON.stringify({ type, value }));
    await this.redis.expire(key, ttl);
  }
}

module.exports = Cache;
