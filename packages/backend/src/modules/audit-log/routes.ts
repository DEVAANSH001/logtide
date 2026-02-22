import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { auditLogService } from './service.js';
import { authenticate } from '../auth/middleware.js';
import { OrganizationsService } from '../organizations/service.js';
import type { AuditCategory } from '../../database/types.js';

const organizationsService = new OrganizationsService();

const AUDIT_CATEGORIES = ['log_access', 'config_change', 'user_management', 'data_modification'] as const;

const querySchema = z.object({
  organizationId: z.string().uuid(),
  category: z.enum(AUDIT_CATEGORIES).optional(),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  userId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(200).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
});

const exportSchema = z.object({
  organizationId: z.string().uuid(),
  category: z.enum(AUDIT_CATEGORIES).optional(),
  action: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export async function auditLogRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', authenticate);

  // GET /api/v1/audit-log
  fastify.get(
    '/',
    {
      config: {
        rateLimit: { max: 60, timeWindow: '1 minute' },
      },
    },
    async (request: any, reply) => {
      try {
        const params = querySchema.parse(request.query);

        const isAdmin = await organizationsService.isOwnerOrAdmin(
          params.organizationId,
          request.user.id
        );
        if (!isAdmin) {
          return reply.status(403).send({
            error: 'Only organization owners and admins can view audit logs',
          });
        }

        const result = await auditLogService.query({
          organizationId: params.organizationId,
          category: params.category as AuditCategory | undefined,
          action: params.action,
          resourceType: params.resourceType,
          userId: params.userId,
          from: params.from ? new Date(params.from) : undefined,
          to: params.to ? new Date(params.to) : undefined,
          limit: params.limit,
          offset: params.offset,
        });

        return reply.send(result);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            error: 'Validation error',
            details: error.errors,
          });
        }
        console.error('[AuditLog] Error querying audit logs:', error);
        return reply.status(500).send({
          error: 'Failed to retrieve audit logs',
        });
      }
    }
  );

  // GET /api/v1/audit-log/actions - Get distinct action names for filter dropdown
  fastify.get(
    '/actions',
    {
      config: {
        rateLimit: { max: 30, timeWindow: '1 minute' },
      },
    },
    async (request: any, reply) => {
      try {
        const { organizationId } = z
          .object({ organizationId: z.string().uuid() })
          .parse(request.query);

        const isAdmin = await organizationsService.isOwnerOrAdmin(
          organizationId,
          request.user.id
        );
        if (!isAdmin) {
          return reply.status(403).send({
            error: 'Only organization owners and admins can view audit logs',
          });
        }

        const actions = await auditLogService.getDistinctActions(organizationId);
        return reply.send({ actions });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            error: 'Validation error',
            details: error.errors,
          });
        }
        throw error;
      }
    }
  );

  // GET /api/v1/audit-log/export - Export audit log as CSV
  fastify.get(
    '/export',
    {
      config: {
        rateLimit: { max: 5, timeWindow: '1 minute' },
      },
    },
    async (request: any, reply) => {
      try {
        const params = exportSchema.parse(request.query);

        const isAdmin = await organizationsService.isOwnerOrAdmin(
          params.organizationId,
          request.user.id
        );
        if (!isAdmin) {
          return reply.status(403).send({
            error: 'Only organization owners and admins can export audit logs',
          });
        }

        const result = await auditLogService.query({
          organizationId: params.organizationId,
          category: params.category as AuditCategory | undefined,
          action: params.action,
          from: params.from ? new Date(params.from) : undefined,
          to: params.to ? new Date(params.to) : undefined,
          limit: 10000,
          offset: 0,
        });

        const csvHeader = 'Time,User,Category,Action,Resource Type,Resource ID,IP Address,User Agent,Details';
        const csvRows = result.entries.map((e: any) => {
          const escape = (v: string | null) => {
            if (v == null) return '';
            const s = String(v).replace(/"/g, '""');
            return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
          };
          const meta = e.metadata ? JSON.stringify(e.metadata) : '';
          return [
            escape(e.time?.toISOString?.() ?? String(e.time)),
            escape(e.user_email),
            escape(e.category),
            escape(e.action),
            escape(e.resource_type),
            escape(e.resource_id),
            escape(e.ip_address),
            escape(e.user_agent),
            escape(meta),
          ].join(',');
        });

        const csv = [csvHeader, ...csvRows].join('\n');

        auditLogService.log({
          organizationId: params.organizationId,
          userId: request.user.id,
          userEmail: request.user.email,
          action: 'export_audit_log',
          category: 'log_access',
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
          metadata: {
            format: 'csv',
            rowCount: result.entries.length,
            filters: { category: params.category, action: params.action, from: params.from, to: params.to },
          },
        });

        return reply
          .header('Content-Type', 'text/csv')
          .header('Content-Disposition', `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`)
          .send(csv);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            error: 'Validation error',
            details: error.errors,
          });
        }
        console.error('[AuditLog] Error exporting audit logs:', error);
        return reply.status(500).send({
          error: 'Failed to export audit logs',
        });
      }
    }
  );
}
