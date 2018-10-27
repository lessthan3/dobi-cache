const Koa = require('koa');
const Router = require('koa-router');

module.exports = ({ cache, port }) => {
  const app = new Koa();
  const router = new Router();
  router.get('/', cache({ age: '5 minutes' }), (ctx) => {
    ctx.body = 'hello world';
  });
  app.use(router.routes());
  app.use(router.allowedMethods());
  return app.listen(port);
};
