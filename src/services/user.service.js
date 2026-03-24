import { getUser, upsertUser } from '../repositories/user.repo.js';
import {
  listUserInboxes,
  listUserInboxesPaginated,
  createUserInbox,
  deleteUserInbox,
  updateUserInbox,
  getUserInbox,
  countUserInboxes
} from '../repositories/user-inbox.repo.js';
import { createInbox, deleteMailByEmail } from './mail.service.js';
import { getActiveDomains, normalizeDomain } from './domain.service.js';
import { generateRandomEmail } from '../utils/email.js';

const MAX_INBOXES_PER_USER = 20;
const MAX_GENERATE_ATTEMPTS = 10;

export const getOrCreateUserProfile = async (decodedToken) => {
  const { uid, email, name } = decodedToken;

  let user = await getUser(uid);
  if (!user) {
    user = await upsertUser(uid, {
      email: email ?? null,
      display_name: name ?? null
    });
  }

  return user;
};

export const getUserInboxList = async (uid) => {
  const all = await listUserInboxes(uid);
  // Sort in JS to handle missing updated_at for legacy data safely
  return all.sort((a, b) => {
    const timeA = new Date(a.updated_at || a.created_at).getTime();
    const timeB = new Date(b.updated_at || b.created_at).getTime();
    return timeB - timeA;
  });
};

export const getUserInboxListPaginated = async (uid, opts = {}) => {
  // Since users only have max 20 inboxes, we can fetch all and simulate pagination
  const inboxes = await getUserInboxList(uid);
  const total = inboxes.length;
  
  // Actually, we don't really need pagination for 20 items, but to keep the API compatible:
  const limit = opts.limit || 20;
  const before = opts.before;
  
  let startIdx = 0;
  if (before) {
    const idx = inboxes.findIndex(i => i.email === before);
    if (idx !== -1) startIdx = idx + 1;
  }
  
  const page = inboxes.slice(startIdx, startIdx + limit);
  const nextCursor = (startIdx + limit < inboxes.length) ? page[page.length - 1].email : null;
  
  return { inboxes: page, nextCursor, total };
};
export { countUserInboxes };

export const resetUserInboxUnreadCount = async (uid, email) => {
  await updateUserInbox(uid, email, { unread_count: 0 });
};

export const createUserOwnedInbox = async (uid, requestedDomain) => {
  const count = await countUserInboxes(uid);
  if (count >= MAX_INBOXES_PER_USER) {
    throw new Error(`You can have at most ${MAX_INBOXES_PER_USER} inboxes`);
  }

  const activeDomains = await getActiveDomains();
  if (!activeDomains.length) {
    throw new Error('No active domains configured');
  }

  const selectedDomain = requestedDomain
    ? normalizeDomain(requestedDomain)
    : activeDomains[Math.floor(Math.random() * activeDomains.length)];

  if (!activeDomains.includes(selectedDomain)) {
    throw new Error('Unsupported domain');
  }

  for (let attempt = 0; attempt < MAX_GENERATE_ATTEMPTS; attempt += 1) {
    const email = generateRandomEmail(selectedDomain);
    const created = await createInbox(email, uid);
    if (created) {
      const userInbox = await createUserInbox(uid, email, selectedDomain);
      return userInbox;
    }
  }

  throw new Error('Failed to allocate a unique inbox');
};

export const removeUserInbox = async (uid, email) => {
  const normalized = email.toLowerCase();

  const userInbox = await getUserInbox(uid, normalized);
  if (!userInbox) {
    return false;
  }

  await deleteMailByEmail(normalized).catch((error) => {
    console.error(`[user-service] failed to delete mail content for ${normalized}`, error);
  });

  await deleteUserInbox(uid, normalized);
  return true;
};

export const removeAllUserInboxes = async (uid) => {
  const inboxes = await listUserInboxes(uid);

  await Promise.allSettled(
    inboxes.map(async (inbox) => {
      await deleteMailByEmail(inbox.email).catch((error) => {
        console.error(`[user-service] failed to delete mail content for ${inbox.email}`, error);
      });
      await deleteUserInbox(uid, inbox.email);
    })
  );

  return inboxes.length;
};
