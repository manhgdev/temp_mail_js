import CONFIG from './config.js';
import enTranslations from '../i18n/translations.en.js';

const STORAGE_KEY = 'temp_mail_language';
const GOOGLE_STORAGE_KEY = 'temp_mail_google_language';
const SUPPORTED_LANGUAGES = ['en', 'vi'];
const DEFAULT_LANGUAGE = 'en';
const GOOGLE_ELEMENT_ID = 'temp-mail-google-translate-element';
const GOOGLE_SCRIPT_ID = 'temp-mail-google-translate-script';

const LANGUAGE_OPTIONS = [
  { code: 'en', label: '🇺🇸 English', native: true },
  { code: 'vi', label: '🇻🇳 Vietnamese', native: true },
  { code: 'zh-CN', label: '🇨🇳 中文' },
  { code: 'id', label: '🇮🇩 Indonesia' },
  { code: 'cs', label: '🇨🇿 Čeština' },
  { code: 'es', label: '🇪🇸 Español' },
  { code: 'fr', label: '🇫🇷 Français' },
  { code: 'de', label: '🇩🇪 German' },
  { code: 'it', label: '🇮🇹 Italian' },
  { code: 'hu', label: '🇭🇺 Magyar' },
  { code: 'bg', label: '🇧🇬 Български' },
  { code: 'ms', label: '🇲🇾 Malaysia' },
  { code: 'nl', label: '🇳🇱 Nederlands' },
  { code: 'pl', label: '🇵🇱 Polish' },
  { code: 'fil', label: '🇵🇭 Filipino' },
  { code: 'pt', label: '🇵🇹 Português' },
  { code: 'th', label: '🇹🇭 Thailand' },
  { code: 'tr', label: '🇹🇷 Turkish (Turkey)' },
  { code: 'el', label: '🇬🇷 Ελληνικά' },
  { code: 'uk', label: '🇺🇦 українська мова' },
  { code: 'ru', label: '🇷🇺 Русский' },
  { code: 'ar', label: '🇸🇦 عربي' },
  { code: 'my', label: '🇲🇲 မြန်မာ' },
  { code: 'bn', label: '🇧🇩 বাংলা' },
  { code: 'ko', label: '🇰🇷 한국어' },
  { code: 'ja', label: '🇯🇵 日本語' },
  { code: 'jv', label: '🏴 Basa Jawa' },
  { code: 'ro', label: '🇷🇴 Română' }
];

let googleTranslateReady;
let viTranslationsReady = null;
const translations = {
  en: enTranslations
};

const ensureLanguageLoaded = async (lang) => {
  if (lang !== 'vi' || translations.vi) {
    return;
  }

  if (!viTranslationsReady) {
    viTranslationsReady = import('../i18n/translations.vi.js').then((module) => {
      translations.vi = module.default || {};
    });
  }

  await viTranslationsReady;
};

const updateSeoSchemas = (lang = getLanguage()) => {
  const siteUrl = CONFIG.SITE_ORIGIN;

  const websiteSchemaNode = document.getElementById('homepage-website-schema');
  if (websiteSchemaNode) {
    websiteSchemaNode.textContent = JSON.stringify(
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'TempMail',
        url: `${siteUrl}/`,
        inLanguage: ['en', 'vi']
      },
      null,
      2
    );
  }

  const appSchemaNode = document.getElementById('homepage-app-schema');
  if (appSchemaNode) {
    appSchemaNode.textContent = JSON.stringify(
      {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'TempMail',
        url: `${siteUrl}/`,
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Web',
        description: t('page.home.schema.app_description', {}, lang),
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD'
        }
      },
      null,
      2
    );
  }
};

const interpolate = (template, vars = {}) =>
  String(template).replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? `{${key}}`));

export const getSupportedLanguages = () => [...SUPPORTED_LANGUAGES];

const findLanguageOption = (code) =>
  LANGUAGE_OPTIONS.find((option) => option.code === code) || null;

const getGoogleLanguage = () => {
  const stored = localStorage.getItem(GOOGLE_STORAGE_KEY);
  return stored && findLanguageOption(stored) ? stored : '';
};

const isNativeLanguage = (lang) => SUPPORTED_LANGUAGES.includes(lang);

const setCookieValue = (name, value, maxAgeSeconds = 31536000) => {
  const cookie = `${name}=${value}; path=/; max-age=${maxAgeSeconds}`;
  document.cookie = cookie;

  const hostParts = window.location.hostname.split('.');
  if (hostParts.length > 1) {
    const rootDomain = hostParts.slice(-2).join('.');
    document.cookie = `${name}=${value}; path=/; max-age=${maxAgeSeconds}; domain=.${rootDomain}`;
  }
};

