import dotenv from 'dotenv';

dotenv.config();

const parseDomains = () => {
  const rawDomains = process.env.DOMAINS ?? process.env.DOMAIN ?? '';
  return [...new Set(rawDomains
    .split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean))];
};

const normalizeEnvValue = (value = '') => String(value || '').trim();
const decodePrivateKey = (value = '') => normalizeEnvValue(value).replace(/\\n/g, '\n');
const parsePositiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

export const ENV = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  API_PORT: parsePositiveInt(process.env.API_PORT, 9001),
  SMTP_PORT: parsePositiveInt(process.env.SMTP_PORT, 25),
  //
  REDIS_URL: process.env.REDIS_URL ?? '',
  REDIS_HOST: process.env.REDIS_HOST ?? '127.0.0.1',
  REDIS_PORT: Number(process.env.REDIS_PORT ?? 6379),
  //
  S3_ENDPOINT: process.env.S3_ENDPOINT ?? 'http://127.0.0.1:9000',
  S3_ACCESS_KEY: process.env.S3_ACCESS_KEY ?? '',
  S3_SECRET_KEY: process.env.S3_SECRET_KEY ?? '',
  S3_BUCKET: process.env.S3_BUCKET ?? 'temp-mail',
  //
  MAIL_TTL: Number(process.env.MAIL_TTL ?? 0),
  MAX_INBOX: parsePositiveInt(process.env.MAX_INBOX, 50),
  ANYMOUSE_INBOX_PAGE_SIZE: parsePositiveInt(process.env.ANYMOUSE_INBOX_PAGE_SIZE, 5),
  APP_INBOX_PAGE_SIZE: parsePositiveInt(process.env.APP_INBOX_PAGE_SIZE, 20),
  GENERATE_RATE_LIMIT_MAX: parsePositiveInt(process.env.GENERATE_RATE_LIMIT_MAX, 10),
  GENERATE_RATE_LIMIT_WINDOW_SECONDS: parsePositiveInt(process.env.GENERATE_RATE_LIMIT_WINDOW_SECONDS, 60),
  //
  DOMAINS: parseDomains(),
  DOMAIN_EXPIRY_SWEEP_INTERVAL_MS: Number(process.env.DOMAIN_EXPIRY_SWEEP_INTERVAL_MS ?? 300000),
  // 
  FIREBASE_PROJECT_ID: normalizeEnvValue(process.env.FIREBASE_PROJECT_ID),
  FIREBASE_CLIENT_EMAIL: normalizeEnvValue(process.env.FIREBASE_CLIENT_EMAIL),
  FIREBASE_PRIVATE_KEY: decodePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
  FIREBASE_API_KEY: normalizeEnvValue(process.env.FIREBASE_API_KEY),
  FIREBASE_AUTH_DOMAIN: normalizeEnvValue(process.env.FIREBASE_AUTH_DOMAIN),
  FIREBASE_APP_ID: normalizeEnvValue(process.env.FIREBASE_APP_ID),
  // 
  MAIL_CACHE_PREFIX_VERSION: normalizeEnvValue(process.env.MAIL_CACHE_PREFIX_VERSION) || 'v1',
  MAIL_CACHE_INBOX_EXISTS_TTL_SECONDS: parsePositiveInt(process.env.MAIL_CACHE_INBOX_EXISTS_TTL_SECONDS, 60),
  MAIL_CACHE_INBOX_LIST_TTL_SECONDS: parsePositiveInt(process.env.MAIL_CACHE_INBOX_LIST_TTL_SECONDS, 30),
  MAIL_CACHE_DETAIL_TTL_SECONDS: parsePositiveInt(process.env.MAIL_CACHE_DETAIL_TTL_SECONDS, 300),
};
