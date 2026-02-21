import { hub } from '@logtide/core';
import { initLogtide, logtideHandleError } from '@logtide/sveltekit';

// Initialize client-side logging
// import.meta.env is replaced at build time by Vite; for Docker runtime use $env/dynamic/public in components
const dsn = import.meta.env.PUBLIC_LOGTIDE_DSN || '';
if (dsn) {
  initLogtide({
    dsn,
    service: 'logtide-frontend-client',
    environment: import.meta.env.MODE,
  });

  // Capture initial page load
  const client = hub.getClient();
  if (client) {
    client.captureLog('info', `pageview ${window.location.pathname}`, {
      'page.url': window.location.href,
      'page.pathname': window.location.pathname,
      'page.referrer': document.referrer || undefined,
      'browser.userAgent': navigator.userAgent,
    });
  }
}

export const handleError = logtideHandleError();
