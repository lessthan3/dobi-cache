const Koa = require('koa');
const Router = require('koa-router');

module.exports = ({ cache, port }) => {
  const app = new Koa();
  const router = new Router();
  router.get('/bigtext', cache({ age: '5 minutes' }), (ctx) => {
    ctx.set('content-type', 'text/plain');
    const output = [];
    for (let i = 0; i < 2048; i++) {
      output.push(' ');
    }
    ctx.body = Buffer.from(output.join(''));
  });
  router.get('/', cache({ age: '5 minutes' }), (ctx) => {
    ctx.body = 'hello world';
  });
  app.use(router.routes());
  app.use(router.allowedMethods());
  return app.listen(port);
};
