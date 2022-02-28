import {Context} from 'koa';
import isJSON from 'koa-is-json';
import streamToArray from 'stream-to-array';
import { createHash } from 'crypto'

export interface ICacheHeaders {
  etag: string;
  lastModified: number;
}

export interface ICacheData {
  body: string | Buffer;
  etag: string;
  isBuffer: boolean;
  lastModified: number;
  type: string | null
}

export const generateCacheData = async (ctx: Context): Promise<ICacheData> => {
  const type = ctx.response.get('Content-Type') || null;
  let outputBody = ctx.body;
  if (isJSON(ctx.body)) {
    outputBody = JSON.stringify(outputBody);
  }
  if (typeof ctx.body.pipe === 'function') {
    const streamArray = await streamToArray(outputBody);
    outputBody = Buffer.concat(streamArray)
  }

  return {
    body: outputBody,
    etag: createHash('md5').update(outputBody).digest('hex'),
    isBuffer: Buffer.isBuffer(outputBody),
    lastModified: Date.now(),
    type,
  };
}
