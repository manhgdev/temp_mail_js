# TempMail

TempMail is a single-process Node.js application that combines:

- HTTP API + static frontend delivery
- SMTP mail ingestion
- temporary inbox generation
- Firebase-authenticated user inbox management
- Firestore-backed metadata
- S3-backed mail body and attachments
- Redis-backed hot cache

The app does not use Express. HTTP routes are handled directly in `src/servers/http.js`, and SMTP runs in the same process via `src/servers/smtp.js`.

## Preview

![Inbox preview](preview/inbox.png)

![Submit domain preview](preview/submit-domain.png)

![Admin dashboard preview](preview/dashboard.png)

![User dashboard preview](preview/user-dashboard.png)

## Current Pages

- `/` — anonymous disposable inbox UI
- `/login` — Firebase login/register page
- `/app` — authenticated inbox dashboard
- `/submit-domain` — public domain submission page
- `/admin` — admin domain moderation UI
- `/privacy` — privacy page

## Main Capabilities

- Generate anonymous inboxes from active domains
- Receive real mail through SMTP
- Read inboxes and mail details from the web UI
- Manage user-owned inboxes after Firebase login
- Submit domains for admin review
- Approve, reject, activate, deactivate, extend, and delete managed domains from admin
- Use `.env` domains in local/dev and Firestore-managed domains in production

## Runtime Architecture

```text
src/
├── config/
│   └── env.js
├── constants/
├── models/
├── repositories/
│   ├── domain.repo.js
│   ├── inbox-meta.repo.js
│   ├── mail-cache.repo.js
│   ├── mail-content.repo.js
│   ├── mail-meta.repo.js
│   ├── user-inbox.repo.js
│   └── user.repo.js
├── servers/
│   ├── http.js
│   ├── smtp.js
│   ├── helpers.js
│   └── routes/
│       ├── admin.routes.js
│       ├── dev.routes.js
│       ├── domain.routes.js
│       ├── inbox.routes.js
│       └── user.routes.js
├── services/
│   ├── domain-expiry.service.js
│   ├── domain.service.js
│   ├── firebase-admin.js
│   ├── inbox.service.js
│   ├── mail-processing.service.js
│   ├── mail.service.js
│   ├── rate-limit.service.js
│   ├── redis.js
│   ├── s3.js
│   └── user.service.js
├── utils/
└── index.js
```

Backend flow follows this shape:

```text
routes -> services -> repositories -> Redis / Firestore / S3
```

## Frontend Structure

```text
public/
├── pages/
│   ├── index.html
│   ├── login.html
│   ├── app.html
│   ├── submit-domain.html
│   ├── admin.html
│   └── privacy.html
├── css/
│   ├── core/
│   ├── shells/
│   └── pages/
├── js/
│   ├── core/
│   ├── i18n/
│   └── pages/
├── images/
├── vendor/
├── manifest.json
├── robots.txt
└── sitemap.xml
```

Notes:

- `index`, `login`, `app`, and `submit-domain` use the shared theme system and i18n bundles.
- `admin` and `privacy` are English-only.
- Static pages are served from `public/pages`, while static asset fallback is served from `public`.

## Route Map

### Public + system

- `GET /`
- `GET /login`
- `GET /app`
- `GET /submit-domain`
- `GET /admin`
- `GET /privacy`
- `GET /health`
- `GET /ready`

### Domain routes

- `GET /domains`
- `GET /firebase/config`
- `POST /domains/submit`
- `GET /submit-domain/config`

### Anonymous inbox routes

- `GET /generate`
- `GET /inbox/:email`
- `GET /mail/:id`
- `GET /mail/:id/html`
- `GET /mail/:id/attachments/:index`
- `DELETE /mail/:email`
- `DELETE /inbox/:email/:id`
- `DELETE /inbox/:email/mails`

### User routes

All `/user/*` routes require a valid Firebase ID token.

- `GET /user/me`
- `GET /user/inboxes`
- `POST /user/inboxes`
- `POST /user/inboxes/:email/read`
- `DELETE /user/inboxes/:email`
- `DELETE /user/inboxes`

### Admin routes

All `/admin/*` API routes require a Firebase ID token with `admin=true`.

