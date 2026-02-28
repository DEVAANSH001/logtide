import { hub } from '@logtide/core';
import { initLogtide, logtideHandleError } from '@logtide/sveltekit';
import { env } from '$env/dynamic/public';

// Initialize client-side logging
const dsn = env.PUBLIC_LOGTIDE_DSN || '';
if (dsn) {
  initLogtide({
    dsn,
    service: 'logtide-frontend-client',
    environment: 'development',
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
