'use strict';

jest.setTimeout(100000);
const request = require('supertest');
const Cache = require('../dist').default;
const prefix = "flushTest"
const appGenerator = require('./server');

const cacheFlushTester = new Cache({
  enabled: true,
  keyPrefix: prefix,
  redisModeMap: { 'localhost': 'clustered'},
  redisPort: 30001,
  redisUri: 'localhost',
});

const cacheDisabled = new Cache({
  enabled: false,
  keyPrefix: prefix,
  redisUri: 'localhost',
});

const cacheServer = new Cache({
  enabled: true,
  keyPrefix: prefix,
  redisUri: 'localhost',
});

const cacheDisconnected = new Cache({
  enabled: false,
  keyPrefix: prefix,
  redisUri: 'failfailfail',
});

let connectedApp;
let disconnectedApp;
let disabledApp;
beforeAll(async () => {
  const promises = ['a', 'b', 'c', 'd'].map(async (key) => {
    await cacheFlushTester._redisDriver.set(`${prefix}:key:${key}`, `value:${key}`, 300);
  });
  await Promise.all(promises);

  await cacheServer.flushCache();

  connectedApp = appGenerator({ cache: cacheServer.cache, port: 4200 });
  disconnectedApp = appGenerator({ cache: cacheDisconnected.cache, port: 4201 });
  disabledApp = appGenerator({ cache: cacheDisabled.cache, port: 4202 });
});

afterAll(() => {
  if (connectedApp) {
    connectedApp.close();
  }
  if (disabledApp) {
    disconnectedApp.close();
  }
  if (disabledApp) {
    disabledApp.close();
  }
});

describe('dobi-cacheHelper', () => {
  it('works as a cacheHelper', async () => {
    const small = await request(connectedApp).get('/');
    expect(small.headers['x-dobi-cache']).toBe('MISS');
    const small2 = await request(connectedApp).get('/');
    expect(small2.headers['x-dobi-cache']).toBe('HIT');
  });

  it('compresses large objects', async () => {
    const big = await request(connectedApp).get('/bigtext');
    expect(big.headers['x-dobi-cache']).toBe('MISS');
    const firstResponse = big.text;
    const big2 = await request(connectedApp).get('/bigtext');
    expect(big2.headers['x-dobi-cache']).toBe('HIT');
    expect(big2.text).toEqual(firstResponse);
  });

  it('caches params separately', async () => {
    const big = await request(connectedApp).get('/?name=one');
    const firstResponse = big.text;
    const big2 = await request(connectedApp).get('/?name=two');
    expect(big2.headers['x-dobi-cache']).toBe('MISS');
    expect(big2.text).not.toEqual(firstResponse);
  });

  it('caches dependent of param order', async () => {
    const req1 = await request(connectedApp).get('/?name=one&style=hello&alpha=foo');
    const firstResponse = req1.text;
    const req2 = await request(connectedApp).get('/?style=hello&alpha=foo&name=one');
    expect(req2.headers['x-dobi-cache']).toBe('HIT');
    const req3 = await request(connectedApp).get('/?style=hello&name=one&alpha=foo');
    expect(req3.headers['x-dobi-cache']).toBe('HIT');
  });

  it('works if disabled', async () => {
    const resp = await request(disabledApp).get('/');
    expect(resp.headers['x-dobi-cache']).toBe(undefined);
    expect(resp.text).toBe('hello world');
    const resp2 = await request(disabledApp).get('/');
    expect(resp2.headers['x-dobi-cache']).toBe(undefined);
    expect(resp2.text).toBe('hello world');
  });

  it('allows bypass', async () => {
    const resp = await request(connectedApp).get('/?_=234234234');
    expect(resp.headers['x-dobi-cache']).not.toBeTruthy();
    expect(resp.text).toBe('hello world');
  });

  it('flushes correctly', async () => {
    const result = await cacheFlushTester.flushCache();
    expect(result).toBeGreaterThanOrEqual(4);
  });

  it('doesn\'t crash if not connected to redis', async () => {
    const resp = await request(disconnectedApp).get('/');
    expect(resp.headers['x-dobi-cache']).toBe(undefined);
    expect(resp.text).toBe('hello world');
  });
});