const clearCookieValue = (name) => {
  document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;

  const hostParts = window.location.hostname.split('.');
  if (hostParts.length > 1) {
    const rootDomain = hostParts.slice(-2).join('.');
    document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; domain=.${rootDomain}`;
  }
};

const setGoogleTranslateCookies = (targetLang) => {
  const value = `/en/${targetLang}`;
  setCookieValue('googtrans', value);
};

const clearGoogleTranslateCookies = () => {
  clearCookieValue('googtrans');
};

const ensureGoogleTranslateHost = () => {
  let host = document.getElementById(GOOGLE_ELEMENT_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = GOOGLE_ELEMENT_ID;
    host.className = 'google-translate-host';
    document.body.appendChild(host);
  }

  return host;
};

const ensureGoogleTranslateReady = () => {
  if (googleTranslateReady) {
    return googleTranslateReady;
  }

  googleTranslateReady = new Promise((resolve, reject) => {
    ensureGoogleTranslateHost();

    if (window.google?.translate?.TranslateElement) {
      if (!window.__tempMailGoogleTranslateElement) {
        window.__tempMailGoogleTranslateElement = new window.google.translate.TranslateElement(
          {
            pageLanguage: 'en',
            autoDisplay: false,
            includedLanguages: LANGUAGE_OPTIONS.filter((option) => !option.native)
              .map((option) => option.code)
              .join(',')
          },
          GOOGLE_ELEMENT_ID
        );
      }
      resolve(window.__tempMailGoogleTranslateElement);
      return;
    }

    window.tempMailGoogleTranslateInit = () => {
      try {
        window.__tempMailGoogleTranslateElement = new window.google.translate.TranslateElement(
          {
            pageLanguage: 'en',
            autoDisplay: false,
            includedLanguages: LANGUAGE_OPTIONS.filter((option) => !option.native)
              .map((option) => option.code)
              .join(',')
          },
          GOOGLE_ELEMENT_ID
        );
        resolve(window.__tempMailGoogleTranslateElement);
      } catch (error) {
        reject(error);
      }
    };

    const existingScript = document.getElementById(GOOGLE_SCRIPT_ID);
    if (existingScript) {
      return;
    }

    const script = document.createElement('script');
    script.id = GOOGLE_SCRIPT_ID;
    script.src = 'https://translate.google.com/translate_a/element.js?cb=tempMailGoogleTranslateInit';
    script.async = true;
    script.onerror = () => reject(new Error('Failed to load Google Translate'));
    document.head.appendChild(script);
  });

  return googleTranslateReady;
};

const applyStoredGoogleTranslation = async () => {
  const googleLang = getGoogleLanguage();
  if (!googleLang) {
    return;
  }

  setGoogleTranslateCookies(googleLang);

  try {
    await ensureGoogleTranslateReady();

    let attempts = 0;
    const maxAttempts = 20;
    const timer = window.setInterval(() => {
      const combo = document.querySelector('.goog-te-combo');
      attempts += 1;

      if (!combo) {
        if (attempts >= maxAttempts) {
          window.clearInterval(timer);
        }
        return;
      }

      if (combo.value !== googleLang) {
        combo.value = googleLang;
        combo.dispatchEvent(new Event('change'));
      }

      window.clearInterval(timer);
    }, 300);
  } catch (error) {
    console.error(error);
  }
};

const getCurrentSelection = () => getGoogleLanguage() || getLanguage();

const getCurrentLanguageLabel = () => {
  const selection = getCurrentSelection();
  const option = findLanguageOption(selection);
  return option?.label || t(`lang.current.${getLanguage()}`, {}, getLanguage());
};

const renderLanguageOptions = (switcher) => {
  const menu = switcher.querySelector('[data-language-menu]');
  if (!menu) {
    return;
  }

  menu.innerHTML = LANGUAGE_OPTIONS.map((option) => {
    const nativeAttr = option.native ? 'data-native="true"' : '';
    return `<button type="button" class="language-option" data-lang="${option.code}" ${nativeAttr} role="menuitemradio" aria-checked="false">${option.label}</button>`;
  }).join('');
};

export const getLanguage = () => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && SUPPORTED_LANGUAGES.includes(stored)) {
    return stored;
  }

  const browserLang = (navigator.language || '').toLowerCase().split('-')[0];
  if (browserLang === 'vi') {
    return 'vi';
  }

  return DEFAULT_LANGUAGE;
};

export const t = (key, vars = {}, lang = getLanguage()) => {
  const dict = translations[lang] || translations[DEFAULT_LANGUAGE];
  const fallback = translations[DEFAULT_LANGUAGE];
  const value = dict[key] ?? fallback[key] ?? key;
  return interpolate(value, vars);
};

export const setLanguage = async (lang) => {
  const next = SUPPORTED_LANGUAGES.includes(lang) ? lang : DEFAULT_LANGUAGE;
  const hadGoogleTranslation = Boolean(getGoogleLanguage());
  localStorage.setItem(STORAGE_KEY, next);
  localStorage.removeItem(GOOGLE_STORAGE_KEY);
  clearGoogleTranslateCookies();

  if (hadGoogleTranslation) {
    window.location.reload();
    return next;
  }

  await ensureLanguageLoaded(next);
  applyTranslations(document, next);
  window.dispatchEvent(new CustomEvent('tempmail:languagechange', { detail: { lang: next } }));
  return next;
};

export const setTranslatedLanguage = (lang) => {
  if (!findLanguageOption(lang) || isNativeLanguage(lang)) {
    return;
  }

  localStorage.setItem(STORAGE_KEY, DEFAULT_LANGUAGE);
  localStorage.setItem(GOOGLE_STORAGE_KEY, lang);
  setGoogleTranslateCookies(lang);
  window.location.reload();
};

export const applyTranslations = (root = document, lang = getLanguage(), vars = {}) => {
  if (root === document) {
    document.documentElement.lang = lang;
  }

  root.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n, vars, lang);
  });

  root.querySelectorAll('[data-i18n-html]').forEach((node) => {
    node.innerHTML = t(node.dataset.i18nHtml, vars, lang);
  });

  root.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
    node.setAttribute('placeholder', t(node.dataset.i18nPlaceholder, vars, lang));
  });

  root.querySelectorAll('[data-i18n-title]').forEach((node) => {
    node.setAttribute('title', t(node.dataset.i18nTitle, vars, lang));
  });

  root.querySelectorAll('[data-i18n-aria-label]').forEach((node) => {
    node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel, vars, lang));
  });

  root.querySelectorAll('[data-i18n-content]').forEach((node) => {
    node.setAttribute('content', t(node.dataset.i18nContent, vars, lang));
  });

  if (root === document) {
    const titleNode = document.querySelector('title[data-i18n]');
    if (titleNode) {
      document.title = titleNode.textContent || document.title;
    }

    updateSeoSchemas(lang);
  }

  updateLanguageSwitcher(lang);
};

export const setupLanguageSwitcher = (root = document) => {
  const switcher = root.querySelector('[data-language-switcher]');
  if (!switcher) {
    return;
  }

  renderLanguageOptions(switcher);

  const trigger = switcher.querySelector('[data-language-trigger]');

  const closeMenu = () => {
    switcher.classList.remove('open');
    trigger?.setAttribute('aria-expanded', 'false');
  };

  const openMenu = () => {
    switcher.classList.add('open');
    trigger?.setAttribute('aria-expanded', 'true');
  };

  const toggleMenu = () => {
    if (switcher.classList.contains('open')) {
      closeMenu();
      return;
    }

    openMenu();
  };

  trigger?.addEventListener('click', (event) => {
    event.preventDefault();
    toggleMenu();
  });

  switcher.querySelectorAll('[data-lang]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (button.dataset.native === 'true') {
        await setLanguage(button.dataset.lang);
      } else {
        setTranslatedLanguage(button.dataset.lang);
      }
      closeMenu();
    });
  });

  document.addEventListener('click', (event) => {
    if (!switcher.contains(event.target)) {
      closeMenu();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMenu();
    }
  });

  updateLanguageSwitcher(getLanguage(), switcher);
};

export const updateLanguageSwitcher = (lang = getLanguage(), switcher = document.querySelector('[data-language-switcher]')) => {
  if (!switcher) {
    return;
  }

  const currentSelection = getCurrentSelection();
  switcher.querySelectorAll('[data-lang]').forEach((button) => {
    const active = button.dataset.lang === currentSelection;
    button.classList.toggle('active', active);
    button.setAttribute('aria-checked', String(active));
  });

  const currentLabel = switcher.querySelector('[data-language-current]');
  if (currentLabel) {
    currentLabel.textContent = getCurrentLanguageLabel();
  }
};

export const initI18n = async (root = document, vars = {}) => {
  const lang = getLanguage();
  await ensureLanguageLoaded(lang);
  setupLanguageSwitcher(root);
  applyTranslations(root, lang, vars);

  if (root === document) {
    void applyStoredGoogleTranslation();
  }
};

window.TempMailI18n = {
  t,
  getLanguage,
  setLanguage,
  setTranslatedLanguage,
  initI18n,
  applyTranslations
};

export default {
  t,
  getLanguage,
  setLanguage,
  setTranslatedLanguage,
  initI18n,
  applyTranslations,
  STORAGE_KEY
};
