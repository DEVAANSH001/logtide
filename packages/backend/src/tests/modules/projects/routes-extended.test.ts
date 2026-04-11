/**
 * Extended route tests for project endpoints added after the initial test file:
 *   GET /api/v1/projects/data-availability
 *   GET /api/v1/projects/:id/capabilities
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { db } from '../../../database/index.js';
import { projectsRoutes } from '../../../modules/projects/routes.js';
import { createTestContext, createTestUser } from '../../helpers/factories.js';

async function createTestSession(userId: string) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.insertInto('sessions').values({ user_id: userId, token, expires_at: expiresAt }).execute();
    return { token };
}

describe('Projects Routes - Extended', () => {
    let app: FastifyInstance;
    let authToken: string;
    let testUser: any;
    let testOrganization: any;
    let testProject: any;

    beforeAll(async () => {
        app = Fastify();
        await app.register(projectsRoutes, { prefix: '/api/v1/projects' });
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
    // GET /api/v1/projects/data-availability
    // =========================================================================

    describe('GET /api/v1/projects/data-availability', () => {
        it('returns 401 without auth token', async () => {
            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/projects/data-availability?organizationId=${testOrganization.id}`,
            });
            expect(res.statusCode).toBe(401);
        });

        it('returns 400 when organizationId is missing', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/api/v1/projects/data-availability',
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(400);
        });

        it('returns 403 for non-member organization', async () => {
            const otherCtx = await createTestContext();

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/projects/data-availability?organizationId=${otherCtx.organization.id}`,
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(403);
        });

        it('returns 200 with availability data for member org', async () => {
            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/projects/data-availability?organizationId=${testOrganization.id}`,
                headers: { Authorization: `Bearer ${authToken}` },
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            // Response shape: { logs: string[], traces: string[], metrics: string[] }
            expect(body.logs).toBeDefined();
            expect(body.traces).toBeDefined();
            expect(body.metrics).toBeDefined();
            expect(Array.isArray(body.logs)).toBe(true);
        });

        it('shows project in logs array after logs are ingested', async () => {
            // Insert a log for the test project
            await db.insertInto('logs').values({
                project_id: testProject.id,
                service: 'api',
                level: 'info',
                message: 'test',
                time: new Date(),
            }).execute();

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/projects/data-availability?organizationId=${testOrganization.id}`,
                headers: { Authorization: `Bearer ${authToken}` },
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(body.logs).toContain(testProject.id);
        });

        it('does not show project in logs array when no logs exist', async () => {
            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/projects/data-availability?organizationId=${testOrganization.id}`,
                headers: { Authorization: `Bearer ${authToken}` },
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(body.logs).not.toContain(testProject.id);
        });
    });

    // =========================================================================
    // GET /api/v1/projects/:id/capabilities
    // =========================================================================

    describe('GET /api/v1/projects/:id/capabilities', () => {
        it('returns 401 without auth token', async () => {
            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/projects/${testProject.id}/capabilities`,
            });
            expect(res.statusCode).toBe(401);
        });

        it('returns 404 for non-existent project', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/api/v1/projects/00000000-0000-0000-0000-000000000000/capabilities',
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(404);
        });

        it('returns 404 when user cannot access the project', async () => {
            const otherCtx = await createTestContext();

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/projects/${otherCtx.project.id}/capabilities`,
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(404);
        });

        it('returns 400 for invalid project ID format', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/api/v1/projects/not-a-uuid/capabilities',
                headers: { Authorization: `Bearer ${authToken}` },
            });
            expect(res.statusCode).toBe(400);
        });

        it('returns 200 with capabilities for accessible project', async () => {
            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/projects/${testProject.id}/capabilities`,
                headers: { Authorization: `Bearer ${authToken}` },
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(typeof body.hasWebVitals).toBe('boolean');
            expect(typeof body.hasSessions).toBe('boolean');
        });

        it('returns hasWebVitals=false and hasSessions=false for empty project', async () => {
            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/projects/${testProject.id}/capabilities`,
                headers: { Authorization: `Bearer ${authToken}` },
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(body.hasWebVitals).toBe(false);
            expect(body.hasSessions).toBe(false);
        });

        it('returns hasSessions=true when session logs exist', async () => {
            // Insert a log with session_id in the last 24h
            await db.insertInto('logs').values({
                project_id: testProject.id,
                service: 'web',
                level: 'info',
                message: 'session event',
                time: new Date(),
                session_id: 'test-session-xyz',
            } as any).execute();

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/projects/${testProject.id}/capabilities`,
                headers: { Authorization: `Bearer ${authToken}` },
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(body.hasSessions).toBe(true);
        });
    });
});
