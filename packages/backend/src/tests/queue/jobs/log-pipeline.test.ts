import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../../../database/index.js';
import { createTestContext, createTestLog } from '../../helpers/index.js';
import { pipelineService } from '../../../modules/log-pipeline/service.js';

// Mock queue connection BEFORE importing anything that uses it
vi.mock('../../../queue/connection.js', () => {
  return {
    createQueue: vi.fn(() => ({
      add: vi.fn().mockResolvedValue({ id: 'job-id' }),
      close: vi.fn(),
    })),
    createWorker: vi.fn(() => ({
      on: vi.fn(),
      close: vi.fn(),
    })),
    getConnection: () => null,
  };
});

// Mock config module
vi.mock('../../../config/index.js', () => ({
  config: {
    SMTP_HOST: 'localhost',
    SMTP_PORT: 1025,
    SMTP_SECURE: false,
    SMTP_USER: 'test@example.com',
    SMTP_PASS: 'password',
    SMTP_FROM: 'noreply@test.com',
    REDIS_URL: 'redis://localhost:6379',
  },
  isSmtpConfigured: vi.fn(() => false),
}));

// Import after mocks
import { processLogPipeline } from '../../../queue/jobs/log-pipeline.js';
import type { Job } from 'bullmq';
import type { LogPipelineJobData } from '../../../queue/jobs/log-pipeline.js';

let ctx: Awaited<ReturnType<typeof createTestContext>>;

beforeEach(async () => {
  vi.clearAllMocks();
  await db.deleteFrom('log_pipelines').execute();
  ctx = await createTestContext();
  pipelineService.invalidateCache(ctx.organization.id);
});

describe('processLogPipeline', () => {
  it('is a no-op when no pipeline is configured for the project', async () => {
    const log = await createTestLog({ projectId: ctx.project.id, message: 'plain text' });
    const timeStr = log.time instanceof Date ? log.time.toISOString() : String(log.time);
    const job = {
      data: {
        logs: [{ id: log.id, time: timeStr, message: log.message, metadata: null }],
        projectId: ctx.project.id,
        organizationId: ctx.organization.id,
      } as LogPipelineJobData,
    } as Job<LogPipelineJobData>;

    await expect(processLogPipeline(job)).resolves.toBeUndefined();

    const updated = await db
      .selectFrom('logs')
      .select('metadata')
      .where('id', '=', log.id)
      .executeTakeFirst();
    expect(updated?.metadata).toBeNull();
  });

  it('updates log metadata when pipeline matches', async () => {
    const nginxLine =
      '10.0.0.1 - - [01/Jan/2024:00:00:00 +0000] "GET /api HTTP/1.1" 200 512 "-" "-"';

    await pipelineService.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      name: 'nginx',
      steps: [{ type: 'parser', parser: 'nginx' }],
    });

    const log = await createTestLog({ projectId: ctx.project.id, message: nginxLine });
    const timeStr = log.time instanceof Date ? log.time.toISOString() : String(log.time);
    const job = {
      data: {
        logs: [{ id: log.id, time: timeStr, message: nginxLine, metadata: null }],
        projectId: ctx.project.id,
        organizationId: ctx.organization.id,
      } as LogPipelineJobData,
    } as Job<LogPipelineJobData>;

    await processLogPipeline(job);

    const updated = await db
      .selectFrom('logs')
      .select('metadata')
      .where('id', '=', log.id)
      .executeTakeFirst();

    expect((updated?.metadata as Record<string, unknown>)?.client_ip).toBe('10.0.0.1');
    expect((updated?.metadata as Record<string, unknown>)?.http_status).toBe(200);
  });

  it('skips logs that produce no extracted fields', async () => {
    await pipelineService.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      name: 'nginx',
      steps: [{ type: 'parser', parser: 'nginx' }],
    });

    const log = await createTestLog({ projectId: ctx.project.id, message: 'not a log line' });
    const timeStr = log.time instanceof Date ? log.time.toISOString() : String(log.time);
    const job = {
      data: {
        logs: [{ id: log.id, time: timeStr, message: 'not a log line', metadata: null }],
        projectId: ctx.project.id,
        organizationId: ctx.organization.id,
      } as LogPipelineJobData,
    } as Job<LogPipelineJobData>;

    await processLogPipeline(job);

    const updated = await db
      .selectFrom('logs')
      .select('metadata')
      .where('id', '=', log.id)
      .executeTakeFirst();
    expect(updated?.metadata).toBeNull();
  });
});
