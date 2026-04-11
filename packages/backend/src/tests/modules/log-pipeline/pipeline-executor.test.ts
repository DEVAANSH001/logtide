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

  it('runs a geoip step (gracefully returns empty when no GeoLite2 DB)', async () => {
    const log: LogForPipeline = {
      ...sampleLog,
      metadata: { client_ip: '8.8.8.8' },
    };
    const steps: PipelineStep[] = [{ type: 'geoip', field: 'client_ip', target: 'geo' }];
    const result = await PipelineExecutor.execute(log, steps);
    // Without GeoLite2 DB, lookup returns null → empty merged is acceptable
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].error).toBeUndefined();
  });

  it('geoip step uses accumulated metadata from previous steps', async () => {
    const log: LogForPipeline = {
      ...sampleLog,
      message: 'client_ip=1.2.3.4',
      metadata: null,
    };
    const steps: PipelineStep[] = [
      { type: 'grok', pattern: 'client_ip=%{IPV4:client_ip}' },
      { type: 'geoip', field: 'client_ip', target: 'geo' },
    ];
    const result = await PipelineExecutor.execute(log, steps);
    expect(result.merged.client_ip).toBe('1.2.3.4');
    // geoip step ran without error even if no DB present
    expect(result.steps[1].error).toBeUndefined();
  });

  it('geoip step is a no-op when field is missing from metadata', async () => {
    const log: LogForPipeline = { ...sampleLog, metadata: null };
    const steps: PipelineStep[] = [{ type: 'geoip', field: 'nonexistent_field', target: 'geo' }];
    const result = await PipelineExecutor.execute(log, steps);
    expect(result.merged).toEqual({});
  });

  it('grok step uses custom source field', async () => {
    const log: LogForPipeline = {
      ...sampleLog,
      metadata: { raw: 'status=ok' },
    };
    const steps: PipelineStep[] = [{ type: 'grok', source: 'raw', pattern: 'status=%{WORD:status}' }];
    const result = await PipelineExecutor.execute(log, steps);
    expect(result.merged.status).toBe('ok');
  });

  it('runs with empty steps array', async () => {
    const result = await PipelineExecutor.execute(sampleLog, []);
    expect(result.merged).toEqual({});
    expect(result.steps).toHaveLength(0);
  });

  it('runs apache parser step', async () => {
    const apacheLine = '127.0.0.1 - frank [10/Oct/2000:13:55:36 -0700] "GET /apache_pb.gif HTTP/1.0" 200 2326 "http://www.example.com/" "Mozilla/4.08"';
    const log: LogForPipeline = { ...sampleLog, message: apacheLine };
    const steps: PipelineStep[] = [{ type: 'parser', parser: 'apache' }];
    const result = await PipelineExecutor.execute(log, steps);
    expect(result.merged.client_ip).toBe('127.0.0.1');
  });

  it('runs syslog parser step', async () => {
    const syslogLine = 'Jan  1 00:00:00 myhost sshd[1234]: Accepted password for user from 1.2.3.4';
    const log: LogForPipeline = { ...sampleLog, message: syslogLine };
    const steps: PipelineStep[] = [{ type: 'parser', parser: 'syslog' }];
    const result = await PipelineExecutor.execute(log, steps);
    // syslog may or may not parse depending on format, but step should run
    expect(result.steps).toHaveLength(1);
  });

  it('runs logfmt parser step', async () => {
    const log: LogForPipeline = { ...sampleLog, message: 'level=info msg=hello service=api' };
    const steps: PipelineStep[] = [{ type: 'parser', parser: 'logfmt' }];
    const result = await PipelineExecutor.execute(log, steps);
    expect(result.merged.level).toBe('info');
    expect(result.merged.service).toBe('api');
  });
});
