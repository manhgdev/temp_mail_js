import redis from './redis.js';

/**
 * Basic fixed-window rate limiter using Redis
 * @param {string} key - Identifier (e.g. 'rl:generate:127.0.0.1')
 * @param {number} limit - Max requests per window
 * @param {number} windowSeconds - Window duration in seconds
 * @returns {Promise<boolean>} - true if allowed, false if rate limited
 */
export const checkRateLimit = async (key, limit, windowSeconds) => {
  try {
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }
    return current <= limit;
  } catch (error) {
    console.error('[rate-limit] Redis error:', error);
    // Fail open allows legit users to continue if Redis has a glitch
    return true;
  }
};
