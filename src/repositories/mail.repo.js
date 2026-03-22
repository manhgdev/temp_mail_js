import { MAIL_TTL, MAX_INBOX } from '../constants/index.js';
import redis from '../services/redis.js';

const inboxKey = (email) => `inbox:${email.toLowerCase()}`;
const inboxExistsKey = (email) => `inbox_exists:${email.toLowerCase()}`;
const mailKey = (id) => `mail:${id}`;

const getInboxTtl = async (email) => {
  if (MAIL_TTL <= 0) {
    return null;
  }

  const ttl = await redis.ttl(inboxExistsKey(email));
  return ttl > 0 ? ttl : MAIL_TTL;
};

export const createInbox = async (email) => {
  const normalized = email.toLowerCase();
  const tx = redis.multi();

  if (MAIL_TTL > 0) {
    tx.set(inboxExistsKey(normalized), '1', 'EX', MAIL_TTL);
  } else {
    tx.set(inboxExistsKey(normalized), '1');
  }

  tx.del(inboxKey(normalized));
  await tx.exec();
};

export const inboxExists = async (email) => {
  const exists = await redis.exists(inboxExistsKey(email));
  return exists === 1;
};

export const saveMail = async (mail) => {
  const toEmail = mail.to.toLowerCase();
  const key = inboxKey(toEmail);
  const ttl = await getInboxTtl(toEmail);

  const tx = redis.multi();
  if (ttl) {
    tx.set(mailKey(mail.id), JSON.stringify(mail), 'EX', ttl);
  } else {
    tx.set(mailKey(mail.id), JSON.stringify(mail));
  }

  tx.lpush(key, mail.id);
  tx.lrange(key, MAX_INBOX, -1);
  tx.ltrim(key, 0, MAX_INBOX - 1);

  if (ttl) {
    tx.expire(key, ttl);
  } else {
    tx.persist(key);
    tx.persist(inboxExistsKey(toEmail));
  }

  const removedIds = await tx.exec();

  const overflowIds = removedIds?.[2]?.[1] ?? [];

  if (overflowIds.length > 0) {
    const tx = redis.multi();
    for (const id of overflowIds) {
      tx.del(mailKey(id));
    }
    await tx.exec();
  }
};

export const getInbox = async (email) => redis.lrange(inboxKey(email), 0, MAX_INBOX - 1);

export const getMail = async (id) => {
  const value = await redis.get(mailKey(id));
  if (!value) {
    return null;
  }

  return JSON.parse(value);
};

export const deleteMail = async (id) => {
  const mail = await getMail(id);
  if (!mail) {
    return false;
  }

  const tx = redis.multi();
  tx.lrem(inboxKey(mail.to), 0, id);
  tx.del(mailKey(id));
  await tx.exec();
  return true;
};

export const clearInbox = async (email) => {
  const normalized = email.toLowerCase();
  const ids = await getInbox(normalized);
  const tx = redis.multi();

  for (const id of ids) {
    tx.del(mailKey(id));
  }

  tx.del(inboxKey(normalized));
  tx.del(inboxExistsKey(normalized));
  await tx.exec();

  return ids.length;
};
