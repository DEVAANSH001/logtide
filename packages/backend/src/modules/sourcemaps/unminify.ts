/**
 * Source Map Unminifier
 *
 * Resolves minified stack frame locations to original source positions
 * using uploaded source maps. Called from the exception-parsing worker.
 */

import { SourceMapConsumer } from 'source-map';
import type { SourceMapsService } from './service.js';
import type { StackFrame } from '../exceptions/types.js';
import path from 'node:path';

/**
 * Extract a code context snippet from source content around a line.
 */
function extractCodeContext(
  sourceContent: string,
  line: number,
  contextLines = 3,
): { pre: string[]; line: string; post: string[] } | undefined {
  const lines = sourceContent.split('\n');
  const idx = line - 1; // 0-indexed

  if (idx < 0 || idx >= lines.length) return undefined;

  return {
    pre: lines.slice(Math.max(0, idx - contextLines), idx),
    line: lines[idx],
    post: lines.slice(idx + 1, idx + 1 + contextLines),
  };
}

export class SourceMapUnminifier {
  constructor(private sourceMapsService: SourceMapsService) {}

  /**
   * Attempt to resolve original locations for all frames in a parsed exception.
   * Frames are modified in-place. Frames without matching source maps are left unchanged.
   */
  async unminifyFrames(
    frames: StackFrame[],
    projectId: string,
    release: string,
  ): Promise<StackFrame[]> {
    if (frames.length === 0) return frames;

    // Group frames by their JS file basename → map file name
    const framesByMapFile = new Map<string, StackFrame[]>();

    for (const frame of frames) {
      if (!frame.filePath || !frame.lineNumber) continue;

      const basename = path.basename(frame.filePath).replace(/\?.*$/, '');
      const mapName = basename + '.map';

      const group = framesByMapFile.get(mapName) || [];
      group.push(frame);
      framesByMapFile.set(mapName, group);
    }

    // Process each map file
    for (const [mapName, groupFrames] of framesByMapFile) {
      try {
        const mapContent = await this.sourceMapsService.getMapContent(
          projectId,
          release,
          mapName,
        );

        if (!mapContent) continue;

        const rawMap = JSON.parse(mapContent.toString('utf-8'));

        await SourceMapConsumer.with(rawMap, null, (consumer) => {
          for (const frame of groupFrames) {
            try {
              const pos = consumer.originalPositionFor({
                line: frame.lineNumber ?? 1,
                column: frame.columnNumber ?? 0,
              });

              if (pos.source === null) continue;

              // Store original (source-mapped) location
              frame.originalFile = pos.source;
              frame.originalLine = pos.line ?? undefined;
              frame.originalColumn = pos.column ?? undefined;
              frame.originalFunction = pos.name || undefined;

              // Extract code context from sourcesContent if available
              const sourceContent = consumer.sourceContentFor(pos.source, true);
              if (sourceContent && pos.line) {
                const context = extractCodeContext(sourceContent, pos.line);
                if (context) {
                  frame.codeContext = context;
                }
              }
            } catch {
              // Skip individual frame errors
            }
          }
        });
      } catch (err) {
        console.warn(
          `[SourceMap] Failed to process ${mapName} for project ${projectId} release ${release}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    return frames;
  }
}
