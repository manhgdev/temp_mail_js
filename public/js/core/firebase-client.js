import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import { getAuth, browserLocalPersistence, setPersistence } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';
import { fetchJson } from './api-client.js';

let firebaseApp = null;
let firebaseAuth = null;

export const loadFirebaseConfig = async () => {
  const payload = await fetchJson('/firebase/config');
  return payload;
};

export const ensureFirebaseAuth = async ({ persist = false } = {}) => {
  if (firebaseAuth) {
    return firebaseAuth;
  }

  const payload = await loadFirebaseConfig();
  if (!payload.enabled || !payload.config) {
    throw new Error('Firebase client config is missing');
  }

  firebaseApp = initializeApp(payload.config);
  firebaseAuth = getAuth(firebaseApp);

  if (persist) {
    await setPersistence(firebaseAuth, browserLocalPersistence);
  }

  return firebaseAuth;
};

export { firebaseApp, firebaseAuth };
