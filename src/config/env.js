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

export const ENV = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  REDIS_URL: process.env.REDIS_URL ?? '',
  REDIS_HOST: process.env.REDIS_HOST ?? '127.0.0.1',
  REDIS_PORT: Number(process.env.REDIS_PORT ?? 6379),
  S3_ENDPOINT: process.env.S3_ENDPOINT ?? 'http://127.0.0.1:9000',
  S3_ACCESS_KEY: process.env.S3_ACCESS_KEY ?? '',
  S3_SECRET_KEY: process.env.S3_SECRET_KEY ?? '',
  S3_BUCKET: process.env.S3_BUCKET ?? 'temp-mail',
  DOMAINS: parseDomains(),
  DOMAIN_EXPIRY_SWEEP_INTERVAL_MS: Number(process.env.DOMAIN_EXPIRY_SWEEP_INTERVAL_MS ?? 300000),
  FIREBASE_PROJECT_ID: normalizeEnvValue(process.env.FIREBASE_PROJECT_ID),
  FIREBASE_CLIENT_EMAIL: normalizeEnvValue(process.env.FIREBASE_CLIENT_EMAIL),
  FIREBASE_PRIVATE_KEY: decodePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
  FIREBASE_API_KEY: normalizeEnvValue(process.env.FIREBASE_API_KEY),
  FIREBASE_AUTH_DOMAIN: normalizeEnvValue(process.env.FIREBASE_AUTH_DOMAIN),
  FIREBASE_APP_ID: normalizeEnvValue(process.env.FIREBASE_APP_ID)
};
