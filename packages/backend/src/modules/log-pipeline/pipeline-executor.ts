import type { LogForPipeline, PipelineStep, ExecutorResult, StepResult, ExtractedFields } from './types.js';
import { runBuiltinParser } from './parsers/index.js';
import { matchGrok } from './parsers/grok-engine.js';
import { runGeoIpStep } from './steps/geoip.js';

export class PipelineExecutor {
  static async execute(log: LogForPipeline, steps: PipelineStep[]): Promise<ExecutorResult> {
    const stepResults: StepResult[] = [];
    // Accumulated extracted fields — earlier steps take priority (no overwrite)
    const merged: ExtractedFields = {};

    // Build a running metadata view that includes extracted fields so later steps can use them
    let currentMeta: Record<string, unknown> = { ...(log.metadata ?? {}) };

    for (const step of steps) {
      const stepResult: StepResult = { step, extracted: {} };

      try {
        let extracted: Record<string, unknown> | null = null;

        if (step.type === 'parser') {
          extracted = runBuiltinParser(step, log.message);
        } else if (step.type === 'grok') {
          const source = step.source
            ? (currentMeta[step.source] as string | undefined) ?? log.message
            : log.message;
          extracted = matchGrok(step.pattern, source);
        } else if (step.type === 'geoip') {
          // Pass log with accumulated metadata so geoip can read previously extracted IP
          extracted = await runGeoIpStep(step, { ...log, metadata: currentMeta });
        }

        if (extracted) {
          stepResult.extracted = extracted;
          // Merge into accumulated: don't overwrite keys set by earlier steps
          for (const [k, v] of Object.entries(extracted)) {
            if (!(k in merged)) {
              merged[k] = v;
            }
          }
          // Update running metadata view
          currentMeta = { ...extracted, ...currentMeta };
        }
      } catch (err) {
        stepResult.error = err instanceof Error ? err.message : String(err);
      }

      stepResults.push(stepResult);
    }

    return { steps: stepResults, merged };
  }
}
