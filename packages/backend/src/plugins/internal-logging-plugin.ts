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
      // Use 'as any' to bypass strict property checking as the types seem to be out of sync with the implementation.
      // Configuration is already handled by hub.init() in initializeInternalLogging().
      logtide(fastify, {
        service: process.env.SERVICE_NAME || 'logtide-backend',
        environment: process.env.NODE_ENV || 'development',
      } as any, (err) => {
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
