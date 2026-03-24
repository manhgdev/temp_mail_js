# TempMail

TempMail is a single-process Node.js app for disposable inbox testing. It serves the frontend, receives mail over SMTP, stores mail metadata in Firestore, keeps hot data in Redis, and stores mail bodies and attachments in S3-compatible storage.

The app does not use Express. HTTP routing is handled directly in `src/servers/http.js`, and SMTP runs in the same process through `src/servers/smtp.js`.

## What It Does

- generate anonymous inboxes from active domains
- receive real mail through SMTP
- read inboxes and messages from the web UI
- let signed-in users manage saved inboxes with Firebase Authentication
- provide a guest-mode dashboard shell at `/app` before login
- support password reset through `/forgot-password`
- let users submit domains for review
- let admins approve, reject, activate, deactivate, extend, update, and delete domains

## Current Pages

- `/` anonymous inbox UI
- `/login` login and register
- `/forgot-password` password reset request page
- `/app` user dashboard
- `/submit-domain` public domain submission page
- `/admin` admin UI
- `/privacy` privacy page

## Architecture

```text
routes -> services -> repositories -> Redis / Firestore / S3
```

```text
src/
├── config/
│   └── env.js
├── repositories/
├── servers/
│   ├── http.js
│   ├── smtp.js
│   └── routes/
│       ├── admin.routes.js
│       ├── dev.routes.js
│       ├── domain.routes.js
│       ├── inbox.routes.js
│       └── user.routes.js
├── services/
└── index.js
```

## Frontend Structure

```text
public/
├── pages/
│   ├── index.html
│   ├── login.html
│   ├── forgot-password.html
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

- `index`, `login`, `forgot-password`, `app`, and `submit-domain` use shared theme + i18n.
- `admin` and `privacy` are English-only.
- `/app` supports guest mode: the dashboard shell still renders before login, but user actions redirect to login/register when needed.

## Route Map

### Public pages and system routes

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

### Domain routes

- `GET /domains`
- `GET /firebase/config`
- `POST /domains/submit`
- `GET /submit-domain/config`

`GET /firebase/config` is also used by the frontend to read:

- Firebase client config
- `is_production`
- `app_inbox_page_size`

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

All `/admin/*` API routes require a valid Firebase ID token with `admin=true`.

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

This route is only intended for non-production use. The `/app` UI hides the test-mail button when `is_production` is true.

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create `.env`

```bash
cp .env.example .env
```

### 3. Configure services

Minimum runtime dependencies:

- Redis
- S3-compatible object storage
- Firebase Admin credentials

If you use login, reset password, Google sign-in, or admin UI, also configure:

- Firebase client config
- Firebase Authentication providers

### 4. Start the app

```bash
npm start
```

For development:

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

Send a local test mail:

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

### Inbox pagination and limits

```env
ANYMOUSE_INBOX_PAGE_SIZE=5
APP_INBOX_PAGE_SIZE=20
GENERATE_RATE_LIMIT_MAX=10
GENERATE_RATE_LIMIT_WINDOW_SECONDS=60
MAX_INBOX=...
```

Notes:

- `ANYMOUSE_INBOX_PAGE_SIZE` controls anonymous inbox page size.
- `APP_INBOX_PAGE_SIZE` controls signed-in dashboard inbox page size.
- `GENERATE_RATE_LIMIT_MAX` and `GENERATE_RATE_LIMIT_WINDOW_SECONDS` control `/generate` rate limiting.

### Firebase

Backend and frontend both depend on Firebase-related env values defined in `src/config/env.js`.

At minimum, configure:

- Firebase Admin credentials for backend verification
- Firebase web config for client login flows

### Storage and cache

Configure:

- Redis connection
- S3 bucket / endpoint / credentials
- Firestore / Google Cloud project access

## Manual Test Checklist

- `/` can generate an inbox, refresh, auto-refresh, open mail, and delete mail
- `/login` can log in with email/password
- `/login` can register
- `/login` can sign in with Google
- `/forgot-password` can request a reset mail
- `/app` guest mode renders correctly before login
- `/app` can create inboxes after login
- `/app` can load inbox list, mail list, and mail modal
- `/app` auto-refresh does not break the current mail view
- `/app` logout returns to guest mode instead of redirecting away
- `/submit-domain` works
- `/admin` works
- `/privacy` loads without asset issues

## Notes

- Static frontend files are served directly from `public/`.
- Page routes map to files in `public/pages/`.
- The favicon is served from `public/images/temp-mail-icon.png`.
