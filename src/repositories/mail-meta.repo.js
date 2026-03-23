import { MAX_INBOX } from '../constants/index.js';
import { FieldPath } from 'firebase-admin/firestore';
import { getFirebaseFirestore } from '../services/firebase-admin.js';

const FIRESTORE_INBOXES_COLLECTION = 'mail_inboxes';
const FIRESTORE_LOOKUP_COLLECTION = 'mail_lookup';
const FIRESTORE_MAILS_SUBCOLLECTION = 'mails';
const MAIL_DELETE_BATCH_SIZE = 400;

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

export const serializeMailMeta = (snapshot) => {
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

export const saveMailMeta = async (mail) => {
  const normalized = mail.to.toLowerCase();
  const db = getFirebaseFirestore();
  const batch = db.batch();

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
};

export const listInboxMailMeta = async (email, limit = MAX_INBOX) => {
  const snapshot = await getInboxDoc(email.toLowerCase())
    .collection(FIRESTORE_MAILS_SUBCOLLECTION)
    .orderBy('created_at', 'desc')
    .orderBy(FieldPath.documentId(), 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map(serializeMailMeta);
};

const encodeCursor = (mail) => JSON.stringify({ created_at: mail.created_at, id: mail.id });

const decodeCursor = (cursor) => {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(cursor);
    const createdAt = String(parsed?.created_at || '').trim();
    const id = String(parsed?.id || '').trim();
    if (!createdAt || !id) {
      throw new Error('invalid cursor');
    }

    const createdAtDate = new Date(createdAt);
    if (Number.isNaN(createdAtDate.getTime())) {
      throw new Error('invalid cursor');
    }

    return { createdAt, createdAtDate, id };
  } catch {
    const legacyDate = new Date(cursor);
    if (Number.isNaN(legacyDate.getTime())) {
      throw new Error('before must be a valid inbox cursor');
    }

    return { createdAt: legacyDate.toISOString(), createdAtDate: legacyDate, id: undefined };
  }
};

export const listInboxMailMetaPage = async ({ email, limit = MAX_INBOX, before = '' }) => {
  let query = getInboxDoc(email.toLowerCase())
    .collection(FIRESTORE_MAILS_SUBCOLLECTION)
    .orderBy('created_at', 'desc')
    .orderBy(FieldPath.documentId(), 'desc')
    .limit(limit + 1);

  if (before) {
    const cursor = decodeCursor(before);
    query = cursor.id
      ? query.startAfter(cursor.createdAtDate, cursor.id)
      : query.startAfter(cursor.createdAtDate);
  }

  const snapshot = await query.get();
  const documents = snapshot.docs;
  const hasMore = documents.length > limit;
  const pageDocs = hasMore ? documents.slice(0, limit) : documents;
  const mails = pageDocs.map(serializeMailMeta);
  const lastMail = mails[mails.length - 1] || null;

  return {
    mails,
    nextCursor: hasMore && lastMail ? encodeCursor(lastMail) : null
  };
};

export const listAllInboxMailMeta = async (email) => {
  const snapshot = await getInboxDoc(email.toLowerCase()).collection(FIRESTORE_MAILS_SUBCOLLECTION).get();
  return snapshot.docs.map(serializeMailMeta);
};

export const countInboxMailMeta = async (email) => {
  const snapshot = await getInboxDoc(email.toLowerCase())
    .collection(FIRESTORE_MAILS_SUBCOLLECTION)
    .count()
    .get();

  return snapshot.data().count || 0;
};

export const listInboxOverflowMailMeta = async (email, keep = MAX_INBOX) => {
  const overflow = Math.max(0, Number(keep || 0));
  const overflowCountSnapshot = await getInboxDoc(email.toLowerCase())
    .collection(FIRESTORE_MAILS_SUBCOLLECTION)
    .count()
    .get();
  const totalCount = overflowCountSnapshot.data().count || 0;
  const overflowCount = Math.max(0, totalCount - overflow);

  if (overflowCount === 0) {
    return [];
  }

  const snapshot = await getInboxDoc(email.toLowerCase())
    .collection(FIRESTORE_MAILS_SUBCOLLECTION)
    .orderBy('created_at', 'asc')
    .orderBy(FieldPath.documentId(), 'asc')
    .limit(overflowCount)
    .get();

  return snapshot.docs.map(serializeMailMeta);
};

export const getMailMetaById = async (id) => {
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

  return serializeMailMeta(snapshot);
};

export const getInboxMailMeta = async (email, id) => {
  const snapshot = await getInboxMailDoc(email.toLowerCase(), id).get();
  if (!snapshot.exists) {
    return null;
  }

  return serializeMailMeta(snapshot);
};

export const deleteMailMetaBatch = async (email, mails) => {
  if (!mails.length) {
    return 0;
  }

  const normalized = email.toLowerCase();
  const db = getFirebaseFirestore();

  for (let index = 0; index < mails.length; index += MAIL_DELETE_BATCH_SIZE) {
    const chunk = mails.slice(index, index + MAIL_DELETE_BATCH_SIZE);
    const batch = db.batch();
    for (const mail of chunk) {
      batch.delete(getInboxMailDoc(normalized, mail.id));
      batch.delete(getMailLookupDoc(mail.id));
    }
    await batch.commit();
  }

  return mails.length;
};
