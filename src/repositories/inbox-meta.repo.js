import { getFirebaseFirestore } from '../services/firebase-admin.js';

const FIRESTORE_INBOXES_COLLECTION = 'mail_inboxes';

const getInboxDoc = (email) =>
  getFirebaseFirestore().collection(FIRESTORE_INBOXES_COLLECTION).doc(email.toLowerCase());

export const createInboxMeta = async (email) => {
  const normalized = email.toLowerCase();

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
};

export const inboxMetaExists = async (email) => {
  const snapshot = await getInboxDoc(email).get();
  return snapshot.exists;
};

export const touchInboxMeta = async (email, updates = {}) =>
  getInboxDoc(email.toLowerCase()).set(
    {
      email: email.toLowerCase(),
      active: true,
      updated_at: new Date(),
      ...updates
    },
    { merge: true }
  );

export const clearInboxMeta = async (email) =>
  getInboxDoc(email.toLowerCase()).set(
    {
      updated_at: new Date(),
      last_mail_at: null
    },
    { merge: true }
  );

export const deleteInboxMeta = async (email) => getInboxDoc(email.toLowerCase()).delete();
