import { getFirebaseFirestore } from '../services/firebase-admin.js';

const USERS_COLLECTION = 'users';

const toIsoString = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const getUserDoc = (uid) =>
  getFirebaseFirestore().collection(USERS_COLLECTION).doc(uid);

const serializeUser = (snapshot) => {
  const data = snapshot.data();
  return {
    uid: snapshot.id,
    email: data.email ?? null,
    display_name: data.display_name ?? null,
    created_at: toIsoString(data.created_at),
    updated_at: toIsoString(data.updated_at)
  };
};

export const getUser = async (uid) => {
  const snapshot = await getUserDoc(uid).get();
  if (!snapshot.exists) return null;
  return serializeUser(snapshot);
};

export const upsertUser = async (uid, data) => {
  const ref = getUserDoc(uid);
  const now = new Date();
  const existing = await ref.get();

  await ref.set(
    {
      ...data,
      created_at: existing.exists ? existing.data().created_at ?? now : data.created_at ?? now,
      updated_at: now
    },
    { merge: true }
  );

  return getUser(uid);
};
