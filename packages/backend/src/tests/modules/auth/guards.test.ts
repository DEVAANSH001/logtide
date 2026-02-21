import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { requireFullAccess } from '../../../modules/auth/guards.js';

/**
 * Tests for requireFullAccess guard.
 *
 * The guard blocks write-only API keys from accessing read endpoints.
 * Session-based auth and full-access keys are always allowed.
 */
describe('requireFullAccess guard', () => {
    let app: FastifyInstance;

    function buildApp(handler?: (request: any, reply: any) => Promise<any>) {
        app = Fastify();

        // Register a minimal auth decorator plugin (like the real auth plugin does)
        app.register(
            fp(async (fastify) => {
                fastify.decorateRequest('authenticated', false);
                fastify.decorateRequest('projectId', undefined);
                fastify.decorateRequest('organizationId', undefined);
                fastify.decorateRequest('apiKeyType', undefined);
            })
        );

        app.get('/test', handler || (async (request, reply) => {
            if (!await requireFullAccess(request, reply)) return;
            return { success: true };
        }));

        return app;
    }

    afterAll(async () => {
        if (app) await app.close();
    });

    it('should allow session-based auth (user set)', async () => {
        const app = buildApp(async (request: any, reply: any) => {
            request.user = { id: 'user-123', email: 'test@test.com' };
            if (!await requireFullAccess(request, reply)) return;
            return { success: true };
        });
        await app.ready();

        const response = await app.inject({ method: 'GET', url: '/test' });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ success: true });
    });

    it('should allow full-access API keys', async () => {
        const app = buildApp(async (request: any, reply: any) => {
            request.apiKeyType = 'full';
            if (!await requireFullAccess(request, reply)) return;
            return { success: true };
        });
        await app.ready();

        const response = await app.inject({ method: 'GET', url: '/test' });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ success: true });
    });

    it('should block write-only API keys with 403', async () => {
        const app = buildApp(async (request: any, reply: any) => {
            request.apiKeyType = 'write';
            if (!await requireFullAccess(request, reply)) return;
            return { success: true };
        });
        await app.ready();

        const response = await app.inject({ method: 'GET', url: '/test' });
        expect(response.statusCode).toBe(403);
        const body = response.json();
        expect(body.error).toBe('Forbidden');
        expect(body.message).toContain('write-only');
    });

    it('should allow requests with no apiKeyType set (undefined)', async () => {
        const app = buildApp(async (request: any, reply: any) => {
            // apiKeyType is undefined (e.g. no auth or other auth method)
            if (!await requireFullAccess(request, reply)) return;
            return { success: true };
        });
        await app.ready();

        const response = await app.inject({ method: 'GET', url: '/test' });
        expect(response.statusCode).toBe(200);
    });

    it('should prefer user check over apiKeyType', async () => {
        // If both user and apiKeyType are set, user takes precedence (session auth wins)
        const app = buildApp(async (request: any, reply: any) => {
            request.user = { id: 'user-123' };
            request.apiKeyType = 'write'; // This should be ignored because user is set
            if (!await requireFullAccess(request, reply)) return;
            return { success: true };
        });
        await app.ready();

        const response = await app.inject({ method: 'GET', url: '/test' });
        expect(response.statusCode).toBe(200);
    });
});
