'use strict';

jest.setTimeout(100000);
const request = require('supertest');
const Cache = require('../lib').default;

const appGenerator = require('./server');

const cacheFlushTester = new Cache({
  enabled: true,
  keyPrefix: 'flushTest',
  redisUri: 'localhost',
});

const cacheDisabled = new Cache({
  enabled: false,
  keyPrefix: 'flushTest',
  redisUri: 'localhost',
});

const cacheServer = new Cache({
  enabled: true,
  redisUri: 'localhost',
});

const cacheDisconnected = new Cache({
  enabled: true,
  redisUri: 'failfailfail',
});

let connectedApp;
let disconnectedApp;
let disabledApp;
beforeAll(async () => {
  await cacheFlushTester.cacheHelper.connect();
  const promises = ['a', 'b', 'c', 'd'].map(async (key) => {
    await cacheFlushTester.cacheHelper.set(key, `value:${key}`, 300);
  });
  await Promise.all(promises);

  await cacheServer.cacheHelper.connect();
  await cacheServer.flushCache();

  connectedApp = appGenerator({ cache: cacheServer.cache, port: 3000 });
  disconnectedApp = appGenerator({ cache: cacheDisconnected.cache, port: 3001 });
  disabledApp = appGenerator({ cache: cacheDisabled.cache, port: 3002 });
});

afterAll(() => {
  connectedApp.close();
  disconnectedApp.close();
  disabledApp.close();
});

describe('dobi-cacheHelper', () => {
  it('works as a cacheHelper', async () => {
    const small = await request(connectedApp).get('/');
    expect(small.headers['dobi-cache']).toBe('MISS');
    const small2 = await request(connectedApp).get('/');
    expect(small2.headers['dobi-cache']).toBe('HIT');
  });

  it('compresses large objects', async () => {
    const big = await request(connectedApp).get('/bigtext');
    expect(big.headers['dobi-cache']).toBe('MISS');
    expect(big.headers['content-encoding']).toEqual('gzip');
    const big2 = await request(connectedApp).get('/bigtext');
    expect(big2.headers['dobi-cache']).toBe('HIT');
    expect(big2.headers['content-encoding']).toEqual('gzip');
  });

  it('works if disabled', async () => {
    const resp = await request(disabledApp).get('/');
    expect(resp.headers['dobi-cache']).toBe(undefined);
    expect(resp.text).toBe('hello world');
    const resp2 = await request(disabledApp).get('/');
    expect(resp2.headers['dobi-cache']).toBe(undefined);
    expect(resp2.text).toBe('hello world');
  });

  it('allows bypass', async () => {
    const resp = await request(connectedApp).get('/?_=234234234');
    expect(resp.headers['dobi-cache']).not.toBeTruthy();
    expect(resp.text).toBe('hello world');
  });

  it('flushes correctly', async () => {
    const result = await cacheFlushTester.flushCache();
    expect(result).toBeGreaterThanOrEqual(4);
  });

  it('doesn\'t crash if not connected to redis', async () => {
    const resp = await request(disconnectedApp).get('/');
    expect(resp.headers['dobi-cache']).toBe('MISS');
    expect(resp.text).toBe('hello world');
  });
});
