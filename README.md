# TempMail

TempMail is a single-process Node.js app for disposable inbox testing.

It serves the frontend, receives email over SMTP, stores metadata in Firestore, keeps hot data in Redis, and stores message bodies / attachments in S3-compatible object storage. The project does not use Express. HTTP routing is handled directly in `src/servers/http.js`.

## Preview

![Inbox preview](preview/inbox.png)

![Submit domain preview](preview/submit-domain.png)

![Admin dashboard preview](preview/dashboard.png)

![User dashboard preview](preview/user-dashboard.png)

## Features

- anonymous inbox generation and message reading
- SMTP mail ingestion in the same process as HTTP
- signed-in dashboard for saved inboxes at `/app`
- guest mode for `/app` before login
- email/password login, Google sign-in, and password reset with Firebase
- public domain submission flow
- admin moderation for domains
- admin account management for registered users
- admin inspection of user-owned email addresses and their mails

## Pages

- `/` anonymous inbox UI
- `/login` login and register
- `/forgot-password` password reset request page
- `/app` signed-in dashboard with guest shell before login
- `/submit-domain` public domain submission page
- `/admin` admin console
- `/privacy` privacy page

## Architecture

```text
HTTP routes -> services -> repositories -> Redis / Firestore / S3
SMTP -> mail processing -> repositories / storage
```

### Backend

```text
src/
├── config/
│   └── env.js
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
│   └── routes/
│       ├── admin.routes.js
│       ├── anonymous.routes.js
│       ├── dev.routes.js
│       ├── domain.routes.js
│       ├── inbox.routes.js
│       └── user.routes.js
├── services/
│   ├── admin/
│   │   ├── admin-domain.service.js
│   │   ├── admin-email.service.js
│   │   ├── admin-mail.service.js
│   │   ├── admin-overview.service.js
│   │   └── admin-user.service.js
│   ├── anonymous/
│   │   ├── anonymous-inbox.service.js
│   │   └── anonymous-mail.service.js
│   ├── user/
│   │   ├── user-inbox.service.js
│   │   ├── user-mail.service.js
│   │   └── user-profile.service.js
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
└── index.js
```

### Frontend

