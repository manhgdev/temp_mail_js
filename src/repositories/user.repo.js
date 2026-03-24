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

export const listUsers = async ({ search = '', limit = 100 } = {}) => {
  const snapshot = await getFirebaseFirestore().collection(USERS_COLLECTION).get();
  const normalizedSearch = String(search || '').trim().toLowerCase();

  const users = snapshot.docs
    .map(serializeUser)
    .filter((user) => {
      if (!normalizedSearch) return true;
      const haystacks = [user.email, user.display_name, user.uid]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());
      return haystacks.some((value) => value.includes(normalizedSearch));
    })
    .sort((left, right) => {
      const leftTime = new Date(left.updated_at || left.created_at || 0).getTime();
      const rightTime = new Date(right.updated_at || right.created_at || 0).getTime();
      return rightTime - leftTime;
    });

  if (limit === null || limit === undefined || limit === Infinity) {
    return users;
  }

  const normalizedLimit = Number(limit);
  if (!Number.isFinite(normalizedLimit)) {
    return users;
  }

  return users.slice(0, Math.max(1, normalizedLimit));
};

export const countUsers = async () => {
  const snapshot = await getFirebaseFirestore().collection(USERS_COLLECTION).count().get();
  return snapshot.data().count || 0;
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

export const updateUserProfile = async (uid, updates) => {
  const ref = getUserDoc(uid);
  await ref.set(
    {
      ...updates,
      updated_at: new Date()
    },
    { merge: true }
  );

  return getUser(uid);
};

export const deleteUserProfile = async (uid) => {
  await getUserDoc(uid).delete();
};
