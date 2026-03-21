import { describe, it, expect } from 'vitest';
import { PipelineExecutor } from '../../../modules/log-pipeline/pipeline-executor.js';
import type { LogForPipeline, PipelineStep } from '../../../modules/log-pipeline/types.js';

const sampleLog: LogForPipeline = {
  id: 'test-id',
  time: new Date(),
  message: '192.168.1.1 - - [01/Jan/2024:00:00:00 +0000] "GET /api HTTP/1.1" 200 512 "-" "curl/7.68.0"',
  metadata: null,
};

describe('PipelineExecutor', () => {
  it('runs a parser step and extracts fields', async () => {
    const steps: PipelineStep[] = [{ type: 'parser', parser: 'nginx' }];
    const result = await PipelineExecutor.execute(sampleLog, steps);
    expect(result.merged.client_ip).toBe('192.168.1.1');
    expect(result.merged.http_status).toBe(200);
    expect(result.steps[0].error).toBeUndefined();
  });

  it('runs a grok step', async () => {
    const log: LogForPipeline = { ...sampleLog, message: 'user=alice action=login' };
    const steps: PipelineStep[] = [{ type: 'grok', pattern: 'user=%{WORD:user} action=%{WORD:action}' }];
    const result = await PipelineExecutor.execute(log, steps);
    expect(result.merged.user).toBe('alice');
    expect(result.merged.action).toBe('login');
  });

  it('continues executing remaining steps when one step fails', async () => {
    const steps: PipelineStep[] = [
      { type: 'grok', pattern: '%{UNKNOWN_PATTERN:x}' }, // will error
      { type: 'parser', parser: 'json' },
    ];
    const log: LogForPipeline = { ...sampleLog, message: '{"key":"val"}' };
    const result = await PipelineExecutor.execute(log, steps);
    expect(result.steps[0].error).toBeDefined();
    expect(result.merged.key).toBe('val'); // second step still ran
  });

  it('merges fields from multiple steps, earlier steps take priority', async () => {
    const steps: PipelineStep[] = [
      { type: 'parser', parser: 'nginx' },
      { type: 'grok', pattern: '%{IPV4:client_ip}' },
    ];
    const result = await PipelineExecutor.execute(sampleLog, steps);
    expect(result.merged.client_ip).toBe('192.168.1.1');
  });

  it('returns empty merged when no steps match', async () => {
    const steps: PipelineStep[] = [{ type: 'parser', parser: 'json' }];
    const log: LogForPipeline = { ...sampleLog, message: 'plain text' };
    const result = await PipelineExecutor.execute(log, steps);
    expect(result.merged).toEqual({});
  });
});
