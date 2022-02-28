import Redis from 'ioredis';
import { ICacheHeaders, ICacheData } from './utils'

interface IConstructor {
  enabled: boolean;
  keyPrefix: string;
  redisModeMap: Record<string, string>;
  redisPort?: number;
  redisUri: string;
}

const connectionMap: Record<string, Redis.Redis | Redis.Cluster> = {};

export enum RedisMode {
  CLUSTERED = 'clustered',
  SINGLE = 'single',
}

class RedisDriver {
  private readonly _enabled!: boolean;
  private readonly _keyPrefix!: string;
  private _redis!: Redis.Redis | Redis.Cluster;
  private _redisMode!: RedisMode;

  constructor(params: IConstructor) {
    this._enabled = params.enabled;
    this._keyPrefix = params.keyPrefix;
    if (this._enabled) {
      const { client, redisMode } = this.getClient(params);
      this._redis = client;
      this._redisMode = redisMode;
    } else {
      this._redisMode = RedisMode.SINGLE;
    }
  }

  private static createInstance(redisUri: string, port: number, redisMode: string): Redis.Redis | Redis.Cluster {
    // tslint:disable-next-line:no-console
    console.log(`[REDIS]: Connecting to ${redisUri} in ${redisMode} mode`)
    if (redisMode === 'single') {
      return new Redis({ host: redisUri, port });
    }

    const uris = redisUri.split(',');
    const endpoints: Redis.NodeConfiguration[] = [];

    for (const uri of uris) {
      if (uri.indexOf(':')) {
        const segments = uri.split(':');
        endpoints.push({ host: segments[0], port: Number.parseInt(segments[1], 10) || port });
      } else {
        endpoints.push({ host: uri, port });
      }
    }
    return new Redis.Cluster(endpoints);
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

    if (this.isSingleMode()) {
      return this.flushCacheOfNode(this._redis as Redis.Redis);
    }

    if (this.isClusterMode()) {
      const client = this._redis as Redis.Cluster;
      const nodes = client.nodes('master');
      let total = 0;
      for (const node of nodes) {
        const flushed = await this.flushCacheOfNode(node);
        total += flushed || 0;
      }
      return total;
    }

    return 0;

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

  private async flushCacheOfNode(node: Redis.Redis): Promise<number> {
    const stream = node.scanStream({
      count: 500,
      match: `${this._keyPrefix}*`,
    });

    let count = 0;
    stream.on('data', (keys: string[]) => {
      if (keys.length) {
        count += keys.length;
        const pipeline = node.pipeline();
        keys.forEach((key) => pipeline.del(key));
        pipeline.exec();
      }
    })

    return new Promise((resolve, reject) => {
      stream.once('end', () => {
        resolve(count);
      })
      stream.once('error', (error: Error) => {
        reject(error);
      })
    })
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

  private getClient({ redisPort = 6379, redisModeMap, redisUri }: IConstructor): {
    client: Redis.Redis | Redis.Cluster,
    redisMode: RedisMode,
  } {

    const modeMap: Record<string, string> = { ...redisModeMap, default: 'single' };
    const redisMode = (modeMap[redisUri || 'default'] || 'single') as RedisMode;
    // reassigning to variable for readability purposes.
    const cacheKey = [redisUri, redisMode].join(':');
    if (!connectionMap[cacheKey]) {
      connectionMap[cacheKey] = RedisDriver.createInstance(redisUri, redisPort, redisMode);
    }
    return { client: connectionMap[cacheKey], redisMode };
  }

  private isClusterMode(): boolean {
    return this._redisMode === RedisMode.CLUSTERED;
  }

  private isSingleMode(): boolean {
    return this._redisMode === RedisMode.SINGLE;
  }

  private async set(key: string, value: object, ttl: number): Promise<void> {
    if (!this._enabled) {
      return;
    }
    await this._redis.set(key, JSON.stringify(value));
    await this._redis.expire(key, ttl);
  }
}

export default RedisDriver;
