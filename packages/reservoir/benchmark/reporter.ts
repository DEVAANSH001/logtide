import { writeFileSync } from 'fs';
import os from 'os';
import type { BenchmarkResult, BenchmarkReport, BenchmarkConfig } from './config.js';
import type { EngineType } from '../src/index.js';

// ---------------------------------------------------------------------------
// Console comparison table
// ---------------------------------------------------------------------------

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  bgGreen: '\x1b[42m',
  white: '\x1b[37m',
};

function pad(str: string, len: number, align: 'left' | 'right' = 'left'): string {
  if (str.length >= len) return str.slice(0, len);
  const padding = ' '.repeat(len - str.length);
  return align === 'right' ? padding + str : str + padding;
}

function formatMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}us`;
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatOps(ops: number | undefined): string {
  if (ops == null) return '-';
  if (ops >= 1_000_000) return `${(ops / 1_000_000).toFixed(1)}M/s`;
  if (ops >= 1_000) return `${(ops / 1_000).toFixed(1)}K/s`;
  return `${ops}/s`;
}

export function printComparisonTable(
  results: BenchmarkResult[],
  engines: EngineType[],
  volume: string,
  domain: 'logs' | 'spans' | 'metrics',
): void {
  const domainResults = results.filter(r => r.domain === domain && r.volume === volume);
  if (domainResults.length === 0) return;

  // Group by operation
  const operations = [...new Set(domainResults.map(r => r.operation))];

  const COL_OP = 32;
  const COL_ENGINE = 22;
  const divider = '-'.repeat(COL_OP + 2 + engines.length * (COL_ENGINE + 3));

  console.log('');
  console.log(`${COLORS.bold}${COLORS.cyan}=== ${domain.toUpperCase()} BENCHMARK | Volume: ${volume} ===${COLORS.reset}`);
  console.log(divider);

  // Header
  let header = `  ${pad('Operation', COL_OP)}`;
  for (const eng of engines) {
    header += ` | ${pad(eng.toUpperCase(), COL_ENGINE)}`;
  }
  console.log(`${COLORS.bold}${header}${COLORS.reset}`);
  console.log(divider);

  for (const op of operations) {
    const opResults = domainResults.filter(r => r.operation === op);

    // Find fastest engine for this operation
    const byEngine = new Map<EngineType, BenchmarkResult>();
    for (const r of opResults) byEngine.set(r.engine, r);

    const p50Values = engines.map(e => byEngine.get(e)?.stats.p50 ?? Infinity);
    const minP50 = Math.min(...p50Values.filter(v => v !== Infinity));

    let row = `  ${pad(op, COL_OP)}`;
    for (let i = 0; i < engines.length; i++) {
      const r = byEngine.get(engines[i]);
      if (!r) {
        row += ` | ${pad('-', COL_ENGINE)}`;
        continue;
      }

      if (r.error) {
        row += ` | ${COLORS.red}${pad('ERROR', COL_ENGINE)}${COLORS.reset}`;
        continue;
      }

      const isFastest = r.stats.p50 === minP50 && engines.length > 1;
      const p50Str = formatMs(r.stats.p50);
      const opsStr = r.opsPerSec ? ` ${formatOps(r.opsPerSec)}` : '';
      const cell = `${p50Str} p50${opsStr}`;

      if (isFastest) {
        row += ` | ${COLORS.green}${COLORS.bold}${pad(cell, COL_ENGINE)}${COLORS.reset}`;
      } else {
        row += ` | ${pad(cell, COL_ENGINE)}`;
      }
    }

    console.log(row);
  }

  console.log(divider);
}

export function printDetailedTable(
  results: BenchmarkResult[],
  engines: EngineType[],
  volume: string,
  domain: 'logs' | 'spans' | 'metrics',
): void {
  const domainResults = results.filter(r => r.domain === domain && r.volume === volume);
  if (domainResults.length === 0) return;

  console.log('');
  console.log(`${COLORS.bold}${COLORS.magenta}--- ${domain.toUpperCase()} DETAILED STATS | Volume: ${volume} ---${COLORS.reset}`);

  for (const engine of engines) {
    const engineResults = domainResults.filter(r => r.engine === engine);
    if (engineResults.length === 0) continue;

    console.log(`\n  ${COLORS.bold}[${engine.toUpperCase()}]${COLORS.reset}`);
    console.log(`  ${'Operation'.padEnd(34)} ${'Avg'.padStart(10)} ${'p50'.padStart(10)} ${'p95'.padStart(10)} ${'p99'.padStart(10)} ${'Min'.padStart(10)} ${'Max'.padStart(10)} ${'Ops/s'.padStart(10)} ${'Mem +MB'.padStart(10)} ${'RSS MB'.padStart(10)}`);
    console.log(`  ${'-'.repeat(124)}`);

    for (const r of engineResults) {
      if (r.error) {
        console.log(`  ${r.operation.padEnd(34)} ${COLORS.red}ERROR: ${r.error.slice(0, 60)}${COLORS.reset}`);
        continue;
      }

      const memDelta = r.memoryDeltaMB != null ? `+${r.memoryDeltaMB}` : '-';
      const rssAfter = r.memoryAfter?.rssMB != null ? String(r.memoryAfter.rssMB) : '-';

      console.log(
        `  ${r.operation.padEnd(34)} ` +
        `${formatMs(r.stats.avg).padStart(10)} ` +
        `${formatMs(r.stats.p50).padStart(10)} ` +
        `${formatMs(r.stats.p95).padStart(10)} ` +
        `${formatMs(r.stats.p99).padStart(10)} ` +
        `${formatMs(r.stats.min).padStart(10)} ` +
        `${formatMs(r.stats.max).padStart(10)} ` +
        `${formatOps(r.opsPerSec).padStart(10)} ` +
        `${memDelta.padStart(10)} ` +
        `${rssAfter.padStart(10)}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Summary winner table
