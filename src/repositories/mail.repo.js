import { MAIL_TTL, MAX_INBOX } from '../constants/index.js';
import { isFirebaseAdminConfigured, getFirebaseFirestore } from '../services/firebase-admin.js';
import redis from '../services/redis.js';
import { deleteFiles, getObjectText } from '../services/s3.js';

const inboxKey = (email) => `inbox:${email.toLowerCase()}`;
const inboxExistsKey = (email) => `inbox_exists:${email.toLowerCase()}`;
const mailKey = (id) => `mail:${id}`;
const FIRESTORE_INBOXES_COLLECTION = 'mail_inboxes';
const FIRESTORE_LOOKUP_COLLECTION = 'mail_lookup';
const FIRESTORE_MAILS_SUBCOLLECTION = 'mails';
const MAIL_DELETE_BATCH_SIZE = 400;
const useFirestoreMailStore = () => isFirebaseAdminConfigured();

const getInboxDoc = (email) =>
  getFirebaseFirestore().collection(FIRESTORE_INBOXES_COLLECTION).doc(email.toLowerCase());
const getMailLookupDoc = (id) => getFirebaseFirestore().collection(FIRESTORE_LOOKUP_COLLECTION).doc(id);
const getInboxMailDoc = (email, id) => getInboxDoc(email).collection(FIRESTORE_MAILS_SUBCOLLECTION).doc(id);

const toIsoString = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const serializeFirestoreMail = (snapshot) => {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    to: data.to,
    from: data.from,
    subject: data.subject,
    preview: data.preview ?? '',
    body_text: data.body_text ?? '',
    text_key: data.text_key ?? null,
    html_url: data.html_url ?? null,
    html_key: data.html_key ?? null,
    attachments: Array.isArray(data.attachments) ? data.attachments : [],
    created_at: toIsoString(data.created_at) ?? new Date().toISOString()
  };
};

const getAllFirestoreInboxMails = async (email) => {
  const snapshot = await getInboxDoc(email)
    .collection(FIRESTORE_MAILS_SUBCOLLECTION)
    .get();

  return snapshot.docs.map(serializeFirestoreMail);
};

const getMailContentKeys = (mail) => [
  mail?.text_key,
  mail?.html_key,
  ...(mail?.attachments || []).map((attachment) => attachment?.key)
].filter(Boolean);

const deleteFirestoreMails = async (email, mails) => {
  if (!mails.length) {
    return 0;
  }

  const keys = mails.flatMap(getMailContentKeys);
  await deleteFiles(keys);

  const db = getFirebaseFirestore();
  for (let index = 0; index < mails.length; index += MAIL_DELETE_BATCH_SIZE) {
    const chunk = mails.slice(index, index + MAIL_DELETE_BATCH_SIZE);
    const batch = db.batch();
    for (const mail of chunk) {
      batch.delete(getInboxMailDoc(email, mail.id));
      batch.delete(getMailLookupDoc(mail.id));
    }
    await batch.commit();
  }

  return mails.length;
};

const getInboxTtl = async (email) => {
  if (MAIL_TTL <= 0) {
    return null;
  }

  const ttl = await redis.ttl(inboxExistsKey(email));
  return ttl > 0 ? ttl : MAIL_TTL;
};

export const createInbox = async (email) => {
  const normalized = email.toLowerCase();
  if (useFirestoreMailStore()) {
    try {
      await getInboxDoc(normalized).create({
        email: normalized,
        active: true,
        created_at: new Date(),
        updated_at: new Date()
      });
      return true;
    } catch (error) {
      if (String(error?.code || '') === '6' || /already exists/i.test(String(error?.message || ''))) {
        return false;
      }
      throw error;
    }
  }

  const result =
    MAIL_TTL > 0
      ? await redis.set(inboxExistsKey(normalized), '1', 'EX', MAIL_TTL, 'NX')
      : await redis.set(inboxExistsKey(normalized), '1', 'NX');

  return result === 'OK';
};

