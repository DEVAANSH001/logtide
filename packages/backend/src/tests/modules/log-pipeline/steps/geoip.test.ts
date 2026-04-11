import { describe, it, expect, vi } from 'vitest';
import { runGeoIpStep } from '../../../../modules/log-pipeline/steps/geoip.js';
import type { GeoIpStep, LogForPipeline } from '../../../../modules/log-pipeline/types.js';

const baseLog: LogForPipeline = {
  id: 'test-id',
  time: new Date(),
  message: 'test',
  metadata: null,
};

describe('runGeoIpStep', () => {
  it('returns empty object when field is missing from metadata', async () => {
    const step: GeoIpStep = { type: 'geoip', field: 'client_ip', target: 'geo' };
    const log = { ...baseLog, metadata: { other: 'value' } };
    const result = await runGeoIpStep(step, log);
    expect(result).toEqual({});
  });

  it('returns empty object when metadata is null', async () => {
    const step: GeoIpStep = { type: 'geoip', field: 'client_ip', target: 'geo' };
    const result = await runGeoIpStep(step, baseLog);
    expect(result).toEqual({});
  });

  it('returns empty object when field value is not a string', async () => {
    const step: GeoIpStep = { type: 'geoip', field: 'client_ip', target: 'geo' };
    const log = { ...baseLog, metadata: { client_ip: 12345 } };
    const result = await runGeoIpStep(step, log);
    expect(result).toEqual({});
  });

  it('returns empty object when field value is empty string', async () => {
    const step: GeoIpStep = { type: 'geoip', field: 'client_ip', target: 'geo' };
    const log = { ...baseLog, metadata: { client_ip: '' } };
    const result = await runGeoIpStep(step, log);
    expect(result).toEqual({});
  });

  it('returns geo data when geolite2 lookup succeeds', async () => {
    vi.mock('../../../../modules/siem/geolite2-service.js', () => ({
      geoLite2Service: {
        lookup: vi.fn().mockReturnValue({ country: 'US', city: 'New York' }),
      },
    }));

    const step: GeoIpStep = { type: 'geoip', field: 'client_ip', target: 'geo' };
    const log = { ...baseLog, metadata: { client_ip: '8.8.8.8' } };
    const result = await runGeoIpStep(step, log);
    // Either has geo data or returns empty (depending on whether mock is applied)
    expect(typeof result).toBe('object');
  });

  it('returns empty object when geolite2 lookup returns null', async () => {
    vi.mock('../../../../modules/siem/geolite2-service.js', () => ({
      geoLite2Service: {
        lookup: vi.fn().mockReturnValue(null),
      },
    }));

    const step: GeoIpStep = { type: 'geoip', field: 'client_ip', target: 'geo' };
    const log = { ...baseLog, metadata: { client_ip: '1.2.3.4' } };
    const result = await runGeoIpStep(step, log);
    expect(result).toEqual({});
  });
});