```text
public/
├── pages/
│   ├── index.html
│   ├── login.html
│   ├── forgot-password.html
│   ├── app.html
│   ├── admin.html
│   ├── submit-domain.html
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

- `index`, `login`, `forgot-password`, `app`, and `submit-domain` use shared theme and i18n.
- `admin` and `privacy` are English-only.
- static pages are served from `public/pages`
- static assets are served directly from `public/`

## Route Map

### Public Pages And System

- `GET /`
- `GET /login`
- `GET /forgot-password`
- `GET /app`
- `GET /submit-domain`
- `GET /admin`
- `GET /privacy`
- `GET /health`
- `GET /ready`
- `GET /favicon.ico`

### Config / Public API

- `GET /domains`
- `GET /firebase/config`
- `POST /domains/submit`
- `GET /submit-domain/config`

`GET /firebase/config` is used by the frontend for:

- Firebase web config
- `is_production`
- `app_inbox_page_size`

### Anonymous Inbox API

- `GET /generate`
- `GET /inbox/:email`
- `GET /mail/:id`
- `GET /mail/:id/html`
- `GET /mail/:id/attachments/:index`
- `DELETE /mail/:email`
- `DELETE /inbox/:email/:id`
- `DELETE /inbox/:email/mails`

### User API

All `/user/*` routes require a valid Firebase ID token.

- `GET /user/me`
- `GET /user/inboxes`
- `POST /user/inboxes`
- `POST /user/inboxes/:email/read`
- `DELETE /user/inboxes/:email`
- `DELETE /user/inboxes`

### Admin API

All `/admin/*` API routes require a valid Firebase ID token with `admin=true`.

Domain moderation:

- `GET /admin/overview`
- `GET /admin/submissions`
- `GET /admin/domains`
- `POST /admin/submissions/:id/approve`
- `POST /admin/submissions/:id/reject`
- `POST /admin/domains`
- `POST /admin/domains/:id/update`
- `POST /admin/domains/:id/activate`
- `POST /admin/domains/:id/deactivate`
- `POST /admin/domains/:id/delete`
- `POST /admin/domains/:id/extend`

User / email / mail inspection:

- `GET /admin/users`
- `GET /admin/users/:uid`
- `POST /admin/users/:uid/update`
- `POST /admin/users/:uid/delete`
- `GET /admin/users/:uid/emails`
- `POST /admin/users/:uid/emails/delete`
- `POST /admin/users/:uid/emails/:email/delete`
- `GET /admin/emails/:email/mails`
- `GET /admin/mails/:id`

### Dev

- `POST /dev/send-test-mail`

The `/app` UI hides the test-mail button when `is_production` is true.

## Local Setup

### 1. Install

```bash
npm install
```

### 2. Create `.env`

```bash
cp .env.example .env
```

### 3. Configure Runtime Services

Minimum runtime dependencies:

- Redis
- S3-compatible object storage
- Firebase Admin credentials

If you use login, reset password, Google sign-in, `/app`, or `/admin`, also configure:

- Firebase client config
- Firebase Authentication providers

### 4. Start

```bash
npm start
```

Development:

```bash
npm run dev
```

Default local endpoints:

- HTTP: `http://127.0.0.1:9001`
- SMTP: `127.0.0.1:25`

## Useful Commands

Health checks:

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

Send a local SMTP test mail:

```bash
npm run test:smtp -- --to your-mail@tempmail.local --subject "hello" --body "local smtp test"
```

## Important Environment Variables

### General

```env
NODE_ENV=development
API_PORT=9001
SMTP_PORT=25
APP_BASE_URL=http://127.0.0.1:9001
```

### Mail / Pagination / Rate Limit

```env
MAIL_TTL=0
MAX_INBOX=50
ANYMOUSE_INBOX_PAGE_SIZE=5
APP_INBOX_PAGE_SIZE=20
GENERATE_RATE_LIMIT_MAX=10
GENERATE_RATE_LIMIT_WINDOW_SECONDS=60
```

Meaning:

- `MAIL_TTL` controls mail expiry
- `MAX_INBOX` keeps only the newest N mails per inbox
- `ANYMOUSE_INBOX_PAGE_SIZE` controls anonymous inbox page size
- `APP_INBOX_PAGE_SIZE` controls signed-in dashboard page size
- `GENERATE_RATE_LIMIT_MAX` and `GENERATE_RATE_LIMIT_WINDOW_SECONDS` control `/generate` rate limiting

### Redis / S3 / Firebase

See `.env.example` for the full set.

At minimum, configure:

- Redis connection
- S3 endpoint, bucket, and credentials
- Firebase Admin credentials
- Firebase client config for login flows

## Manual Test Checklist

- `/`
  - generate inbox
  - refresh
  - auto-refresh
  - open mail
  - delete mail / inbox
- `/login`
  - email/password login
  - register
  - Google sign-in
- `/forgot-password`
  - request reset mail
- `/app`
  - guest mode
  - login redirect
  - create inbox
  - inbox list / mail list
  - modal mail view
  - auto-refresh does not collapse current mail
  - logout returns to guest mode
- `/submit-domain`
  - submit request
- `/admin`
  - login redirect
  - overview
  - domains moderation
  - users list
  - user email list
  - mail inspection
  - edit / delete user
  - delete one email / delete all emails
- `/privacy`
  - loads without asset issues

## Notes

- favicon is served from `public/images/temp-mail-icon.png`
- page routes are mapped in `src/servers/http.js`
- anonymous inboxes are separate from registered-user inbox ownership
- admin `Users -> Emails -> Mails` is for registered accounts; anonymous inboxes are a separate data path
