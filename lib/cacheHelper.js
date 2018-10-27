/* eslint-disable no-process-env */

'use strict';

const Redis = require('ioredis');
const isNil = require('lodash/isNil');
const LRU = require('lru-cache');

module.exports = class CacheHelper {
  /**
   * @param {Object} config
   * @param {boolean} config.enabled=true
   * @param {string} config.keyPrefix=dobiCache prefix for redis keys
   * @param {number} config.lruMaxItems max number of lru items
   * @param {string} config.redisUri uri for redis server
   */
  constructor({
    enabled,
    keyPrefix = 'dobiCache',
    lruMaxItems: max = 100,
    redisUri,
  }) {
    this.enabled = enabled;
    this.redisUri = redisUri;
    this.keyPrefix = keyPrefix;
    this.redisState = 'initializing';
    this.lru = LRU({ max });
    this.redis = new Redis(this.redisUri, {
      lazyConnect: true,
      showFriendlyErrorStack: process.env.NODE_ENV !== 'production',
    });
  }

  isDisabled() {
    return !(this.enabled && this.method);
  }

  async connect() {
    if (!this.enabled || this.redisState !== 'initializing') {
      return;
    }
    try {
      this.redisState = 'pending';
      await this.redis.connect();
      this.redisState = 'connected';
      this.method = 'redis';
    } catch (err) {
      this.redisState = 'disconnected';
      this.method = 'lru';
      // eslint-disable-next-line no-console
      console.warn(`redis server not found: ${this.redisUri}. using LRU cache`);
    }
  }

  async getKeys(pattern = '*') {
    if (this.isDisabled()) {
      return [];
    }

    let keys = [];
    if (this.method === 'redis') {
      keys = await this.redis.keys(`${this.keyPrefix}:${pattern}`);
    } else {
      keys = this.lru.keys();
    }
    return keys.map(key => (
      key.replace(new RegExp(`^${this.keyPrefix}:`), '')
    ));
  }

  async flushCache(pattern) {
    if (this.isDisabled()) {
      return 0;
    }
    const keys = await this.getKeys(pattern);
    const flushed = [];
    const promises = keys.map(async (key) => {
      flushed.push(await this.delete(key));
    });

    await Promise.all(promises);
    return flushed.reduce((total, item) => (total + item), 0);
  }

  buildKey(key) {
    return `${this.keyPrefix}:${key}`;
  }

  async delete(key) {
    if (this.isDisabled()) {
      return null;
    }
    const itemKey = this.buildKey(key);
    if (this.method === 'redis') {
      return this.redis.del(itemKey);
    }
    const result = this.lru.peek(itemKey) ? 1 : 0;
    this.lru.del(itemKey);
    return result;
  }

  async get(key) {
    if (this.isDisabled()) {
      return null;
    }
    try {
      let document;
      if (this.method === 'redis') {
        document = await this.redis.get(this.buildKey(key));
      } else {
        document = this.lru.get(this.buildKey(key));
      }
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

    const itemKey = this.buildKey(key);
    const itemValue = JSON.stringify({ type, value });
    if (this.method === 'redis') {
      await this.redis.set(itemKey, itemValue);
      await this.redis.expire(itemKey, ttl);
    } else {
      this.lru.set(itemKey, itemValue, ttl * 1000);
    }
  }
};
