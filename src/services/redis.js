import Redis from 'ioredis';
import { ENV } from '../config/env.js';

const isTlsRedisUrl = String(ENV.REDIS_URL || '').startsWith('rediss://');
const transientRedisErrorPattern = /ECONNRESET|ETIMEDOUT|EPIPE|READONLY/i;

let reconnectAttempt = 0;
let outageStartedAt = null;
let wasReady = false;

const formatOutageDuration = () => {
  if (!outageStartedAt) {
    return null;
  }

  const elapsedMs = Date.now() - outageStartedAt;
  return `${(elapsedMs / 1000).toFixed(1)}s`;
};

const redisOptions = {
  lazyConnect: false,
  maxRetriesPerRequest: null,
  connectTimeout: 10000,
  enableReadyCheck: true,
  keepAlive: 30000,
  noDelay: true,
  retryStrategy: (attempt) => {
    reconnectAttempt = attempt;
    if (!outageStartedAt) {
      outageStartedAt = Date.now();
    }

    const delay = Math.min(attempt * 200, 3000);
    console.warn(`[redis] reconnect scheduled: attempt=${attempt} delay=${delay}ms`);
    return delay;
  },
  reconnectOnError: (error) => {
    const message = String(error?.message || '');
    return transientRedisErrorPattern.test(message);
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
  if (transientRedisErrorPattern.test(message)) {
    if (!outageStartedAt) {
      outageStartedAt = Date.now();
    }

    console.warn(`[redis] transient connection issue: ${message}`);
    return;
  }

  console.error('[redis] connection error', error);
});

redis.on('connect', () => {
  console.info('[redis] socket connected');
});

redis.on('ready', () => {
  const outageDuration = formatOutageDuration();

  if (wasReady && outageDuration) {
    console.info(
      `[redis] connection restored after ${outageDuration} (attempts=${reconnectAttempt})`
    );
  } else {
    console.info('[redis] client ready');
  }

  wasReady = true;
  reconnectAttempt = 0;
  outageStartedAt = null;
});

redis.on('reconnecting', (delay) => {
  if (!outageStartedAt) {
    outageStartedAt = Date.now();
  }

  console.warn(
    `[redis] reconnecting now: next-attempt=${reconnectAttempt + 1} wait=${delay}ms`
  );
});

redis.on('close', () => {
  if (!outageStartedAt) {
    outageStartedAt = Date.now();
  }

  console.warn('[redis] connection closed');
});

redis.on('end', () => {
  const outageDuration = formatOutageDuration();
  console.error(
    `[redis] connection ended${outageDuration ? ` after ${outageDuration}` : ''}; no more retries`
  );
});

export default redis;
