import { initLogtide, logtideHandleError } from '@logtide/sveltekit';

// Initialize client-side logging (DSN injected at build time via PUBLIC_ env var)
const dsn = import.meta.env.PUBLIC_LOGTIDE_DSN || '';
if (dsn) {
  initLogtide({
    dsn,
    service: 'logtide-frontend',
    environment: import.meta.env.MODE,
  });
}

export const handleError = logtideHandleError();
