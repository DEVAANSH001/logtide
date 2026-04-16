import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { build } from '../../server.js';
import { createTestContext, createTestLog } from '../helpers/index.js';
import type { FastifyInstance } from 'fastify';

describe('GET /api/v1/logs with metadata_filters', () => {
  let app: FastifyInstance;
  let apiKey: string;
  let projectId: string;

  beforeEach(async () => {
    const context = await createTestContext();
    apiKey = context.apiKey.plainKey;
    projectId = context.project.id;

    app = await build();
    await app.ready();

    // Insert three logs with different environment metadata
    await createTestLog({
      projectId,
      service: 'api',
      level: 'error',
      message: 'prod boom',
      metadata: { environment: 'production' },
    });
    await createTestLog({
      projectId,
      service: 'api',
      level: 'error',
      message: 'dev boom',
      metadata: { environment: 'development' },
    });
    await createTestLog({
      projectId,
      service: 'api',
      level: 'error',
      message: 'no env boom',
      metadata: {},
    });
  });

  it('filters by metadata equals', async () => {
    const filters = [{ key: 'environment', op: 'equals', value: 'production' }];
    const res = await request(app.server)
      .get('/api/v1/logs')
      .set('x-api-key', apiKey)
      .query({ projectId, metadata_filters: JSON.stringify(filters) });

    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(1);
    expect(res.body.logs[0].message).toBe('prod boom');
  });

  it('not_equals with include_missing=true keeps logs without the key', async () => {
    const filters = [{ key: 'environment', op: 'not_equals', value: 'development', include_missing: true }];
    const res = await request(app.server)
      .get('/api/v1/logs')
      .set('x-api-key', apiKey)
      .query({ projectId, metadata_filters: JSON.stringify(filters) });

    expect(res.status).toBe(200);
    const msgs = res.body.logs.map((l: { message: string }) => l.message).sort();
    expect(msgs).toContain('no env boom');
    expect(msgs).toContain('prod boom');
    expect(msgs).not.toContain('dev boom');
  });

  it('in operator matches multiple values', async () => {
    const filters = [{ key: 'environment', op: 'in', values: ['production', 'development'] }];
    const res = await request(app.server)
      .get('/api/v1/logs')
      .set('x-api-key', apiKey)
      .query({ projectId, metadata_filters: JSON.stringify(filters) });

    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(2);
  });

  it('exists operator returns only logs that have the key', async () => {
    const filters = [{ key: 'environment', op: 'exists' }];
    const res = await request(app.server)
      .get('/api/v1/logs')
      .set('x-api-key', apiKey)
      .query({ projectId, metadata_filters: JSON.stringify(filters) });

    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(2);
    const msgs = res.body.logs.map((l: { message: string }) => l.message).sort();
    expect(msgs).toContain('prod boom');
    expect(msgs).toContain('dev boom');
  });

  it('rejects malformed metadata_filters JSON', async () => {
    const res = await request(app.server)
      .get('/api/v1/logs')
      .set('x-api-key', apiKey)
      .query({ projectId, metadata_filters: 'not-json' });

    expect(res.status).toBe(400);
  });
});
