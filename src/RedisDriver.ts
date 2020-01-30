import Redis from 'ioredis';
import { ICacheHeaders, ICacheData } from './utils'

interface IConstructor {
  enabled: boolean;
  keyPrefix: string;
  redisUri: string;
}

class RedisDriver {
  private readonly _enabled!: boolean;
  private readonly _keyPrefix!: string;
  private _redis!: Redis.Redis;
  private readonly _redisUri!: string;

  constructor(params: IConstructor) {
    this._enabled = params.enabled;
    this._redisUri = params.redisUri;
    this._keyPrefix = params.keyPrefix;
    if (this._enabled) {
      this._redis = new Redis(this._redisUri, {
        showFriendlyErrorStack: process.env.NODE_ENV !== 'production',
      });
    }
  }

  async delete(key: string): Promise<number> {
    if (!this._enabled) {
      return 0;
    }
    let deleted = 0;
    deleted += await this._redis.del(this.generateHeadersKey(key));
    deleted += await this._redis.del(this.generateDataKey(key));
    return deleted;
  }

  async flushCache(): Promise<number> {
    if (!this._enabled) {
      return 0;
    }

    const stream = this._redis.scanStream({
      count: 500,
      match: `${this._keyPrefix}*`,
    })

    let count = 0;
    stream.on('data', (keys: string[]) => {
      if (keys.length) {
        count += keys.length;
        const pipeline = this._redis.pipeline();
        keys.forEach((key) => pipeline.del(key));
        pipeline.exec();
      }
    })

    return new Promise((resolve, reject) => {
      stream.once('end', () => {
        resolve(count);
      })
      stream.once('error', (error) => {
        reject(error);
      })
    })

  }

  async getData(key: string): Promise<ICacheData | null> {
    return this.get(this.generateDataKey(key))
  }

  async getHeaders(key: string): Promise<ICacheHeaders | null> {
    return this.get(this.generateHeadersKey(key))
  }

  async setData(key: string, value: ICacheData, ttl: number): Promise<void> {
    await this.set(this.generateDataKey(key), value, ttl);
  }

  async setHeaders(key: string, value: ICacheHeaders, ttl: number): Promise<void> {
    await this.set(this.generateHeadersKey(key), value, ttl);
  }

  private generateBaseKey(key: string): string {
    return `${this._keyPrefix}:${key}`;
  }

  private generateDataKey(key: string): string {
    return `${this.generateBaseKey(key)}:data`;
  }

  private generateHeadersKey(key: string): string {
    return `${this.generateBaseKey(key)}:headers`;
  }

  private async get<T>(key: string): Promise<T | null> {
    if (!this._enabled) {
      return null;
    }

    const cacheValue = await this._redis.get(key);
    if (!cacheValue) {
      return null;
    }

    try {
      return JSON.parse(cacheValue) as T;
    } catch (err) {
      await this.delete(key);
      return null;
    }
  }

  private async set(key: string, value: object, ttl: number): Promise<void> {
    if (!this._enabled) {
      return;
    }
    await this._redis.setex(key, ttl, JSON.stringify(value));
  }
}

export default RedisDriver;
