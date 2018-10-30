const Koa = require('koa');
const Router = require('koa-router');

const date = Math.round(Date.now() / 1000);
module.exports = ({ cache, port }) => {
  const app = new Koa();
  const router = new Router();
  router.get('/bigtext', cache({ age: '5 minutes' }), (ctx) => {
    ctx.set('content-type', 'text/plain');
    const output = [];
    for (let i = 0; i < 2048; i++) {
      output.push(' ');
    }
    ctx.etag = 'bigtextEtag';
    ctx.body = Buffer.from(output.join(''));
    ctx.lastModified = new Date(date * 1000);
  });
  router.get('/', cache({ age: '5 minutes' }), (ctx) => {
    ctx.etag = 'rootEtag';
    ctx.body = 'hello world';
    ctx.lastModified = new Date(date * 1000);
  });
  app.use(router.routes());
  app.use(router.allowedMethods());
  return app.listen(port);
};
