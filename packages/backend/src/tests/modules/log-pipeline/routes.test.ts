import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { db } from '../../../database/index.js';
import { pipelineRoutes } from '../../../modules/log-pipeline/routes.js';
import { createTestContext, createTestSession } from '../../helpers/index.js';

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

let app: FastifyInstance;
let ctx: Awaited<ReturnType<typeof createTestContext>>;
let authToken: string;

beforeAll(async () => {
  app = Fastify();
  await app.register(pipelineRoutes, { prefix: '/api/v1/pipelines' });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await db.deleteFrom('log_pipelines').execute();
  await db.deleteFrom('logs').execute();
  await db.deleteFrom('api_keys').execute();
  await db.deleteFrom('organization_members').execute();
  await db.deleteFrom('projects').execute();
  await db.deleteFrom('organizations').execute();
  await db.deleteFrom('sessions').execute();
  await db.deleteFrom('users').execute();

  ctx = await createTestContext();
  const session = await createTestSession(ctx.user.id);
  authToken = session.token;
});

describe('POST /api/v1/pipelines', () => {
  it('creates a pipeline', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/pipelines',
      headers: authHeaders(authToken),
      payload: {
        organizationId: ctx.organization.id,
        projectId: ctx.project.id,
        name: 'My Pipeline',
        steps: [{ type: 'parser', parser: 'nginx' }],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.pipeline.name).toBe('My Pipeline');
    expect(body.pipeline.steps).toHaveLength(1);
  });

  it('returns 400 for invalid step type', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/pipelines',
      headers: authHeaders(authToken),
      payload: {
        organizationId: ctx.organization.id,
        name: 'Bad Pipeline',
        steps: [{ type: 'unknown_step' }],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/pipelines',
      payload: {
        organizationId: ctx.organization.id,
        name: 'Unauthenticated',
        steps: [],
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 for non-member', async () => {
    // Create a separate context (different org)
    const other = await createTestContext();
    const otherSession = await createTestSession(other.user.id);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/pipelines',
      headers: authHeaders(otherSession.token),
      payload: {
        organizationId: ctx.organization.id,
        name: 'Hack Attempt',
        steps: [],
      },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /api/v1/pipelines/preview', () => {
  it('returns parsed fields for nginx log line', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/pipelines/preview',
      headers: authHeaders(authToken),
      payload: {
        organizationId: ctx.organization.id,
        steps: [{ type: 'parser', parser: 'nginx' }],
        message: '10.0.0.1 - - [01/Jan/2024:00:00:00 +0000] "GET /api HTTP/1.1" 200 512 "-" "-"',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.merged.client_ip).toBe('10.0.0.1');
    expect(body.merged.http_status).toBe(200);
  });

  it('returns 400 for invalid step in preview', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/pipelines/preview',
      headers: authHeaders(authToken),
      payload: {
        organizationId: ctx.organization.id,
        steps: [{ type: 'bad_type' }],
        message: 'some log',
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/v1/pipelines/import-yaml', () => {
  it('imports a pipeline from YAML', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/pipelines/import-yaml',
      headers: authHeaders(authToken),
      payload: {
        organizationId: ctx.organization.id,
        projectId: ctx.project.id,
        yaml: 'name: yaml-pipeline\nsteps:\n  - type: parser\n    parser: nginx\n',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.pipeline.name).toBe('yaml-pipeline');
    expect(body.pipeline.steps).toHaveLength(1);
  });

  it('returns 400 for invalid YAML', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/pipelines/import-yaml',
      headers: authHeaders(authToken),
      payload: {
        organizationId: ctx.organization.id,
        yaml: ':::not valid yaml:::',
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/v1/pipelines', () => {
  it('lists pipelines for org', async () => {
    // Create a pipeline first
    await app.inject({
      method: 'POST',
      url: '/api/v1/pipelines',
      headers: authHeaders(authToken),
      payload: {
        organizationId: ctx.organization.id,
        name: 'Listed Pipeline',
        steps: [],
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/pipelines?organizationId=${ctx.organization.id}`,
      headers: authHeaders(authToken),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.pipelines.length).toBeGreaterThanOrEqual(1);
    expect(body.pipelines[0].name).toBe('Listed Pipeline');
  });

  it('returns 400 if organizationId is missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/pipelines',
      headers: authHeaders(authToken),
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/v1/pipelines/:id', () => {
  it('returns a pipeline by id', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/pipelines',
      headers: authHeaders(authToken),
      payload: {
        organizationId: ctx.organization.id,
        name: 'Fetch By ID',
        steps: [],
      },
    });
    const created = JSON.parse(createRes.payload).pipeline;

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/pipelines/${created.id}?organizationId=${ctx.organization.id}`,
      headers: authHeaders(authToken),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.pipeline.id).toBe(created.id);
  });

  it('returns 404 for unknown id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/pipelines/00000000-0000-0000-0000-000000000000?organizationId=${ctx.organization.id}`,
      headers: authHeaders(authToken),
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('PUT /api/v1/pipelines/:id - validation', () => {
  it('returns 400 for invalid step type in update', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/pipelines',
      headers: authHeaders(authToken),
      payload: {
        organizationId: ctx.organization.id,
        name: 'To validate',
        steps: [],
      },
    });
    const created = JSON.parse(createRes.payload).pipeline;

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/pipelines/${created.id}?organizationId=${ctx.organization.id}`,
      headers: authHeaders(authToken),
      payload: { steps: [{ type: 'invalid_type_xyz' }] },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('PUT /api/v1/pipelines/:id', () => {
  it('updates a pipeline', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/pipelines',
      headers: authHeaders(authToken),
      payload: {
        organizationId: ctx.organization.id,
        name: 'Original Name',
        steps: [],
      },
    });
    const created = JSON.parse(createRes.payload).pipeline;

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/pipelines/${created.id}?organizationId=${ctx.organization.id}`,
      headers: authHeaders(authToken),
      payload: { name: 'Updated Name' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.pipeline.name).toBe('Updated Name');
  });
});

describe('DELETE /api/v1/pipelines/:id', () => {
  it('deletes a pipeline', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/pipelines',
      headers: authHeaders(authToken),
      payload: {
        organizationId: ctx.organization.id,
        name: 'To Delete',
        steps: [],
      },
    });
    const created = JSON.parse(createRes.payload).pipeline;

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/pipelines/${created.id}?organizationId=${ctx.organization.id}`,
      headers: authHeaders(authToken),
    });
    expect(deleteRes.statusCode).toBe(204);

    // Verify it's gone
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/pipelines/${created.id}?organizationId=${ctx.organization.id}`,
      headers: authHeaders(authToken),
    });
    expect(getRes.statusCode).toBe(404);
  });
});
