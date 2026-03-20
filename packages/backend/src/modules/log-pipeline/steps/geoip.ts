import type { GeoIpStep, LogForPipeline } from '../types.js';

// Lazy import to avoid crashing when GeoLite2 DB is not present
async function tryGeoLookup(ip: string): Promise<Record<string, unknown> | null> {
  try {
    const { geoLite2Service } = await import('../../siem/geolite2-service.js');
    const geo = geoLite2Service.lookup(ip);
    return geo ?? null;
  } catch {
    return null;
  }
}

export async function runGeoIpStep(
  step: GeoIpStep,
  log: LogForPipeline
): Promise<Record<string, unknown>> {
  const meta = log.metadata ?? {};
  const ip = meta[step.field];
  if (typeof ip !== 'string' || !ip) return {};

  try {
    const geo = await tryGeoLookup(ip);
    if (!geo) return {};
    return { [step.target]: geo };
  } catch {
    return {};
  }
}