- `GET /admin/submissions`
- `POST /admin/submissions/:id/approve`
- `POST /admin/submissions/:id/reject`
- `GET /admin/domains`
- `POST /admin/domains`
- `POST /admin/domains/:id/activate`
- `POST /admin/domains/:id/deactivate`
- `POST /admin/domains/:id/delete`
- `POST /admin/domains/:id/update`
- `POST /admin/domains/:id/extend`

### Dev route

- `POST /dev/send-test-mail`

This route is only enabled when `NODE_ENV !== 'production'`.

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create `.env`

Start from `.env.example`:

```bash
cp .env.example .env
```

### 3. Configure required services

At minimum, local runtime expects:

- Redis
- S3-compatible object storage
- Firebase Admin credentials for backend access

If you want login, authenticated dashboard, or admin UI, also configure:

- Firebase client credentials
- Firebase Authentication providers you use in the UI

### 4. Start the app

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

Default local endpoints:

- HTTP: `http://127.0.0.1:9001`
- SMTP: `127.0.0.1:25`

## Useful Local Commands

Health check:

```bash
curl http://127.0.0.1:9001/health
curl http://127.0.0.1:9001/ready
```

Generate an anonymous inbox:

```bash
curl http://127.0.0.1:9001/generate
```

Read an inbox:

```bash
curl http://127.0.0.1:9001/inbox/your-mail@tempmail.local
```

Send a local dev mail:

```bash
npm run test:smtp -- --to your-mail@tempmail.local --subject "hello" --body "local smtp test"
```

## Environment Variables

All examples below come from `.env.example` and `src/config/env.js`.

### App

```env
NODE_ENV=development
API_PORT=9001
SMTP_PORT=25
MAIL_TTL=0
MAX_INBOX=50
DEFAULT_INBOX_PAGE_SIZE=5
```

### Redis

```env
REDIS_URL=
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

### S3 / object storage

```env
S3_ENDPOINT=http://127.0.0.1:9000
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_BUCKET=temp-mail
```

### Domain source

```env
DOMAINS=tempmail.local,tempinbox.local,tempdrop.local
DOMAIN_EXPIRY_SWEEP_INTERVAL_MS=300000
```

Behavior:

- local/dev reads active domains from `DOMAINS`
- production expects managed domains in Firestore
- `DOMAIN_EXPIRY_SWEEP_INTERVAL_MS` controls the periodic expiry sweep

### Mail cache

```env
MAIL_CACHE_PREFIX_VERSION=v1
MAIL_CACHE_INBOX_EXISTS_TTL_SECONDS=60
MAIL_CACHE_INBOX_LIST_TTL_SECONDS=30
MAIL_CACHE_DETAIL_TTL_SECONDS=300
```

### Firebase Admin

```env
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nREPLACE_ME\n-----END PRIVATE KEY-----\n"
```

This is required for backend Firestore access and Firebase token verification.

### Firebase Client

```env
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_APP_ID=
```

This is required by the frontend login/app/admin flows via `GET /firebase/config`.

## Local vs production domain behavior

### Development

- active inbox domains come from `.env` `DOMAINS`
- `/dev/send-test-mail` is enabled
- domain submission/admin screens may still depend on Firebase Admin being configured

### Production

- active domains are expected to come from Firestore-managed domain records
- `/dev/send-test-mail` is disabled
- `/submit-domain` creates pending submissions only
- admin must approve and activate domains

## Firebase Notes

If you want `/login`, `/app`, and `/admin` to work correctly:

1. Create a Firebase project.
2. Enable Firestore.
3. Enable Firebase Authentication.
4. Enable the sign-in methods you want to use in the UI.
5. Add Firebase Admin credentials to `.env`.
6. Add Firebase client credentials to `.env`.
7. For admin access, set a custom claim `admin=true` on the admin user.

## Process Management

This repo includes `pm2.config.json` for PM2-based production startup.

Example:

```bash
pm2 start pm2.config.json
```

## Scripts

From `package.json`:

- `npm start` — start HTTP + SMTP + domain expiry sweep
- `npm run dev` — start with nodemon
- `npm run test:smtp` — send a local SMTP test mail
