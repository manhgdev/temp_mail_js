# TempMail

Single-process Node app for:
- temporary inbox generation
- SMTP mail ingestion
- static frontend delivery
- Firebase-based domain moderation in production

## Preview

![Inbox preview](preview/inbox.png)

![Submit domain preview](preview/submit-domain.png)

![Admin dashboard preview](preview/dash-board.png)

## Features

- Disposable inbox UI at `/`
- Public domain submission page at `/submit-domain`
- Admin domain management page at `/admin`
- SMTP receiver for real inbound mail
- Firestore-backed active domains in production
- `.env DOMAINS` fallback in local/dev

## Project Structure

```text
.
├── public/
├── scripts/
├── src/
├── pm2.config.json
├── package.json
└── README.md
```

## Local Run

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm start
```

Default local services:

- UI/API: `http://127.0.0.1:9001`
- SMTP: `127.0.0.1:2525` or whatever `SMTP_PORT` is set to in `.env`

Health checks:

```bash
curl http://127.0.0.1:9001/health
curl http://127.0.0.1:9001/ready
```

Generate a temp inbox:

```bash
curl http://127.0.0.1:9001/generate
```

Read inbox:

```bash
curl http://127.0.0.1:9001/inbox/your-mail@tempmail.local
```

Send a local SMTP test mail:

```bash
npm run test:smtp -- --to your-mail@tempmail.local --subject "hello" --body "local smtp test"
```

## Domain Modes

### Local / dev

Local development reads domains from `.env`:

```env
DOMAINS=tempmail.local,tempinbox.local,tempdrop.local
```

### Production

When `NODE_ENV=production`, the app reads active domains from Firestore instead of `.env`.

Public behavior:
- `/submit-domain` creates a pending submission only
- submitted domains never become active automatically
- admin must review and activate them

## Environment

Use `.env.example` as the starting point.

### Firebase Admin

Required for production Firestore access and admin token verification:

```env
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

Keep newline escapes inside `.env`:

```env
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nABC...\n-----END PRIVATE KEY-----\n"
```

### Firebase Client

Required for `/admin` login:

```env
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_APP_ID=
```

### Optional

```env
DOMAIN_EXPIRY_SWEEP_INTERVAL_MS=300000
```

This controls how often production checks for expired domains and disables them.

## Firebase Setup

1. Create a Firebase project.
2. Enable Firestore.
3. Enable `Email/Password` in Firebase Authentication.
4. Create an admin user in Firebase Authentication.
5. Generate a service account key from `Project settings > Service accounts`.
6. Copy Firebase Admin values into `.env`.
7. Copy Firebase Client values into `.env`.
8. Get the Firebase Auth user `uid`.
9. Set custom claim `admin=true` for that user.
10. Start the app with:

```bash
NODE_ENV=production npm start
```

Open:

- `http://127.0.0.1:9001/submit-domain`
- `http://127.0.0.1:9001/admin`

## Set `admin=true`

Example one-off Node snippet:

```js
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  })
});

await getAuth().setCustomUserClaims('FIREBASE_AUTH_UID', { admin: true });
console.log('admin=true applied');
```

## PM2

Use the included PM2 config:

```bash
pm2 start pm2.config.json
pm2 logs tempmail_9001
pm2 save
```

## Useful Routes

- `GET /health`
- `GET /ready`
- `GET /generate`
- `GET /domains`
- `POST /domains/submit`
- `GET /admin/submissions?status=pending`
- `GET /admin/domains`

## Quick Checks

Check Firebase client config:

```bash
curl http://127.0.0.1:9001/firebase/config
```

Check domain source:

```bash
curl http://127.0.0.1:9001/domains
```

## Troubleshooting

If `/firebase/config` returns `enabled: false`:
- Firebase client env is missing or incomplete

If `/admin/*` returns `503 Firebase admin is not configured`:
- Firebase Admin env is missing or invalid

If login succeeds then signs out:
- the Firebase user does not have custom claim `admin=true`

If production `/domains` or `/generate` returns `503`:
- `NODE_ENV=production` is on
- but Firestore/Admin credentials are not ready

If local/dev should work without Firebase:
- keep `NODE_ENV` unset or non-production
- keep `DOMAINS=...` in `.env`
