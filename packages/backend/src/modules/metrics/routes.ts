import type { FastifyPluginAsync } from 'fastify';
import { metricsService } from './service.js';
import { requireFullAccess } from '../auth/guards.js';
import { verifyProjectAccess } from '../auth/verify-project-access.js';
import type { AggregationInterval, MetricAggregationFn } from '@logtide/reservoir';

/**
 * Resolve the effective projectId for the request.
 * API key auth: always use request.projectId (scoped to one project).
 * Session auth: use queryProjectId if provided, with access verification.
 */
function resolveProjectId(request: any, queryProjectId?: string): string | undefined {
  if (request.projectId) {
    // API key auth: always scoped to the key's project
    return request.projectId;
  }
  return queryProjectId;
}

function parseAttributes(query: Record<string, unknown>): Record<string, string> | undefined {
  const attrs: Record<string, string> = {};
  let found = false;

  for (const key of Object.keys(query)) {
    const match = key.match(/^attributes\[(.+)]$/);
    if (match && typeof query[key] === 'string') {
      attrs[match[1]] = query[key] as string;
      found = true;
    }
  }

  return found ? attrs : undefined;
}

const metricsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/metrics/names
  fastify.get('/names', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          projectId: { type: 'string' },
          from: { type: 'string', format: 'date-time' },
          to: { type: 'string', format: 'date-time' },
        },
      },
    },
    handler: async (request: any, reply) => {
      if (!await requireFullAccess(request, reply)) return;

      const { projectId: queryProjectId, from, to } = request.query as {
        projectId?: string;
        from?: string;
        to?: string;
      };

      const projectId = resolveProjectId(request, queryProjectId);

      if (!projectId) {
        return reply.code(400).send({
          error: 'Project context missing - provide projectId query parameter',
        });
      }

      if (request.user?.id) {
        const hasAccess = await verifyProjectAccess(projectId, request.user.id);
        if (!hasAccess) {
          return reply.code(403).send({
            error: 'Access denied - you do not have access to this project',
          });
        }
      }

      return metricsService.listMetricNames(
        projectId,
        from ? new Date(from) : undefined,
        to ? new Date(to) : undefined,
      );
    },
  });

  // GET /api/v1/metrics/labels/keys
  fastify.get('/labels/keys', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          projectId: { type: 'string' },
          metricName: { type: 'string' },
          from: { type: 'string', format: 'date-time' },
          to: { type: 'string', format: 'date-time' },
        },
      },
    },
    handler: async (request: any, reply) => {
      if (!await requireFullAccess(request, reply)) return;

      const { projectId: queryProjectId, metricName, from, to } = request.query as {
        projectId?: string;
        metricName?: string;
        from?: string;
        to?: string;
      };

      const projectId = resolveProjectId(request, queryProjectId);

      if (!projectId) {
        return reply.code(400).send({
          error: 'Project context missing - provide projectId query parameter',
        });
      }

      if (!metricName) {
        return reply.code(400).send({
          error: 'metricName query parameter is required',
        });
      }

      if (request.user?.id) {
        const hasAccess = await verifyProjectAccess(projectId, request.user.id);
        if (!hasAccess) {
          return reply.code(403).send({
            error: 'Access denied - you do not have access to this project',
          });
        }
      }

      return metricsService.getLabelKeys(
        projectId,
        metricName,
        from ? new Date(from) : undefined,
        to ? new Date(to) : undefined,
      );
    },
  });

  // GET /api/v1/metrics/labels/values
  fastify.get('/labels/values', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          projectId: { type: 'string' },
          metricName: { type: 'string' },
          labelKey: { type: 'string' },
          from: { type: 'string', format: 'date-time' },
          to: { type: 'string', format: 'date-time' },
        },
      },
    },
    handler: async (request: any, reply) => {
      if (!await requireFullAccess(request, reply)) return;

      const { projectId: queryProjectId, metricName, labelKey, from, to } = request.query as {
        projectId?: string;
        metricName?: string;
        labelKey?: string;
        from?: string;
        to?: string;
      };

      const projectId = resolveProjectId(request, queryProjectId);

      if (!projectId) {
        return reply.code(400).send({
          error: 'Project context missing - provide projectId query parameter',
        });
      }

      if (!metricName) {
        return reply.code(400).send({
          error: 'metricName query parameter is required',
        });
      }

      if (!labelKey) {
        return reply.code(400).send({
          error: 'labelKey query parameter is required',
        });
      }

      if (request.user?.id) {
        const hasAccess = await verifyProjectAccess(projectId, request.user.id);
        if (!hasAccess) {
          return reply.code(403).send({
            error: 'Access denied - you do not have access to this project',
          });
        }
      }

      return metricsService.getLabelValues(
        projectId,
        metricName,
        labelKey,
        from ? new Date(from) : undefined,
        to ? new Date(to) : undefined,
      );
    },
  });

  // GET /api/v1/metrics/data
  fastify.get('/data', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          projectId: { type: 'string' },
          metricName: { type: 'string' },
          from: { type: 'string', format: 'date-time' },
          to: { type: 'string', format: 'date-time' },
          limit: { type: 'number', minimum: 1, maximum: 10000, default: 1000 },
          offset: { type: 'number', minimum: 0, default: 0 },
          includeExemplars: { type: 'boolean', default: false },
        },
      },
    },
    handler: async (request: any, reply) => {
      if (!await requireFullAccess(request, reply)) return;

      const {
        projectId: queryProjectId,
        metricName,
        from,
        to,
        limit,
        offset,
        includeExemplars,
      } = request.query as {
        projectId?: string;
        metricName?: string;
        from?: string;
        to?: string;
        limit?: number;
        offset?: number;
        includeExemplars?: boolean;
      };

      const projectId = resolveProjectId(request, queryProjectId);

      if (!projectId) {
        return reply.code(400).send({
          error: 'Project context missing - provide projectId query parameter',
        });
      }

      if (!from || !to) {
        return reply.code(400).send({
          error: 'from and to query parameters are required',
        });
      }

      if (request.user?.id) {
        const hasAccess = await verifyProjectAccess(projectId, request.user.id);
        if (!hasAccess) {
          return reply.code(403).send({
            error: 'Access denied - you do not have access to this project',
          });
        }
      }

      const attributes = parseAttributes(request.query);

      return metricsService.queryMetrics({
        projectId,
        metricName,
        from: new Date(from),
        to: new Date(to),
        attributes,
        limit: limit || 1000,
        offset: offset || 0,
        includeExemplars: includeExemplars || false,
      });
    },
  });

  // GET /api/v1/metrics/aggregate
  fastify.get('/aggregate', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          projectId: { type: 'string' },
          metricName: { type: 'string' },
          from: { type: 'string', format: 'date-time' },
          to: { type: 'string', format: 'date-time' },
          interval: { type: 'string', enum: ['1m', '5m', '15m', '1h', '6h', '1d', '1w'], default: '1h' },
          aggregation: { type: 'string', enum: ['avg', 'sum', 'min', 'max', 'count', 'last'], default: 'avg' },
          groupBy: {
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
          },
        },
      },
    },
    handler: async (request: any, reply) => {
      if (!await requireFullAccess(request, reply)) return;

      const {
        projectId: queryProjectId,
        metricName,
        from,
        to,
        interval,
        aggregation,
        groupBy,
      } = request.query as {
        projectId?: string;
        metricName?: string;
        from?: string;
        to?: string;
        interval?: string;
        aggregation?: string;
        groupBy?: string | string[];
      };

      const projectId = resolveProjectId(request, queryProjectId);

      if (!projectId) {
        return reply.code(400).send({
          error: 'Project context missing - provide projectId query parameter',
        });
      }

      if (!metricName) {
        return reply.code(400).send({
          error: 'metricName query parameter is required',
        });
      }

      if (!from || !to) {
        return reply.code(400).send({
          error: 'from and to query parameters are required',
        });
      }

      if (request.user?.id) {
        const hasAccess = await verifyProjectAccess(projectId, request.user.id);
        if (!hasAccess) {
          return reply.code(403).send({
            error: 'Access denied - you do not have access to this project',
          });
        }
      }

      const attributes = parseAttributes(request.query);
      const groupByArr = groupBy
        ? Array.isArray(groupBy) ? groupBy : [groupBy]
        : undefined;

      return metricsService.aggregateMetrics({
        projectId,
        metricName,
        from: new Date(from),
        to: new Date(to),
        interval: (interval || '1h') as AggregationInterval,
        aggregation: (aggregation || 'avg') as MetricAggregationFn,
        groupBy: groupByArr,
        attributes,
      });
    },
  });
};

export default metricsRoutes;
