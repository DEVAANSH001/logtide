/**
 * Digest Generation Job Processor
 *
 * Processes scheduled digest generation jobs triggered by cron.
 */

import type { IJob } from '../abstractions/types.js';
import { digestGenerator, type DigestJobPayload } from '../../modules/digests/generator.js';
 
//called by the worker when a scheduled digest cron job fires.
export async function processDigestGeneration(job: IJob<DigestJobPayload>): Promise<void> {
  const { organizationId, digestConfigId, frequency } = job.data;

  console.log(
    `[DigestJob] Processing ${frequency} digest for org ${organizationId} (config: ${digestConfigId})`
  );

  try {
    await digestGenerator.generateAndSendDigest(job.data);
    console.log(`[DigestJob] Successfully completed digest for org ${organizationId}`);
  } catch (error) {
    console.error(
      `[DigestJob] Failed to process digest for org ${organizationId}:`,
      error
    );
    throw error; 
  }
}