export const inboxExists = async (email) => {
  if (useFirestoreMailStore()) {
    const snapshot = await getInboxDoc(email).get();
    return snapshot.exists;
  }

  const exists = await redis.exists(inboxExistsKey(email));
  return exists === 1;
};

export const saveMail = async (mail) => {
  if (useFirestoreMailStore()) {
    const normalized = mail.to.toLowerCase();
    const db = getFirebaseFirestore();
    const batch = db.batch();
    batch.set(
      getInboxDoc(normalized),
      {
        email: normalized,
        active: true,
        updated_at: new Date(),
        last_mail_at: new Date(mail.created_at)
      },
      { merge: true }
    );
    batch.set(getInboxMailDoc(normalized, mail.id), {
      ...mail,
      to: normalized,
      created_at: new Date(mail.created_at)
    });
    batch.set(getMailLookupDoc(mail.id), {
      email: normalized,
      created_at: new Date(mail.created_at)
    });
    await batch.commit();
    return;
  }

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

export const listInboxMails = async (email) => {
  const normalized = email.toLowerCase();
  if (useFirestoreMailStore()) {
    const snapshot = await getInboxDoc(normalized)
      .collection(FIRESTORE_MAILS_SUBCOLLECTION)
      .orderBy('created_at', 'desc')
      .limit(MAX_INBOX)
      .get();

    return snapshot.docs.map(serializeFirestoreMail);
  }

  const ids = await getInbox(normalized);
  if (!ids.length) {
    return [];
  }

  const values = await redis.mget(ids.map((id) => mailKey(id)));
  return values.filter(Boolean).map((value) => JSON.parse(value));
};

export const getMail = async (id) => {
  if (useFirestoreMailStore()) {
    const lookupSnapshot = await getMailLookupDoc(id).get();
    if (!lookupSnapshot.exists) {
      return null;
    }

    const email = String(lookupSnapshot.data()?.email || '').trim().toLowerCase();
    if (!email) {
      return null;
    }

    const snapshot = await getInboxMailDoc(email, id).get();
    if (!snapshot.exists) {
      return null;
    }

    const mail = serializeFirestoreMail(snapshot);
    if (!mail.body_text && mail.text_key) {
      mail.body_text = await getObjectText(mail.text_key).catch(() => '');
    }
    return mail;
  }

  const value = await redis.get(mailKey(id));
  if (!value) {
    return null;
  }

  return JSON.parse(value);
};

export const deleteInbox = async (email, id) => {
  if (useFirestoreMailStore()) {
    const normalized = email.toLowerCase();
    const snapshot = await getInboxMailDoc(normalized, id).get();
    if (!snapshot.exists) {
      return false;
    }

    const mail = serializeFirestoreMail(snapshot);
    await deleteFirestoreMails(normalized, [mail]);
    return true;
  }

  const mail = await getMail(id);
  if (!mail) {
    return false;
  }

  if (mail.to.toLowerCase() !== email.toLowerCase()) {
    return false;
  }

  const tx = redis.multi();
  tx.lrem(inboxKey(mail.to), 0, id);
  tx.del(mailKey(id));
  await tx.exec();
  return true;
};

export const deleteInboxAll = async (email) => {
  const normalized = email.toLowerCase();
  if (useFirestoreMailStore()) {
    const mails = await getAllFirestoreInboxMails(normalized);
    const deletedCount = await deleteFirestoreMails(normalized, mails);
    await getInboxDoc(normalized).set(
      {
        updated_at: new Date(),
        last_mail_at: null
      },
      { merge: true }
    );
    return deletedCount;
  }

  const ids = await getInbox(normalized);
  const tx = redis.multi();

  for (const id of ids) {
    tx.del(mailKey(id));
  }

  tx.del(inboxKey(normalized));
  await tx.exec();

  return ids.length;
};

export const deleteMail = async (email) => {
  const normalized = email.toLowerCase();
  if (useFirestoreMailStore()) {
    const mails = await getAllFirestoreInboxMails(normalized);
    const deletedCount = await deleteFirestoreMails(normalized, mails);
    await getInboxDoc(normalized).delete();
    return deletedCount;
  }

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
