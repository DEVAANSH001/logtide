import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { build } from '../../server.js';
import { createTestApiKey } from '../helpers/index.js';
import { db } from '../../database/index.js';

describe('Log metadata security', () => {
  let app: any;
  let apiKey: string;
  let projectId: string;

  beforeEach(async () => {
    if (!app) {
      app = await build();
      await app.ready();
    }

    const testKey = await createTestApiKey({ name: 'Test Metadata Key' });
    apiKey = testKey.plainKey;
    projectId = testKey.project_id;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('does not store api_key_id in log metadata', async () => {
    await request(app.server)
      .post('/api/v1/ingest')
      .set('x-api-key', apiKey)
      .send({
        logs: [
          {
            time: new Date().toISOString(),
            level: 'info',
            message: 'test log',
            service: 'test',
          },
        ],
      })
      .expect(200);

    const log = await db
      .selectFrom('logs')
      .select('metadata')
      .where('project_id', '=', projectId)
      .orderBy('time', 'desc')
      .executeTakeFirst();

    const metadata = log?.metadata as Record<string, unknown> | null | undefined;
    expect(metadata == null || !('api_key_id' in metadata)).toBe(true);
  });
});
