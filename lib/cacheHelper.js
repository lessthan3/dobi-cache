/* eslint-disable no-process-env */

'use strict';

const Redis = require('ioredis');
const isNil = require('lodash/isNil');

module.exports = class CacheHelper {
  constructor({ disabled = false, keyPrefix = 'dobiCache', redisUri }) {
    this.disabled = !(!disabled && redisUri);
    this.redisUri = redisUri;
    this.keyPrefix = keyPrefix;
    this.state = 'initializing';
    this.redis = new Redis(this.redisUri, {
      lazyConnect: true,
      showFriendlyErrorStack: process.env.NODE_ENV !== 'production',
    });
  }

  isDisabled() {
    return this.disabled || this.state !== 'connected';
  }

  async connect() {
    if (this.disabled || this.state !== 'initializing') {
      return;
    }
    try {
      this.state = 'pending';
      await this.redis.connect();
      this.state = 'connected';
    } catch (err) {
      this.state = 'disconnected';
      // eslint-disable-next-line no-console
      console.warn(`redis server not found, cache disabled: ${this.redisUri}`);
    }
  }

  async flushCache() {
    if (this.isDisabled()) {
      return 0;
    }
    const keys = await this.redis.keys(`${this.keyPrefix}:*`);
    const flushed = [];
    const promises = keys.map(async (key) => {
      flushed.push(await this.redis.del(key));
    });

    await Promise.all(promises);
    return flushed.reduce((total, item) => (total + item), 0);
  }

  getKey(key) {
    return `${this.keyPrefix}:${key}`;
  }

  async delete(key) {
    if (this.isDisabled()) {
      return null;
    }
    return this.redis.del(this.getKey(key));
  }

  async get(key) {
    if (this.isDisabled()) {
      return null;
    }
    try {
      const document = await this.redis.get(this.getKey(key));
      if (!document) {
        return null;
      }
      const { value, type } = JSON.parse(document);
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

    if (isNil(value) || this.isDisabled()) {
      return;
    }

    if (typeof value === 'object') {
      type = 'object';
      value = JSON.stringify(value);
    } else {
      type = 'primitive';
    }
    await this.redis.set(this.getKey(key), JSON.stringify({ type, value }));
    await this.redis.expire(this.getKey(key), ttl);
  }
};
