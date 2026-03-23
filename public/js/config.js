const SITE_ORIGIN = window.location.origin || 'https://tempmailv5.site';
const SITE_PATHNAME = window.location.pathname || '/';
const SITE_PATH = `${SITE_ORIGIN}${SITE_PATHNAME === '/' ? '' : SITE_PATHNAME}`;

const CONFIG = {
  API_BASE: '',
  SITE_ORIGIN,
  SITE_PATHNAME,
  SITE_PATH,
  EMAIL_KEY: 'temp_mail_address',
  DOMAIN_KEY: 'temp_mail_domain',
  AUTO_REFRESH_KEY: 'temp_mail_auto_refresh',
  REFRESH_INTERVAL_KEY: 'temp_mail_refresh_interval',
  SESSION_START_KEY: 'temp_mail_session_start',
  REQUEST_TIMEOUT: 12000,
  TOAST_DURATION: 3500,
  TOAST_DURATION_LONG: 6000,
  SEARCH_DEBOUNCE: 250,
  STATUS: {
    ONLINE: { text: 'Online', class: 'online' },
    OFFLINE: { text: 'Offline', class: 'offline' },
    LOADING: { text: 'Syncing', class: 'loading' }
  }
};

window.__TEMPMAIL_SITE__ = {
  origin: SITE_ORIGIN,
  pathname: SITE_PATHNAME,
  path: SITE_PATH
};

Object.freeze(CONFIG);
Object.freeze(CONFIG.STATUS);
Object.freeze(window.__TEMPMAIL_SITE__);

export default CONFIG;
