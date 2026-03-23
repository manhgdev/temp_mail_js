import redis from '../services/redis.js';
import { ENV } from '../config/env.js';

const CACHE_PREFIX = `cache:mail:${ENV.MAIL_CACHE_PREFIX_VERSION}`;
const CACHE_TTL_SECONDS = Object.freeze({
  inboxExists: ENV.MAIL_CACHE_INBOX_EXISTS_TTL_SECONDS,
  inboxList: ENV.MAIL_CACHE_INBOX_LIST_TTL_SECONDS,
  mailDetail: ENV.MAIL_CACHE_DETAIL_TTL_SECONDS
});

const inboxExistsCacheKey = (email) => `${CACHE_PREFIX}:inbox-exists:${email.toLowerCase()}`;
const inboxListCacheKey = (email) => `${CACHE_PREFIX}:inbox-list:${email.toLowerCase()}`;
const mailDetailCacheKey = (id) => `${CACHE_PREFIX}:mail-detail:${id}`;

const safeCacheRead = async (key) => {
  try {
    return await redis.get(key);
  } catch (error) {
    console.warn(`[mail-cache] read failed for ${key}`, error);
    return null;
  }
};

const safeCacheWrite = async (key, value, ttlSeconds) => {
  try {
    await redis.set(key, value, 'EX', ttlSeconds);
  } catch (error) {
    console.warn(`[mail-cache] write failed for ${key}`, error);
  }
};

const safeCacheDelete = async (keys = []) => {
  const uniqueKeys = [...new Set(keys.filter(Boolean))];
  if (!uniqueKeys.length) {
    return;
  }

  try {
    await redis.del(...uniqueKeys);
  } catch (error) {
    console.warn(`[mail-cache] delete failed for ${uniqueKeys.join(', ')}`, error);
  }
};

const readCachedJson = async (key) => {
  const value = await safeCacheRead(key);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn(`[mail-cache] invalid JSON for ${key}`, error);
    await safeCacheDelete([key]);
    return null;
  }
};

const writeCachedJson = async (key, payload, ttlSeconds) =>
  safeCacheWrite(key, JSON.stringify(payload), ttlSeconds);

const compactCachedMailDetail = (mail = {}) => ({
  id: mail.id,
  to: mail.to,
  from: mail.from,
  subject: mail.subject,
  preview: mail.preview ?? '',
  body_text: mail.body_text ?? '',
  text_key: mail.text_key ?? null,
  html_key: mail.html_key ?? null,
  attachments: Array.isArray(mail.attachments)
    ? mail.attachments.map((attachment) => ({
        filename: attachment?.filename || '',
        contentType: attachment?.contentType || 'application/octet-stream',
        size: Number(attachment?.size || 0),
        key: attachment?.key || null
      }))
    : [],
  created_at: mail.created_at ?? null
});

export const getCachedInboxExists = async (email) => {
  const cached = await readCachedJson(inboxExistsCacheKey(email));
  return cached && typeof cached.exists === 'boolean' ? cached.exists : null;
};

export const setCachedInboxExists = async (email, exists) =>
  writeCachedJson(
    inboxExistsCacheKey(email),
    { exists: Boolean(exists) },
    CACHE_TTL_SECONDS.inboxExists
  );

export const getCachedInboxList = async (email) => {
  const cached = await readCachedJson(inboxListCacheKey(email));
  return Array.isArray(cached) ? cached : null;
};

export const setCachedInboxList = async (email, mails) =>
  writeCachedJson(inboxListCacheKey(email), mails, CACHE_TTL_SECONDS.inboxList);

export const getCachedMailDetail = async (id) => readCachedJson(mailDetailCacheKey(id));

export const setCachedMailDetail = async (id, mail) =>
  writeCachedJson(
    mailDetailCacheKey(id),
    compactCachedMailDetail(mail),
    CACHE_TTL_SECONDS.mailDetail
  );

export const invalidateInboxCache = async (email) =>
  safeCacheDelete([inboxExistsCacheKey(email), inboxListCacheKey(email)]);

export const invalidateInboxListCache = async (email) =>
  safeCacheDelete([inboxListCacheKey(email)]);

export const invalidateMailDetailCache = async (mailIds = []) =>
  safeCacheDelete(mailIds.map((id) => mailDetailCacheKey(id)));
