import { getFirebaseFirestore } from '../src/services/firebase-admin.js';

async function run() {
  const email = 'felixgray2003@tempinbox.local';
  console.log('Fetching meta for:', email);
  try {
    const snap = await getFirebaseFirestore().collection('mail_inboxes').doc(email).get();
    if (!snap.exists) {
      console.log('Doc does NOT exist in mail_inboxes!');
    } else {
      console.log('Doc exists. Data:', snap.data());
    }
  } catch (e) {
    console.error('Error fetching:', e);
  }
  process.exit(0);
}

run();