// ---------------------------------------------------------------------------

export function printSummary(results: BenchmarkResult[], engines: EngineType[]): void {
  console.log('');
  console.log(`${COLORS.bold}${COLORS.yellow}=== OVERALL WINNER SUMMARY ===${COLORS.reset}`);

  const domains: Array<'logs' | 'spans' | 'metrics'> = ['logs', 'spans', 'metrics'];
  const wins: Record<string, number> = {};
  for (const e of engines) wins[e] = 0;

  for (const domain of domains) {
    const domainResults = results.filter(r => r.domain === domain && !r.error);
    const operations = [...new Set(domainResults.map(r => r.operation))];

    for (const op of operations) {
      const opResults = domainResults.filter(r => r.operation === op);
      let bestEngine: EngineType | null = null;
      let bestP50 = Infinity;

      for (const r of opResults) {
        if (r.stats.p50 < bestP50) {
          bestP50 = r.stats.p50;
          bestEngine = r.engine;
        }
      }

      if (bestEngine) wins[bestEngine]++;
    }
  }

  const total = Object.values(wins).reduce((a, b) => a + b, 0);

  for (const e of engines) {
    const count = wins[e];
    const pct = total > 0 ? ((count / total) * 100).toFixed(0) : '0';
    const bar = '#'.repeat(Math.round((count / Math.max(total, 1)) * 40));
    console.log(`  ${e.padEnd(12)} ${String(count).padStart(3)} wins (${pct.padStart(3)}%) ${COLORS.green}${bar}${COLORS.reset}`);
  }

  console.log('');
}

// ---------------------------------------------------------------------------
// JSON export
// ---------------------------------------------------------------------------

export function exportJSON(
  results: BenchmarkResult[],
  config: BenchmarkConfig,
  engines: EngineType[],
  volume: string,
  outputPath: string,
): void {
  const report: BenchmarkReport = {
    timestamp: new Date().toISOString(),
    config,
    volume,
    engines,
    results: results.filter(r => r.volume === volume),
    systemInfo: getSystemInfo(),
  };

  writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`\n  Results saved to ${outputPath}`);
}

// ---------------------------------------------------------------------------
// Full report
// ---------------------------------------------------------------------------

export function printFullReport(
  results: BenchmarkResult[],
  engines: EngineType[],
  volumes: string[],
): void {
  const domains: Array<'logs' | 'spans' | 'metrics'> = ['logs', 'spans', 'metrics'];

  for (const volume of volumes) {
    const volumeResults = results.filter(r => r.volume === volume);
    if (volumeResults.length === 0) continue;

    console.log('\n' + '='.repeat(80));
    console.log(`${COLORS.bold}  VOLUME: ${volume}${COLORS.reset}`);
    console.log('='.repeat(80));

    for (const domain of domains) {
      printComparisonTable(volumeResults, engines, volume, domain);
      printDetailedTable(volumeResults, engines, volume, domain);
    }
  }

  printSummary(results, engines);
}

export function exportFullReport(
  results: BenchmarkResult[],
  config: BenchmarkConfig,
  engines: EngineType[],
  volumes: string[],
  outputPath: string,
): void {
  const report: BenchmarkReport = {
    timestamp: new Date().toISOString(),
    config,
    volume: volumes.join(','),
    engines,
    results,
    systemInfo: getSystemInfo(),
  };

  writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`\n  Full report saved to ${outputPath}`);
}

function getSystemInfo(): Record<string, unknown> {
  return {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    cpus: os.cpus().length,
    cpuModel: os.cpus()[0]?.model ?? 'unknown',
    totalMemoryGB: Math.round(os.totalmem() / 1e9),
    freeMemoryGB: Math.round(os.freemem() / 1e9),
    hostname: os.hostname(),
  };
}
