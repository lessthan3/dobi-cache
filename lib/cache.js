/* eslint-disable no-process-env */

'use strict';

const Redis = require('ioredis');

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

  async delete(key) {
    if (this.disabled) {
      return null;
    }
    return this.redis.del(key);
  }

  async get(key) {
    if (this.disabled) {
      return null;
    }
    return this.redis.get(key);
  }

  async set(key, value, ttl) {
    if (this.disabled) {
      return null;
    }
    return this.redis.setex(key, ttl, value);
  }
}

module.exports = Cache;
