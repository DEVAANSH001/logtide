import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth/middleware.js';
import { sessionsService } from './service.js';
import { db } from '../../database/index.js';
import { auditLogService } from '../audit-log/service.js';

async function verifyProjectAccess(projectId: string, userId: string): Promise<boolean> {
  const result = await db
    .selectFrom('projects')
    .innerJoin('organization_members', 'projects.organization_id', 'organization_members.organization_id')
    .select(['projects.id'])
    .where('projects.id', '=', projectId)
    .where('organization_members.user_id', '=', userId)
    .executeTakeFirst();
  return !!result;
}

export async function sessionsRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', authenticate);

  // GET /api/v1/sessions - List sessions for a project
  fastify.get('/', {
    schema: {
      querystring: {
        type: 'object',
        required: ['projectId'],
        properties: {
          projectId: { type: 'string' },
          from: { type: 'string', format: 'date-time' },
          to: { type: 'string', format: 'date-time' },
          hasErrors: { type: 'string', enum: ['true', 'false'] },
          service: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'integer', minimum: 0, default: 0 },
        },
      },
    },
    handler: async (request: any, reply) => {
      const { projectId, from, to, hasErrors, service, limit = 20, offset = 0 } = request.query;

      if (!await verifyProjectAccess(projectId, request.user.id)) {
        return reply.code(403).send({ error: 'Access denied' });
      }

      const result = await sessionsService.listSessions({
        projectId,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        hasErrors: hasErrors === 'true' ? true : hasErrors === 'false' ? false : undefined,
        service,
        limit: Number(limit),
        offset: Number(offset),
      });

      if (request.user?.id) {
        auditLogService.log({
          organizationId: null,
          userId: request.user.id,
          userEmail: request.user.email,
          action: 'list_sessions',
          category: 'log_access',
          resourceType: 'project',
          resourceId: projectId,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
          metadata: { from, to, hasErrors, service },
        });
      }

      return result;
    },
  });

  // GET /api/v1/sessions/:sessionId/events - Get all events for a session
  fastify.get('/:sessionId/events', {
    schema: {
      params: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string' },
        },
      },
      querystring: {
        type: 'object',
        required: ['projectId'],
        properties: {
          projectId: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 1000, default: 500 },
        },
      },
    },
    handler: async (request: any, reply) => {
      const { sessionId } = request.params;
      const { projectId, limit = 500 } = request.query;

      if (!await verifyProjectAccess(projectId, request.user.id)) {
        return reply.code(403).send({ error: 'Access denied' });
      }

      const events = await sessionsService.getSessionEvents({
        projectId,
        sessionId,
        limit: Number(limit),
      });

      if (request.user?.id) {
        auditLogService.log({
          organizationId: null,
          userId: request.user.id,
          userEmail: request.user.email,
          action: 'view_session_events',
          category: 'log_access',
          resourceType: 'session',
          resourceId: sessionId,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
          metadata: { projectId, limit },
        });
      }

      return { events };
    },
  });
}
