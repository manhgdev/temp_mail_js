import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { ENV } from '../config/env.js';

const hasValue = (value) => Boolean(String(value || '').trim());

export const isFirebaseAdminConfigured = () =>
  hasValue(ENV.FIREBASE_PROJECT_ID) &&
  hasValue(ENV.FIREBASE_CLIENT_EMAIL) &&
  hasValue(ENV.FIREBASE_PRIVATE_KEY);

const getApp = () => {
  if (!isFirebaseAdminConfigured()) {
    throw new Error('Firebase Admin is not configured');
  }

  const existing = getApps()[0];
  if (existing) {
    return existing;
  }

  return initializeApp({
    credential: cert({
      projectId: ENV.FIREBASE_PROJECT_ID,
      clientEmail: ENV.FIREBASE_CLIENT_EMAIL,
      privateKey: ENV.FIREBASE_PRIVATE_KEY
    }),
    projectId: ENV.FIREBASE_PROJECT_ID
  });
};

export const getFirebaseFirestore = () => getFirestore(getApp());
export const getFirebaseAuth = () => getAuth(getApp());
export { FieldValue };

export const isFirebaseClientConfigured = () =>
  hasValue(ENV.FIREBASE_API_KEY) &&
  hasValue(ENV.FIREBASE_AUTH_DOMAIN) &&
  hasValue(ENV.FIREBASE_PROJECT_ID) &&
  hasValue(ENV.FIREBASE_APP_ID);

export const getFirebaseClientConfig = () => ({
  apiKey: ENV.FIREBASE_API_KEY,
  authDomain: ENV.FIREBASE_AUTH_DOMAIN,
  projectId: ENV.FIREBASE_PROJECT_ID,
  appId: ENV.FIREBASE_APP_ID
});

export const verifyAdminIdToken = async (idToken) => {
  const decodedToken = await getFirebaseAuth().verifyIdToken(idToken);
  if (!decodedToken.admin) {
    throw new Error('Admin privileges are required');
  }

  return decodedToken;
};

export const verifyUserIdToken = async (idToken) => {
  const decodedToken = await getFirebaseAuth().verifyIdToken(idToken);
  return decodedToken;
};
