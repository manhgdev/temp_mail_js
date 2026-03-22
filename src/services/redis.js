import Redis from 'ioredis';
import { ENV } from '../config/env.js';

const isTlsRedisUrl = String(ENV.REDIS_URL || '').startsWith('rediss://');

const redisOptions = {
  lazyConnect: false,
  maxRetriesPerRequest: null,
  connectTimeout: 10000,
  enableReadyCheck: true,
  keepAlive: 30000,
  noDelay: true,
  retryStrategy: (attempt) => Math.min(attempt * 200, 3000),
  reconnectOnError: (error) => {
    const message = String(error?.message || '');
    return /ECONNRESET|ETIMEDOUT|EPIPE|READONLY/i.test(message);
  },
  ...(isTlsRedisUrl
    ? {
        tls: {
          rejectUnauthorized: true
        }
      }
    : {})
};

const redis = ENV.REDIS_URL
  ? new Redis(ENV.REDIS_URL, redisOptions)
  : new Redis({
      host: ENV.REDIS_HOST,
      port: ENV.REDIS_PORT,
      ...redisOptions
    });

redis.on('error', (error) => {
  const message = String(error?.message || error || '');
  if (/ECONNRESET|ETIMEDOUT|EPIPE/i.test(message)) {
    console.warn('[redis] transient connection issue, retrying', message);
    return;
  }

  console.error('[redis] connection error', error);
});

export default redis;
