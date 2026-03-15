import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { build } from '../../server.js';
import { createTestContext } from '../helpers/factories.js';
import type { FastifyInstance } from 'fastify';

describe('NDJSON line length guard', () => {
  let app: FastifyInstance;
  let apiKey: string;

  beforeEach(async () => {
    if (!app) {
      app = await build();
      await app.ready();
    }

    const context = await createTestContext();
    apiKey = context.apiKey.plainKey;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('rejects a single line exceeding 1MB', async () => {
    const bigMessage = 'x'.repeat(1_100_000);
    const ndjsonBody = JSON.stringify({
      level: 'info',
      message: bigMessage,
      service: 'test',
      timestamp: new Date().toISOString(),
    });

    const response = await request(app.server)
      .post('/api/v1/ingest/single')
      .set('Content-Type', 'application/x-ndjson')
      .set('x-api-key', apiKey)
      .send(ndjsonBody);

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toMatch(/line.*size|too large/i);
  });

  it('accepts normal-sized NDJSON lines', async () => {
    const line = JSON.stringify({
      level: 'info',
      message: 'normal log',
      service: 'test',
      timestamp: new Date().toISOString(),
    });

    const response = await request(app.server)
      .post('/api/v1/ingest/single')
      .set('Content-Type', 'application/x-ndjson')
      .set('x-api-key', apiKey)
      .send(line);

    expect(response.statusCode).toBe(200);
  });
});
