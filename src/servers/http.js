import http from 'node:http';
import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBrotliCompress, createGzip } from 'node:zlib';
import redis from '../services/redis.js';
import { ENV } from '../config/env.js';
import { sendJson, notFound } from './helpers.js';
import { handleInboxRoutes } from './routes/inbox.routes.js';
import { handleAdminRoutes } from './routes/admin.routes.js';
import { handleDomainRoutes } from './routes/domain.routes.js';
import { handleDevRoutes } from './routes/dev.routes.js';
import { handleUserRoutes } from './routes/user.routes.js';

const API_PORT = ENV.API_PORT;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const publicDir = path.join(rootDir, 'public');
const pagesDir = path.join(publicDir, 'pages');

// ─── Static file helpers ───────────────────────────────────────────────────

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.xml', 'application/xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.ico', 'image/x-icon'],
  ['.woff2', 'font/woff2']
]);

const compressibleExtensions = new Set(['.css', '.html', '.js', '.json', '.svg', '.txt', '.xml']);

const getStaticCacheControl = (filePath, extension) => {
  if (extension === '.html') return 'no-cache';
  if (
    filePath.includes(`${path.sep}vendor${path.sep}fontawesome${path.sep}`) ||
    extension === '.woff2' ||
    extension === '.css' ||
    extension === '.js'
  ) {
    return 'public, max-age=31536000, immutable';
  }
  if (compressibleExtensions.has(extension)) {
    return 'public, max-age=2592000, stale-while-revalidate=86400';
  }
  return 'public, max-age=86400';
};

const getAcceptedEncoding = (request, extension) => {
  if (!compressibleExtensions.has(extension)) return '';
  const acceptEncoding = String(request.headers['accept-encoding'] || '');
  if (acceptEncoding.includes('br')) return 'br';
  if (acceptEncoding.includes('gzip')) return 'gzip';
  return '';
};

const serveFile = async (request, response, filePath) => {
  const extension = path.extname(filePath).toLowerCase();
  const stats = await fs.stat(filePath);
  const etag = `W/"${stats.size}-${stats.mtimeMs}"`;
  const lastModified = stats.mtime.toUTCString();

  if (
    request.headers['if-none-match'] === etag ||
    request.headers['if-modified-since'] === lastModified
  ) {
    response.writeHead(304, {
      etag,
      'last-modified': lastModified,
      'cache-control': getStaticCacheControl(filePath, extension)
    });
    response.end();
    return;
  }

  const contentEncoding = getAcceptedEncoding(request, extension);
  const headers = {
    'content-type': contentTypes.get(extension) ?? 'application/octet-stream',
    'cache-control': getStaticCacheControl(filePath, extension),
    etag,
    'last-modified': lastModified,
    vary: 'Accept-Encoding'
  };

  if (contentEncoding) {
    headers['content-encoding'] = contentEncoding;
  } else {
    headers['content-length'] = stats.size;
  }

  response.writeHead(200, headers);

  const stream = createReadStream(filePath);
  if (contentEncoding === 'br') { stream.pipe(createBrotliCompress()).pipe(response); return; }
  if (contentEncoding === 'gzip') { stream.pipe(createGzip()).pipe(response); return; }
  stream.pipe(response);
};

// ─── Static page + health routes ──────────────────────────────────────────

const handleSystemRoutes = async ({ method, pathname, request, response }) => {
  if (method !== 'GET') return false;

  if (pathname === '/') {
    await serveFile(request, response, path.join(pagesDir, 'index.html'));
    return true;
  }
  if (pathname === '/login') {
    await serveFile(request, response, path.join(pagesDir, 'login.html'));
    return true;
  }
  if (pathname === '/app') {
    await serveFile(request, response, path.join(pagesDir, 'app.html'));
    return true;
  }
  if (pathname === '/submit-domain') {
    await serveFile(request, response, path.join(pagesDir, 'submit-domain.html'));
    return true;
  }
  if (pathname === '/admin') {
    await serveFile(request, response, path.join(pagesDir, 'admin.html'));
    return true;
  }
  if (pathname === '/privacy') {
    await serveFile(request, response, path.join(pagesDir, 'privacy.html'));
    return true;
  }
  if (pathname === '/health') {
    sendJson(response, 200, { status: 'ok', service: 'temp-mail-api' });
    return true;
  }
  if (pathname === '/ready') {
    try {
      const redisPing = await redis.ping();
      sendJson(response, 200, {
        status: redisPing === 'PONG' ? 'ready' : 'degraded',
        checks: { redis: redisPing }
      });
    } catch (error) {
      sendJson(response, 503, {
        status: 'not_ready',
        checks: { redis: 'ERROR' },
        error: error.message
      });
    }
    return true;
  }

  return false;
};

// ─── Ordered route dispatcher ──────────────────────────────────────────────

const routeHandlers = [
  handleUserRoutes,
  handleAdminRoutes,
  handleDomainRoutes,
  handleDevRoutes,
  handleInboxRoutes,
  handleSystemRoutes
];

// ─── Server factory ────────────────────────────────────────────────────────

export const createHttpServer = () =>
  http.createServer(async (request, response) => {
    try {
      if (!request.url) {
        notFound(response);
        return;
      }

      const url = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`);
      const pathname = url.pathname;
      const method = request.method;
      const ctx = { url, pathname, method, request, response };

      for (const handler of routeHandlers) {
        if (await handler(ctx)) return;
      }

      // Fallback: serve static files from public/
      if (method === 'GET') {
        const filePath = path.join(publicDir, pathname.replace(/^\/+/, ''));
        try {
          const stat = await fs.stat(filePath);
          if (stat.isFile()) {
            await serveFile(request, response, filePath);
            return;
          }
        } catch {
          // fall through to 404
        }
      }

      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    } catch (error) {
      console.error('[http] Unhandled request error:', error);
      sendJson(response, 500, { error: 'Internal server error' });
    }
  });

export const startHttpServer = () =>
  new Promise((resolve, reject) => {
    const server = createHttpServer();
    server.once('error', reject);
    server.listen(API_PORT, '0.0.0.0', () => {
      server.off('error', reject);
      console.log(`[api] listening on port http://127.0.0.1:${API_PORT}`);
      resolve(server);
    });
  });
