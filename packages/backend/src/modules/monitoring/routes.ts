import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { MONITOR_TYPES } from '@logtide/shared';
import { MonitorService } from './service.js';
import { SiemService } from '../siem/service.js';
import { authenticate } from '../auth/middleware.js';
import { OrganizationsService } from '../organizations/service.js';
import { db } from '../../database/index.js';

const siemService = new SiemService(db);
export const monitorService = new MonitorService(db, siemService);
const organizationsService = new OrganizationsService();

async function checkOrgMembership(userId: string, organizationId: string): Promise<boolean> {
  const orgs = await organizationsService.getUserOrganizations(userId);
  return orgs.some((o) => o.id === organizationId);
}

const createMonitorSchema = z.object({
  organizationId: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string().min(1).max(255),
  type: z.enum(MONITOR_TYPES),
  target: z.string().optional().nullable(),
  intervalSeconds: z.number().int().min(30).max(86400).optional(),
  timeoutSeconds: z.number().int().min(1).max(60).optional(),
  failureThreshold: z.number().int().min(1).max(20).optional(),
  autoResolve: z.boolean().optional(),
  enabled: z.boolean().optional(),
}).refine(
  (d) => {
    if (d.type === 'http') return !!d.target && (d.target.startsWith('http://') || d.target.startsWith('https://'));
    if (d.type === 'tcp') return !!d.target && d.target.includes(':');
    return true;
  },
  { message: 'Invalid target for monitor type' }
);

const updateMonitorSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  target: z.string().nullable().optional(),
  intervalSeconds: z.number().int().min(30).max(86400).optional(),
  timeoutSeconds: z.number().int().min(1).max(60).optional(),
  failureThreshold: z.number().int().min(1).max(20).optional(),
  autoResolve: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

// ============================================================================
// Authenticated management routes (session required)
// ============================================================================

export async function monitoringRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', authenticate);

  fastify.get('/', async (request: any, reply) => {
    const { organizationId, projectId } = request.query as any;
    if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
    if (!(await checkOrgMembership(request.user.id, organizationId))) return reply.status(403).send({ error: 'Forbidden' });

    const monitors = await monitorService.listMonitors(organizationId, projectId);
    return reply.send({ monitors });
  });

  fastify.get('/:id', async (request: any, reply) => {
    const { organizationId } = request.query as any;
    if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
    if (!(await checkOrgMembership(request.user.id, organizationId))) return reply.status(403).send({ error: 'Forbidden' });

    const monitor = await monitorService.getMonitor(request.params.id, organizationId);
    if (!monitor) return reply.status(404).send({ error: 'Not found' });
    return reply.send({ monitor });
  });

  fastify.post('/', async (request: any, reply) => {
    const parse = createMonitorSchema.safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ error: parse.error.errors[0].message });
    const input = parse.data;
    if (!(await checkOrgMembership(request.user.id, input.organizationId))) return reply.status(403).send({ error: 'Forbidden' });

    const monitor = await monitorService.createMonitor(input);
    return reply.status(201).send({ monitor });
  });

  fastify.put('/:id', async (request: any, reply) => {
    const { organizationId } = request.query as any;
    if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
    if (!(await checkOrgMembership(request.user.id, organizationId))) return reply.status(403).send({ error: 'Forbidden' });

    const parse = updateMonitorSchema.safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ error: parse.error.errors[0].message });

    const monitor = await monitorService.updateMonitor(request.params.id, organizationId, parse.data);
    return reply.send({ monitor });
  });

  fastify.delete('/:id', async (request: any, reply) => {
    const { organizationId } = request.query as any;
    if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
    if (!(await checkOrgMembership(request.user.id, organizationId))) return reply.status(403).send({ error: 'Forbidden' });

    await monitorService.deleteMonitor(request.params.id, organizationId);
    return reply.status(204).send();
  });

  fastify.get('/:id/results', async (request: any, reply) => {
    const { organizationId, limit } = request.query as any;
    if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
    if (!(await checkOrgMembership(request.user.id, organizationId))) return reply.status(403).send({ error: 'Forbidden' });

    const results = await monitorService.getRecentResults(
      request.params.id, organizationId, Math.min(Number(limit) || 50, 200)
    );
    return reply.send({ results });
  });

  fastify.get('/:id/uptime', async (request: any, reply) => {
    const { organizationId, days } = request.query as any;
    if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
    if (!(await checkOrgMembership(request.user.id, organizationId))) return reply.status(403).send({ error: 'Forbidden' });

    const history = await monitorService.getUptimeHistory(
      request.params.id, organizationId, Math.min(Number(days) || 90, 365)
    );
    return reply.send({ history });
  });
}

// ============================================================================
// Heartbeat endpoint — accepts API key auth OR session auth
// The global auth plugin already validates API keys and sets request.organizationId.
// No additional authenticate hook needed here.
// ============================================================================

export async function heartbeatRoutes(fastify: FastifyInstance) {
  fastify.post('/:id/heartbeat', {
    config: { rateLimit: { max: 600, timeWindow: '1 minute' } },
  }, async (request: any, reply) => {
    const monitorId = request.params.id;

    // API key path: global auth plugin set organizationId
    if (request.organizationId) {
      await monitorService.recordHeartbeat(monitorId, request.organizationId);
      return reply.status(204).send();
    }

    // Session path: organizationId from query
    if (request.user) {
      const { organizationId } = request.query as any;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
      if (!(await checkOrgMembership(request.user.id, organizationId))) return reply.status(403).send({ error: 'Forbidden' });
      await monitorService.recordHeartbeat(monitorId, organizationId);
      return reply.status(204).send();
    }

    return reply.status(401).send({ error: 'Unauthorized' });
  });
}

// ============================================================================
// Public status page — no auth, scrubbed data
// ============================================================================

export async function publicStatusRoutes(fastify: FastifyInstance) {
  fastify.get('/project/:slug', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request: any, reply) => {
    const status = await monitorService.getPublicStatus(request.params.slug);
    if (!status) return reply.status(404).send({ error: 'Not found' });
    return reply.send(status);
  });
}
