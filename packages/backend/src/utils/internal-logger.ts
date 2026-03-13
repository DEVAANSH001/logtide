import { hub } from '@logtide/core';
import { getInternalApiKey } from './internal-logging-bootstrap.js';

let isEnabled = false;
let internalDsn: string | null = null;

/**
 * Build DSN from INTERNAL_DSN env var or from API key + URL
 */
async function buildDsn(): Promise<string | null> {
  // Priority 1: explicit DSN env var
  const envDsn = process.env.INTERNAL_DSN;
  if (envDsn) {
    return envDsn;
  }

  // Priority 2: construct from API key + URL
  const apiKey = await getInternalApiKey();
  if (!apiKey) {
    return null;
  }

  const apiUrl =
    process.env.INTERNAL_LOGGING_API_URL || process.env.API_URL || 'http://localhost:8080';

  // DSN format: https://key@host/path
  return `${apiUrl.replace('://', `://${apiKey}@`)}`;
}

/**
 * Initialize internal logging via hub from @logtide/core.
 * Returns the DSN for use by @logtide/fastify plugin registration.
 */
export async function initializeInternalLogging(): Promise<string | null> {
  const enabled = process.env.INTERNAL_LOGGING_ENABLED !== 'false';

  if (!enabled) {
    return null;
  }

  try {
    const dsn = await buildDsn();

    if (!dsn) {
      console.warn('[Internal Logging] Skipping internal logging - no DSN available');
      return null;
    }

    internalDsn = dsn;
    isEnabled = true;

    // Initialize global hub
    hub.init({
      dsn,
      service: process.env.SERVICE_NAME || 'logtide-backend',
      environment: process.env.NODE_ENV || 'development',
      release: process.env.npm_package_version || '0.8.0-rc6',      batchSize: 50,
      flushInterval: 10000,
      maxBufferSize: 5000,
      maxRetries: 2,
      retryDelayMs: 500,
      circuitBreakerThreshold: 3,
      circuitBreakerResetMs: 30000,
      debug: process.env.NODE_ENV === 'development',
    });

    return dsn;
  } catch (error) {
    console.error('[Internal Logging] Failed to initialize internal logging:', error);
    return null;
  }
}

/**
 * Initialize hub directly (for worker process that doesn't use Fastify)
 */
export async function initializeWorkerLogging(): Promise<void> {
  // initializeInternalLogging already calls hub.init()
  await initializeInternalLogging();
}

/**
 * Get the internal DSN (for @logtide/fastify plugin registration)
 */
export function getInternalDsn(): string | null {
  return internalDsn;
}

/**
 * Check if internal logging is enabled
 */
export function isInternalLoggingEnabled(): boolean {
  return isEnabled;
}

/**
 * Shutdown internal logging (flush pending logs)
 */
export async function shutdownInternalLogging(): Promise<void> {
  if (isEnabled) {
    await hub.close();
  }
}
