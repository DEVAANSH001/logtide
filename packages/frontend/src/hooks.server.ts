import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import { logtideHandle, logtideHandleError, logtideHandleFetch } from '@logtide/sveltekit';

/**
 * Server hook to inject runtime configuration into the HTML.
 * This allows the API URL to be configured at runtime via Docker environment variables.
 *
 * When PUBLIC_API_URL is empty or not set, the frontend will use relative URLs,
 * which works when frontend and backend are behind the same reverse proxy.
 */
const configHandle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event, {
    transformPageChunk: ({ html }) => {
      // Get API URL from environment variable at runtime
      // Empty string means same-origin (relative URLs) - ideal for reverse proxy setup
      // If not set at all, use empty string to enable same-origin by default in production
      const apiUrl = env.PUBLIC_API_URL ?? '';

      // Inject the config script before the closing </head> tag
      const configScript = `<script>window.__LOGTIDE_CONFIG__={apiUrl:"${apiUrl}"}</script>`;

      return html.replace('</head>', `${configScript}</head>`);
    },
  });

  return response;
};

// Compose LogTide SDK hooks with existing config injection
const dsn = privateEnv?.LOGTIDE_DSN || '';

export const handle = dsn
  ? sequence(
      logtideHandle({
        dsn,
        service: 'logtide-frontend',
        environment: privateEnv?.NODE_ENV || 'production',
      }) as unknown as Handle,
      configHandle
    )
  : configHandle;

export const handleError = dsn ? logtideHandleError() : undefined;
export const handleFetch = dsn ? logtideHandleFetch() : undefined;
