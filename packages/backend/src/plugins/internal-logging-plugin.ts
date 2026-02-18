import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { logtide } from '@logtide/fastify';
import { getInternalDsn, isInternalLoggingEnabled } from '../utils/internal-logger.js';

/**
 * Internal logging plugin for Fastify
 * Registers @logtide/fastify with the internal DSN for self-monitoring
 */
const internalLoggingPlugin: FastifyPluginAsync = async (fastify) => {
  if (!isInternalLoggingEnabled()) return;

  /* v8 ignore start -- telemetry-only path, disabled in tests */
  const dsn = getInternalDsn();
  if (!dsn) return;

  try {
    await new Promise<void>((resolve, reject) => {
      logtide(fastify, {
        dsn,
        service: process.env.SERVICE_NAME || 'logtide-backend',
        environment: process.env.NODE_ENV || 'development',
        release: process.env.npm_package_version || '0.6.2',
        batchSize: 50,
        flushInterval: 10000,
        maxBufferSize: 5000,
        maxRetries: 2,
        retryDelayMs: 500,
        circuitBreakerThreshold: 3,
        circuitBreakerResetMs: 30000,
        debug: process.env.NODE_ENV === 'development',
      }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  } catch (error) {
    console.error('[Internal Logging] Failed to register @logtide/fastify plugin:', error);
  }
  /* v8 ignore end */
};

export default fp(internalLoggingPlugin, {
  fastify: '5.x',
  name: 'internal-logging-plugin',
});
