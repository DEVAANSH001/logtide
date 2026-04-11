import { describe, it, expect, beforeEach } from 'vitest';
import { sessionsService } from '../../../modules/sessions/service.js';
import { db } from '../../../database/index.js';
import { createTestContext } from '../../helpers/factories.js';

describe('SessionsService', () => {
    let testProject: any;

    beforeEach(async () => {
        const ctx = await createTestContext();
        testProject = ctx.project;
    });

    // Helper: insert a log with session_id directly
    async function insertSessionLog(overrides: {
        projectId: string;
        sessionId: string;
        service?: string;
        level?: string;
        message?: string;
        time?: Date;
    }) {
        return db
            .insertInto('logs')
            .values({
                project_id: overrides.projectId,
                service: overrides.service ?? 'web',
                level: (overrides.level ?? 'info') as any,
                message: overrides.message ?? 'Page loaded',
                time: overrides.time ?? new Date(),
                session_id: overrides.sessionId,
            } as any)
            .returningAll()
            .executeTakeFirstOrThrow();
    }

    // =========================================================================
    // listSessions()
    // =========================================================================

    describe('listSessions()', () => {
        it('returns empty result when no logs exist', async () => {
            const result = await sessionsService.listSessions({
                projectId: testProject.id,
                limit: 20,
                offset: 0,
            });

            expect(result.sessions).toEqual([]);
            expect(result.total).toBe(0);
        });

        it('returns sessions aggregated from logs', async () => {
            await insertSessionLog({ projectId: testProject.id, sessionId: 'session-001' });
            await insertSessionLog({ projectId: testProject.id, sessionId: 'session-001', level: 'error' });
            await insertSessionLog({ projectId: testProject.id, sessionId: 'session-002' });

            const result = await sessionsService.listSessions({
                projectId: testProject.id,
                limit: 20,
                offset: 0,
            });

            expect(result.total).toBe(2);
            expect(result.sessions.length).toBe(2);

            const s1 = result.sessions.find((s) => s.sessionId === 'session-001');
            expect(s1).toBeDefined();
            expect(s1!.eventCount).toBe(2);
            expect(s1!.errorCount).toBe(1);
        });

        it('does not include logs without session_id', async () => {
            // Log without session
            await db.insertInto('logs').values({
                project_id: testProject.id,
                service: 'api',
                level: 'info',
                message: 'No session',
                time: new Date(),
            }).execute();

            const result = await sessionsService.listSessions({
                projectId: testProject.id,
                limit: 20,
                offset: 0,
            });

            expect(result.total).toBe(0);
        });

        it('filters by hasErrors=true - only sessions with errors', async () => {
            await insertSessionLog({ projectId: testProject.id, sessionId: 'clean-session', level: 'info' });
            await insertSessionLog({ projectId: testProject.id, sessionId: 'error-session', level: 'error' });

            const result = await sessionsService.listSessions({
                projectId: testProject.id,
                hasErrors: true,
                limit: 20,
                offset: 0,
            });

            expect(result.sessions.length).toBe(1);
            expect(result.sessions[0].sessionId).toBe('error-session');
        });

        it('filters by hasErrors=false - only sessions without errors', async () => {
            await insertSessionLog({ projectId: testProject.id, sessionId: 'clean-session', level: 'info' });
            await insertSessionLog({ projectId: testProject.id, sessionId: 'error-session', level: 'error' });

            const result = await sessionsService.listSessions({
                projectId: testProject.id,
                hasErrors: false,
                limit: 20,
                offset: 0,
            });

            expect(result.sessions.length).toBe(1);
            expect(result.sessions[0].sessionId).toBe('clean-session');
        });

        it('filters by service', async () => {
            await insertSessionLog({ projectId: testProject.id, sessionId: 'web-sess', service: 'web' });
            await insertSessionLog({ projectId: testProject.id, sessionId: 'api-sess', service: 'api' });

            const result = await sessionsService.listSessions({
                projectId: testProject.id,
                service: 'web',
                limit: 20,
                offset: 0,
            });

            expect(result.total).toBe(1);
            expect(result.sessions[0].sessionId).toBe('web-sess');
        });

        it('respects limit and offset for pagination', async () => {
            for (let i = 0; i < 5; i++) {
                await insertSessionLog({ projectId: testProject.id, sessionId: `session-${i}` });
            }

            const page1 = await sessionsService.listSessions({
                projectId: testProject.id,
                limit: 2,
                offset: 0,
            });

            const page2 = await sessionsService.listSessions({
                projectId: testProject.id,
                limit: 2,
                offset: 2,
            });

            expect(page1.total).toBe(5);
            expect(page1.sessions.length).toBe(2);
            expect(page2.sessions.length).toBe(2);
            // No overlap between pages
            const ids1 = page1.sessions.map((s) => s.sessionId);
            const ids2 = page2.sessions.map((s) => s.sessionId);
            expect(ids1.some((id) => ids2.includes(id))).toBe(false);
        });

        it('filters by time range', async () => {
            const past = new Date('2020-01-01T00:00:00Z');
            const recent = new Date();

            await insertSessionLog({ projectId: testProject.id, sessionId: 'old-session', time: past });
            await insertSessionLog({ projectId: testProject.id, sessionId: 'new-session', time: recent });

            const result = await sessionsService.listSessions({
                projectId: testProject.id,
                from: new Date('2023-01-01T00:00:00Z'),
                limit: 20,
                offset: 0,
            });

            expect(result.sessions.every((s) => s.sessionId !== 'old-session')).toBe(true);
        });

        it('does not include sessions from other projects', async () => {
            const ctx2 = await createTestContext();
            await insertSessionLog({ projectId: ctx2.project.id, sessionId: 'other-session' });

            const result = await sessionsService.listSessions({
                projectId: testProject.id,
                limit: 20,
                offset: 0,
            });

            expect(result.sessions.every((s) => s.sessionId !== 'other-session')).toBe(true);
        });
    });

    // =========================================================================
    // getSessionEvents()
    // =========================================================================

    describe('getSessionEvents()', () => {
        it('returns empty array when no events exist for session', async () => {
            const events = await sessionsService.getSessionEvents({
                projectId: testProject.id,
                sessionId: 'nonexistent-session',
            });

            expect(events).toEqual([]);
        });

        it('returns events for the given session in chronological order', async () => {
            const t1 = new Date('2025-01-01T10:00:00Z');
            const t2 = new Date('2025-01-01T10:01:00Z');

            await insertSessionLog({ projectId: testProject.id, sessionId: 'sess-abc', message: 'First', time: t1 });
            await insertSessionLog({ projectId: testProject.id, sessionId: 'sess-abc', message: 'Second', time: t2 });

            const events = await sessionsService.getSessionEvents({
                projectId: testProject.id,
                sessionId: 'sess-abc',
            });

            expect(events.length).toBe(2);
            expect(events[0].message).toBe('First');
            expect(events[1].message).toBe('Second');
        });

        it('does not include events from other sessions', async () => {
            await insertSessionLog({ projectId: testProject.id, sessionId: 'sess-1', message: 'Session 1' });
            await insertSessionLog({ projectId: testProject.id, sessionId: 'sess-2', message: 'Session 2' });

            const events = await sessionsService.getSessionEvents({
                projectId: testProject.id,
                sessionId: 'sess-1',
            });

            expect(events.every((e) => e.message !== 'Session 2')).toBe(true);
        });

        it('maps event fields to the SessionEvent shape', async () => {
            await insertSessionLog({
                projectId: testProject.id,
                sessionId: 'sess-shape',
                service: 'frontend',
                level: 'warn',
                message: 'Slow render',
            });

            const events = await sessionsService.getSessionEvents({
                projectId: testProject.id,
                sessionId: 'sess-shape',
            });

            expect(events.length).toBe(1);
            expect(events[0].service).toBe('frontend');
            expect(events[0].level).toBe('warn');
            expect(events[0].message).toBe('Slow render');
            expect(events[0].id).toBeDefined();
            expect(events[0].time).toBeDefined();
        });
    });
});
