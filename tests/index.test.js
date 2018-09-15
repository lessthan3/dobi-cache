jest.setTimeout(100000);
const request = require('supertest');

const app = require('./server');

describe('dobi-cache', () => {
  it('works as a cache', async () => {
    const resp = await request(app).get('/');
    if (!['HIT', 'MISS'].includes(resp.headers['dobi-cache'])) {
      console.error('run redis locally to test');
    }
    expect(['HIT', 'MISS']).toContain(resp.headers['dobi-cache']);
  });

  it('allows bypass', async () => {
    const resp = await request(app).get('/?_=234234234');
    expect(resp.headers['dobi-cache']).not.toBeTruthy();
  });
});
