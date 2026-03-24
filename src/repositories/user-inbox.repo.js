import { getFirebaseFirestore } from '../services/firebase-admin.js';

const USERS_COLLECTION = 'users';
const INBOXES_SUBCOLLECTION = 'inboxes';

const toIsoString = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const getInboxesCollection = (uid) =>
  getFirebaseFirestore()
    .collection(USERS_COLLECTION)
    .doc(uid)
    .collection(INBOXES_SUBCOLLECTION);

const serializeUserInbox = (snapshot) => {
  const data = snapshot.data();
  return {
    email: snapshot.id,
    domain: data.domain ?? null,
    label: data.label ?? null,
    created_at: toIsoString(data.created_at),
    updated_at: toIsoString(data.updated_at || data.created_at),
    last_mail_at: toIsoString(data.last_mail_at),
    unread_count: data.unread_count || 0
  };
};

export const listUserInboxes = async (uid) => {
  const snapshot = await getInboxesCollection(uid)
    .orderBy('created_at', 'desc')
    .get();
  return snapshot.docs.map(serializeUserInbox);
};

export const listUserInboxesPaginated = async (uid, { limit = 20, before } = {}) => {
  let query = getInboxesCollection(uid).orderBy('created_at', 'desc').limit(limit);

  if (before) {
    const cursorDoc = await getInboxesCollection(uid).doc(before).get();
    if (cursorDoc.exists) {
      query = query.startAfter(cursorDoc);
    }
  }

  const snapshot = await query.get();
  const inboxes = snapshot.docs.map(serializeUserInbox);
  
  let nextCursor = null;
  if (snapshot.docs.length === limit) {
    nextCursor = snapshot.docs[snapshot.docs.length - 1].id;
  }
  return { inboxes, nextCursor };
};

export const getUserInbox = async (uid, email) => {
  const snapshot = await getInboxesCollection(uid).doc(email.toLowerCase()).get();
  if (!snapshot.exists) return null;
  return serializeUserInbox(snapshot);
};

export const createUserInbox = async (uid, email, domain) => {
  const normalized = email.toLowerCase();
  const ref = getInboxesCollection(uid).doc(normalized);
  const existing = await ref.get();
  if (existing.exists) return serializeUserInbox(existing);

  await ref.set({
    domain,
    label: null,
    created_at: new Date(),
    updated_at: new Date(),
    last_mail_at: null,
    unread_count: 0
  });

  return getUserInbox(uid, normalized);
};

export const deleteUserInbox = async (uid, email) => {
  const normalized = email.toLowerCase();
  await getInboxesCollection(uid).doc(normalized).delete();
};

export const deleteAllUserInboxes = async (uid) => {
  const snapshot = await getInboxesCollection(uid).get();
  if (snapshot.empty) {
    return 0;
  }

  const batch = getFirebaseFirestore().batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();
  return snapshot.docs.length;
};

export const countUserInboxes = async (uid) => {
  const snapshot = await getInboxesCollection(uid).count().get();
  return snapshot.data().count || 0;
};

export const updateUserInbox = async (uid, email, updates) => {
  const normalized = email.toLowerCase();
  await getInboxesCollection(uid).doc(normalized).set(updates, { merge: true });
};
