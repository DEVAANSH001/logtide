import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { db } from '../../../database/index.js';
import queryRoutes from '../../../modules/query/routes.js';
import { authenticate } from '../../../modules/auth/middleware.js';
import { createTestContext, createTestLog } from '../../helpers/factories.js';
import { CacheManager } from '../../../utils/cache.js';

async function createTestSession(userId: string) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.insertInto('sessions').values({ user_id: userId, token, expires_at: expiresAt }).execute();
    return { token };
}

async function cleanDb() {
    await db.deleteFrom('system_settings').execute();
    await db.deleteFrom('log_identifiers').execute();
    await db.deleteFrom('logs').execute();
    await db.deleteFrom('alert_history').execute();
    await db.deleteFrom('sigma_rules').execute();
    await db.deleteFrom('alert_rules').execute();
    await db.deleteFrom('api_keys').execute();
    await db.deleteFrom('notifications').execute();
    await db.deleteFrom('oidc_states').execute();
    await db.deleteFrom('user_identities').execute();
    await db.deleteFrom('organization_members').execute();
    await db.deleteFrom('projects').execute();
    await db.deleteFrom('organizations').execute();
    await db.deleteFrom('sessions').execute();
    await db.deleteFrom('users').execute();
}

describe('Query Routes (session auth)', () => {
    let app: FastifyInstance;
    let authToken: string;
    let testUser: any;
    let testProject: any;

    beforeAll(async () => {
        app = Fastify();
        // Add authenticate hook so request.user is populated from session token
        app.addHook('onRequest', authenticate);
        await app.register(queryRoutes);
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await cleanDb();
        await CacheManager.invalidateSettings();

        const ctx = await createTestContext();
        testUser = ctx.user;
        testProject = ctx.project;

        const session = await createTestSession(testUser.id);
        authToken = session.token;
    });

    // =========================================================================
    // GET /api/v1/logs
    // =========================================================================

    describe('GET /api/v1/logs', () => {
        it('should return 400 when projectId is missing', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/api/v1/logs',
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(400);
            expect(JSON.parse(res.payload).error).toContain('Project context missing');
        });

        it('should return logs for authorized user', async () => {
            await createTestLog({ projectId: testProject.id, level: 'info' });

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/logs?projectId=${testProject.id}`,
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(Array.isArray(body.logs)).toBe(true);
        });

        it('should return 403 when user has no access to project', async () => {
            const otherCtx = await createTestContext();

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/logs?projectId=${otherCtx.project.id}`,
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(403);
        });

        it('should return 403 when one of multiple projects is unauthorized', async () => {
            const otherCtx = await createTestContext();

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/logs?projectId=${testProject.id}&projectId=${otherCtx.project.id}`,
                headers: { Authorization: `Bearer ${authToken}` },
            });
            // Second project is not accessible by testUser
            expect(res.statusCode).toBe(403);
        });
    });

    // =========================================================================
    // GET /api/v1/logs/:logId
    // =========================================================================

    describe('GET /api/v1/logs/:logId', () => {
        it('should return 400 when projectId is missing', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/api/v1/logs/00000000-0000-0000-0000-000000000001',
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(400);
            expect(JSON.parse(res.payload).error).toContain('Project context missing');
        });

        it('should return 403 when user has no access to project', async () => {
            const otherCtx = await createTestContext();

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/logs/00000000-0000-0000-0000-000000000001?projectId=${otherCtx.project.id}`,
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(403);
        });

        it('should return 404 when log is not found', async () => {
            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/logs/00000000-0000-0000-0000-000000000001?projectId=${testProject.id}`,
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(404);
        });

        it('should return log when found', async () => {
            const [log] = await db
                .insertInto('logs')
                .values({
                    project_id: testProject.id,
                    service: 'api',
                    level: 'info',
                    message: 'test log entry',
                    time: new Date(),
                })
                .returningAll()
                .execute();

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/logs/${log.id}?projectId=${testProject.id}`,
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(body.log).toBeDefined();
            expect(body.log.id).toBe(log.id);
        });
    });

    // =========================================================================
    // GET /api/v1/logs/services
    // =========================================================================

    describe('GET /api/v1/logs/services', () => {
        it('should return 400 when projectId is missing', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/api/v1/logs/services',
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(400);
        });

        it('should return 403 when user has no access', async () => {
            const otherCtx = await createTestContext();

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/logs/services?projectId=${otherCtx.project.id}`,
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(403);
        });

        it('should return 400 for invalid "from" date', async () => {
            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/logs/services?projectId=${testProject.id}&from=not-a-date`,
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(400);
        });

        it('should return 400 for invalid "to" date', async () => {
            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/logs/services?projectId=${testProject.id}&to=not-a-date`,
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(400);
        });

        it('should return services list', async () => {
            await createTestLog({ projectId: testProject.id, service: 'my-service' });

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/logs/services?projectId=${testProject.id}`,
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(Array.isArray(body.services)).toBe(true);
            expect(body.services).toContain('my-service');
        });
    });

    // =========================================================================
    // GET /api/v1/logs/hostnames
    // =========================================================================

    describe('GET /api/v1/logs/hostnames', () => {
        it('should return 400 when projectId is missing', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/api/v1/logs/hostnames',
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(400);
        });

        it('should return 403 when user has no access', async () => {
            const otherCtx = await createTestContext();

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/logs/hostnames?projectId=${otherCtx.project.id}`,
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(403);
        });

        it('should return 400 for invalid "from" date', async () => {
            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/logs/hostnames?projectId=${testProject.id}&from=bad-date`,
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(400);
        });

        it('should return 400 for invalid "to" date', async () => {
            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/logs/hostnames?projectId=${testProject.id}&to=bad-date`,
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(400);
        });

        it('should return hostnames list', async () => {
            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/logs/hostnames?projectId=${testProject.id}`,
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(Array.isArray(body.hostnames)).toBe(true);
        });
    });

    // =========================================================================
    // GET /api/v1/logs/top-errors
    // =========================================================================

    describe('GET /api/v1/logs/top-errors', () => {
        it('should return 400 when projectId is missing', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/api/v1/logs/top-errors',
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(400);
        });

        it('should return 403 when user has no access', async () => {
            const otherCtx = await createTestContext();

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/logs/top-errors?projectId=${otherCtx.project.id}`,
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(403);
        });

        it('should return errors list', async () => {
            await createTestLog({ projectId: testProject.id, level: 'error', message: 'db connection failed' });

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/logs/top-errors?projectId=${testProject.id}`,
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(Array.isArray(body.errors)).toBe(true);
        });
    });

    // =========================================================================
    // GET /api/v1/logs/top-services
    // =========================================================================

    describe('GET /api/v1/logs/top-services', () => {
        it('should return 400 when projectId is missing', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/api/v1/logs/top-services',
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(400);
        });

        it('should return 403 when user has no access', async () => {
            const otherCtx = await createTestContext();

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/logs/top-services?projectId=${otherCtx.project.id}`,
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(403);
        });

        it('should return services list', async () => {
            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/logs/top-services?projectId=${testProject.id}`,
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(body.services).toBeDefined();
        });
    });

    // =========================================================================
    // GET /api/v1/logs/trace/:traceId
    // =========================================================================

    describe('GET /api/v1/logs/trace/:traceId', () => {
        it('should return 400 when projectId is missing', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/api/v1/logs/trace/some-trace-id',
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(400);
        });

        it('should return 403 when user has no access', async () => {
            const otherCtx = await createTestContext();

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/logs/trace/some-trace?projectId=${otherCtx.project.id}`,
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(403);
        });

        it('should return logs for trace', async () => {
            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/logs/trace/non-existent-trace?projectId=${testProject.id}`,
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(Array.isArray(body.logs)).toBe(true);
        });
    });

    // =========================================================================
    // GET /api/v1/logs/context
    // =========================================================================

    describe('GET /api/v1/logs/context', () => {
        it('should return 400 when projectId is missing', async () => {
            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/logs/context?time=${new Date().toISOString()}`,
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(400);
        });

        it('should return 403 when user has no access', async () => {
            const otherCtx = await createTestContext();

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/logs/context?time=${new Date().toISOString()}&projectId=${otherCtx.project.id}`,
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(403);
        });

        it('should return log context', async () => {
            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/logs/context?time=${new Date().toISOString()}&projectId=${testProject.id}`,
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(200);
        });
    });

    // =========================================================================
    // GET /api/v1/logs/aggregated
    // =========================================================================

    describe('GET /api/v1/logs/aggregated', () => {
        it('should return 400 when projectId is missing', async () => {
            const now = new Date();
            const from = new Date(now.getTime() - 3600000).toISOString();
            const to = now.toISOString();

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/logs/aggregated?from=${from}&to=${to}`,
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(400);
        });

        it('should return 403 when user has no access', async () => {
            const otherCtx = await createTestContext();
            const now = new Date();
            const from = new Date(now.getTime() - 3600000).toISOString();
            const to = now.toISOString();

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/logs/aggregated?projectId=${otherCtx.project.id}&from=${from}&to=${to}`,
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(403);
        });

        it('should return aggregated stats', async () => {
            const now = new Date();
            const from = new Date(now.getTime() - 3600000).toISOString();
            const to = now.toISOString();

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/logs/aggregated?projectId=${testProject.id}&from=${from}&to=${to}`,
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(body.timeseries).toBeDefined();
        });
    });
});
