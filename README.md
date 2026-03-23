# TempMail

Single-process Node app for:
- temporary inbox generation
- SMTP mail ingestion
- static frontend delivery
- Firestore-backed mail metadata
- S3-backed mail content
- Redis-backed hot cache
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
- Firestore-backed inbox and mail metadata
- S3-backed mail body and attachments
- Redis-backed inbox/detail cache
- `.env DOMAINS` fallback for active domains in local/dev

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
- SMTP: `127.0.0.1:25` or whatever `SMTP_PORT` is set to in `.env`

Current storage flow:

- Firestore stores inbox and mail metadata
- S3 stores mail body and attachments
- Redis stores hot cache for inbox existence, inbox list, and mail detail

Important:
- Production is the primary supported mail storage path
- Mail and inbox flows require valid Firebase Admin credentials
- `.env DOMAINS` only controls which domains are available for inbox generation in local/dev

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

Local development reads active domains from `.env`:

```env
DOMAINS=tempmail.local,tempinbox.local,tempdrop.local
```

Notes:
- This only affects active domains for inbox generation.
- Mail/inbox metadata still uses Firestore.
- Mail content still uses S3.
- Redis is still used as cache.
- Local/dev should be treated as a production-like environment for mail flow.

### Production

When `NODE_ENV=production`, the app reads active domains from Firestore instead of `.env`.

Public behavior:
- `/submit-domain` creates a pending submission only
- submitted domains never become active automatically
- admin must review and activate them

## Environment

Use `.env.example` as the starting point.

### App

Basic runtime settings:

```env
NODE_ENV=development
API_PORT=9001
SMTP_PORT=25
MAIL_TTL=0
MAX_INBOX=50
DEFAULT_INBOX_PAGE_SIZE=5
```

Notes:
- Set `NODE_ENV=production` to switch active domain source from `.env DOMAINS` to Firestore.
- `API_PORT` is used by the HTTP server.
- `SMTP_PORT` is used by the SMTP receiver.
- `MAIL_TTL` controls local Redis mail TTL when used by storage logic.
- `MAX_INBOX` controls how many newest emails are kept per inbox.
- `DEFAULT_INBOX_PAGE_SIZE` controls how many emails are returned per page by default when reading an inbox.

### Redis

Used for hot mail cache and health checks:

```env
REDIS_URL=
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

Notes:
- Prefer `REDIS_URL` for managed Redis.
- If `REDIS_URL` is empty, the app uses `REDIS_HOST` and `REDIS_PORT`.
- Redis is not the source of truth for mail storage.

### S3 / Object Storage

Used for mail bodies and attachments:

```env
S3_ENDPOINT=http://127.0.0.1:9000
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_BUCKET=temp-mail
```

### Domains

Used for inbox generation and domain expiry sweep:

```env
DOMAINS=tempmail.local,tempinbox.local,tempdrop.local
DOMAIN_EXPIRY_SWEEP_INTERVAL_MS=300000
```

Notes:
- In local/dev, `DOMAINS` is the active domain source.
- In production, active domains are expected to come from Firestore.
- `DOMAIN_EXPIRY_SWEEP_INTERVAL_MS` controls how often production checks and disables expired domains.
- This section controls active domains only, not mail metadata storage.

### Mail Cache

Used to tune Redis cache behavior for inbox/mail reads:

```env
MAIL_CACHE_PREFIX_VERSION=v1
MAIL_CACHE_INBOX_EXISTS_TTL_SECONDS=60
MAIL_CACHE_INBOX_LIST_TTL_SECONDS=30
MAIL_CACHE_DETAIL_TTL_SECONDS=300
```

Notes:
- `MAIL_CACHE_PREFIX_VERSION` lets you invalidate the whole cache namespace by bumping the version.
- `MAIL_CACHE_INBOX_EXISTS_TTL_SECONDS` controls inbox existence cache TTL.
- `MAIL_CACHE_INBOX_LIST_TTL_SECONDS` controls inbox list cache TTL.
- `MAIL_CACHE_DETAIL_TTL_SECONDS` controls mail detail cache TTL.

### Firebase Admin

Required for mail/inbox metadata storage and admin token verification:

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
- `GET /inbox/:email`
- `GET /inbox/:email?limit=50&before=2026-01-01T00:00:00.000Z`
- `GET /mail/:id`
- `GET /mail/:id/html`
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

If `/generate`, `/inbox/*`, `/mail/*`, or SMTP receive flow fails with Firebase Admin errors:
- Firebase Admin env is missing or invalid
- current mail/inbox flow requires Firestore metadata storage

If local/dev should work:
- keep `NODE_ENV` unset or non-production unless you want production domain sourcing for active domains
- keep `DOMAINS=...` in `.env` for active domain generation
- still configure Firebase Admin for inbox/mail metadata
- still configure S3/object storage for mail body and attachments
