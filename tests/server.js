const Koa = require('koa');
const Router = require('koa-router');
const { Readable } = require('stream');

const run = ({ cache, port }) => {
  const app = new Koa();
  const router = new Router();
  router.get('/bigtext', cache({ age: '5 minutes' }), (ctx) => {
    const { name = 'defaultName' } = ctx.request.query;
    ctx.set('content-type', 'text/plain');
    const r = new Readable()
    ctx.body = r;
    for (let i = 0; i < 2048; i++) {
      r.push(name);
    }
    r.push(null);

  });
  router.get('/', cache({ age: '5 minutes' }), (ctx) => {
    ctx.body = ctx.request.query.name || 'hello world';
  });
  app.use(router.routes());
  app.use(router.allowedMethods());
  return app.listen(port);
};

module.exports = run;
