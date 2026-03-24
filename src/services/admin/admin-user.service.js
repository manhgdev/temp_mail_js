import { getFirebaseAuth } from '../firebase-admin.js';
import { countUserInboxes, deleteAllUserInboxes, listUserInboxes } from '../../repositories/user-inbox.repo.js';
import {
  deleteUserProfile,
  getUser,
  listUsers,
  updateUserProfile
} from '../../repositories/user.repo.js';
import { deleteMailByEmail } from '../mail.service.js';

export const listAdminUsers = async ({ search = '', limit = 100, cursor = '' } = {}) => {
  const normalizedSearch = String(search || '').trim();
  const normalizedLimit = Math.max(1, Number(limit) || 100);

  if (!normalizedSearch) {
    const authPage = await listFirebaseAuthUsersPage({ limit: normalizedLimit, cursor });
    const profileUsers = await Promise.all(authPage.users.map((user) => getUser(user.uid).catch(() => null)));
    const visibleUsers = mergeUsers(profileUsers.filter(Boolean), authPage.users);

    const usersWithInboxCounts = await Promise.all(
      visibleUsers.map(async (user) => ({
        ...user,
        inbox_count: await countUserInboxes(user.uid).catch(() => 0)
      }))
    );

    return {
      users: usersWithInboxCounts,
      nextCursor: authPage.nextCursor,
      total: null
    };
  }

  const [profileUsers, authUsers] = await Promise.all([
    listUsers({ search: normalizedSearch, limit: null }),
    listFirebaseAuthUsers({ search: normalizedSearch })
  ]);

  const mergedUsers = mergeUsers(profileUsers, authUsers);
  const offset = Math.max(0, Number.parseInt(String(cursor || '0'), 10) || 0);
  const visibleUsers = mergedUsers.slice(offset, offset + normalizedLimit);
  const usersWithInboxCounts = await Promise.all(
    visibleUsers.map(async (user) => ({
      ...user,
      inbox_count: await countUserInboxes(user.uid).catch(() => 0)
    }))
  );

  return {
    users: usersWithInboxCounts,
    nextCursor: offset + normalizedLimit < mergedUsers.length ? String(offset + normalizedLimit) : null,
    total: normalizedSearchCount(mergedUsers, mergedUsers.length)
  };
};

export const getAdminUser = async (uid) => {
  const [profileUser, authUser] = await Promise.all([
    getUser(uid),
    getFirebaseAuth()
      .getUser(uid)
      .then(serializeAuthUser)
      .catch(() => null)
  ]);
  const user = mergeUsers(profileUser ? [profileUser] : [], authUser ? [authUser] : [])[0] || null;
  if (!user) {
    return null;
  }

  return {
    ...user,
    inbox_count: await countUserInboxes(uid).catch(() => 0)
  };
};

export const getAdminUserStats = async () => ({
  total_users: await countFirebaseAuthUsers().catch(() => 0)
});

export const updateAdminUser = async (uid, { email, display_name }) => {
  const auth = getFirebaseAuth();
  const payload = {};

  if (typeof email === 'string' && email.trim()) {
    payload.email = email.trim().toLowerCase();
  }

  if (typeof display_name === 'string') {
    payload.displayName = display_name.trim() || null;
  }

  if (Object.keys(payload).length > 0) {
    await auth.updateUser(uid, payload);
  }

  await updateUserProfile(uid, {
    ...(payload.email !== undefined ? { email: payload.email } : {}),
    ...(payload.displayName !== undefined ? { display_name: payload.displayName } : {})
  });

  return getAdminUser(uid);
};

export const deleteAdminUser = async (uid) => {
  const inboxes = await listUserInboxes(uid).catch(() => []);

  await Promise.allSettled(
    inboxes.map(async (inbox) => {
      await deleteMailByEmail(inbox.email).catch((error) => {
        console.error(`[admin-user-service] failed to delete mail content for ${inbox.email}`, error);
      });
    })
  );

  await deleteAllUserInboxes(uid).catch(() => 0);
  await deleteUserProfile(uid).catch(() => {});
  await getFirebaseAuth().deleteUser(uid).catch((error) => {
    if (error?.code !== 'auth/user-not-found') {
      throw error;
    }
  });

  return { uid, deleted_inboxes: inboxes.length };
};

const normalizedSearchCount = (users, fallback) => {
  if (Array.isArray(users)) {
    return users.length;
  }
  return Number(fallback) || 0;
};

const listFirebaseAuthUsers = async ({ search = '' } = {}) => {
  const auth = getFirebaseAuth();
  const normalizedSearch = String(search || '').trim().toLowerCase();
  const collected = [];
  let nextPageToken;

  do {
    const page = await auth.listUsers(1000, nextPageToken);
    page.users.forEach((userRecord) => {
      const user = serializeAuthUser(userRecord);
      if (!normalizedSearch || matchesSearch(user, normalizedSearch)) {
        collected.push(user);
      }
    });
    nextPageToken = page.pageToken;
  } while (nextPageToken);

  return collected.sort(sortUsersDesc);
};

const listFirebaseAuthUsersPage = async ({ limit = 20, cursor = '' } = {}) => {
  const auth = getFirebaseAuth();
  const page = await auth.listUsers(Math.min(1000, Math.max(1, Number(limit) || 20)), cursor || undefined);
  return {
    users: page.users.map(serializeAuthUser).sort(sortUsersDesc),
    nextCursor: page.pageToken || null
  };
};

const countFirebaseAuthUsers = async () => {
  const auth = getFirebaseAuth();
  let total = 0;
  let nextPageToken;

  do {
    const page = await auth.listUsers(1000, nextPageToken);
    total += page.users.length;
    nextPageToken = page.pageToken;
  } while (nextPageToken);

  return total;
};

const serializeAuthUser = (userRecord) => ({
  uid: userRecord.uid,
  email: userRecord.email ?? null,
  display_name: userRecord.displayName ?? null,
  created_at: userRecord.metadata?.creationTime ? new Date(userRecord.metadata.creationTime).toISOString() : null,
  updated_at: userRecord.metadata?.lastRefreshTime
    ? new Date(userRecord.metadata.lastRefreshTime).toISOString()
    : userRecord.metadata?.lastSignInTime
      ? new Date(userRecord.metadata.lastSignInTime).toISOString()
      : null
});

const mergeUsers = (profileUsers, authUsers) => {
  const merged = new Map();

  [...authUsers, ...profileUsers].forEach((user) => {
    if (!user?.uid) {
      return;
    }

    const existing = merged.get(user.uid) || {};
    merged.set(user.uid, {
      uid: user.uid,
      email: existing.email || user.email || null,
      display_name: existing.display_name || user.display_name || null,
      created_at: existing.created_at || user.created_at || null,
      updated_at: existing.updated_at || user.updated_at || null
    });
  });

  return Array.from(merged.values()).sort(sortUsersDesc);
};

const matchesSearch = (user, normalizedSearch) =>
  [user.email, user.display_name, user.uid]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
    .some((value) => value.includes(normalizedSearch));

const sortUsersDesc = (left, right) => {
  const leftTime = new Date(left.updated_at || left.created_at || 0).getTime();
  const rightTime = new Date(right.updated_at || right.created_at || 0).getTime();
  return rightTime - leftTime;
};
