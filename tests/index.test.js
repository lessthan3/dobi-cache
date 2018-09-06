jest.setTimeout(100000);
const Cache = require('../lib/index.js');
const request = require('supertest');
const express = require('express');

const cache = Cache({
  disabled: false,
});

let app;

beforeAll(() => {
  app = express();
  app.get('/', (req, res, next) => {
    cache({ age: '5 minutes' }, (req, res, next) => {
      next('hello world');
    })(req, res, next);
  });
});

describe('dobi-cache', () => {
  it('works as a cache', async () => {
    const resp = await request(app).get('/');
    expect(['HIT', 'MISS']).toContain(resp.headers['dobi-cache']);
  });

  it('allows bypass', async () => {
    const resp = await request(app).get('/?_=234234234');
    expect(resp.headers['dobi-cache']).not.toBeTruthy();
  });
});
