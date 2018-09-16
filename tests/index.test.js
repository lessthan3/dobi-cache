'use strict';

jest.setTimeout(100000);
const request = require('supertest');
const Cache = require('../lib');

const appGenerator = require('./server');

const cacheFlushTester = new Cache({
  disabled: false,
  keyPrefix: 'flushTest',
  redisUri: 'localhost',
});

const cacheServer = new Cache({
  disabled: false,
  redisUri: 'localhost',
});

const cacheDisconnected = new Cache({
  disabled: false,
  redisUri: 'failfailfail',
});

let connectedApp;
let disconnectedApp;
beforeAll(async () => {
  await cacheFlushTester.cacheHelper.connect();
  const promises = ['a', 'b', 'c', 'd'].map(async (key) => {
    await cacheFlushTester.cacheHelper.set(key, `value:${key}`, 300);
  });
  await Promise.all(promises);

  await cacheServer.cacheHelper.connect();
  await cacheServer.flushCache();

  connectedApp = appGenerator(cacheServer.cache);
  disconnectedApp = appGenerator(cacheDisconnected.cache);
});

describe('dobi-cacheHelper', () => {
  it('works as a cacheHelper', async () => {
    const resp = await request(connectedApp).get('/');
    expect(resp.headers['dobi-cache']).toBe('MISS');

    const resp2 = await request(connectedApp).get('/');
    if (resp2.headers['dobi-cache'] === 'MISS') {
      console.error('run redis locally to test');
    }
    expect(resp2.headers['dobi-cache']).toBe('HIT');
  });

  it('allows bypass', async () => {
    const resp = await request(connectedApp).get('/?_=234234234');
    expect(resp.headers['dobi-cache']).not.toBeTruthy();
  });

  it('flushes correctly', async () => {
    const result = await cacheFlushTester.flushCache();
    expect(result).toBeGreaterThanOrEqual(4);
  });

  it('doesn\'t crash if not connected to redis', async () => {
    const resp = await request(disconnectedApp).get('/');
    expect(resp.headers['dobi-cache']).toBe('MISS');
  });
});
