import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { db } from '../../../database/index.js';
import { sessionsRoutes } from '../../../modules/sessions/routes.js';
import { createTestContext } from '../../helpers/factories.js';

async function createTestSession(userId: string) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.insertInto('sessions').values({ user_id: userId, token, expires_at: expiresAt }).execute();
    return { token };
}

async function insertSessionLog(overrides: {
    projectId: string;
    sessionId: string;
    service?: string;
    level?: string;
    message?: string;
}) {
    return db
        .insertInto('logs')
        .values({
            project_id: overrides.projectId,
            service: overrides.service ?? 'web',
            level: (overrides.level ?? 'info') as any,
            message: overrides.message ?? 'event',
            time: new Date(),
            session_id: overrides.sessionId,
        } as any)
        .execute();
}

describe('Sessions Routes', () => {
    let app: FastifyInstance;
    let testUser: any;
    let testOrganization: any;
    let testProject: any;
    let authToken: string;

    beforeAll(async () => {
        app = Fastify();
        await app.register(sessionsRoutes, { prefix: '/api/v1/sessions' });
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        const ctx = await createTestContext();
        testUser = ctx.user;
        testOrganization = ctx.organization;
        testProject = ctx.project;

        const session = await createTestSession(testUser.id);
        authToken = session.token;
    });

    // =========================================================================
    // GET /api/v1/sessions
    // =========================================================================

    describe('GET /api/v1/sessions', () => {
        it('returns 401 without auth token', async () => {
            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/sessions?projectId=${testProject.id}`,
            });
            expect(res.statusCode).toBe(401);
        });

        it('returns 400 when projectId is missing', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/api/v1/sessions',
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(400);
        });

        it('returns 403 when user does not have access to the project', async () => {
            const otherCtx = await createTestContext();
            const session = await createTestSession(testUser.id);

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/sessions?projectId=${otherCtx.project.id}`,
                headers: { Authorization: `Bearer ${session.token}` },
            });
            expect(res.statusCode).toBe(403);
        });

        it('returns 200 with empty sessions when no session logs exist', async () => {
            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/sessions?projectId=${testProject.id}`,
                headers: { Authorization: `Bearer ${authToken}` },
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(body.sessions).toEqual([]);
            expect(body.total).toBe(0);
        });

        it('returns 200 with sessions when logs have session_id', async () => {
            await insertSessionLog({ projectId: testProject.id, sessionId: 'session-001' });
            await insertSessionLog({ projectId: testProject.id, sessionId: 'session-001', level: 'error' });

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/sessions?projectId=${testProject.id}`,
                headers: { Authorization: `Bearer ${authToken}` },
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(body.total).toBe(1);
            expect(body.sessions[0].sessionId).toBe('session-001');
            expect(body.sessions[0].eventCount).toBe(2);
        });

        it('filters sessions by hasErrors=true', async () => {
            await insertSessionLog({ projectId: testProject.id, sessionId: 'clean', level: 'info' });
            await insertSessionLog({ projectId: testProject.id, sessionId: 'broken', level: 'error' });

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/sessions?projectId=${testProject.id}&hasErrors=true`,
                headers: { Authorization: `Bearer ${authToken}` },
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(body.sessions.length).toBe(1);
            expect(body.sessions[0].sessionId).toBe('broken');
        });

        it('respects limit and offset', async () => {
            for (let i = 0; i < 5; i++) {
                await insertSessionLog({ projectId: testProject.id, sessionId: `sess-${i}` });
            }

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/sessions?projectId=${testProject.id}&limit=2&offset=0`,
                headers: { Authorization: `Bearer ${authToken}` },
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(body.total).toBe(5);
            expect(body.sessions.length).toBe(2);
        });
    });

    // =========================================================================
    // GET /api/v1/sessions/:sessionId/events
    // =========================================================================

    describe('GET /api/v1/sessions/:sessionId/events', () => {
        it('returns 401 without auth token', async () => {
            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/sessions/sess-abc/events?projectId=${testProject.id}`,
            });
            expect(res.statusCode).toBe(401);
        });

        it('returns 400 when projectId is missing', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/api/v1/sessions/sess-abc/events',
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(400);
        });

        it('returns 403 when user does not have access to the project', async () => {
            const otherCtx = await createTestContext();
            const session = await createTestSession(testUser.id);

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/sessions/sess-abc/events?projectId=${otherCtx.project.id}`,
                headers: { Authorization: `Bearer ${session.token}` },
            });
            expect(res.statusCode).toBe(403);
        });

        it('returns 200 with empty events when session does not exist', async () => {
            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/sessions/nonexistent/events?projectId=${testProject.id}`,
                headers: { Authorization: `Bearer ${authToken}` },
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(body.events).toEqual([]);
        });

        it('returns 200 with events for an existing session', async () => {
            await insertSessionLog({ projectId: testProject.id, sessionId: 'sess-xyz', message: 'click' });
            await insertSessionLog({ projectId: testProject.id, sessionId: 'sess-xyz', message: 'scroll' });

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/sessions/sess-xyz/events?projectId=${testProject.id}`,
                headers: { Authorization: `Bearer ${authToken}` },
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(body.events.length).toBe(2);
        });

        it('respects the limit parameter', async () => {
            for (let i = 0; i < 10; i++) {
                await insertSessionLog({ projectId: testProject.id, sessionId: 'sess-limit', message: `event ${i}` });
            }

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/sessions/sess-limit/events?projectId=${testProject.id}&limit=3`,
                headers: { Authorization: `Bearer ${authToken}` },
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(body.events.length).toBeLessThanOrEqual(3);
        });
    });
});
