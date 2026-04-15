import { z } from 'zod';

export const METADATA_FILTER_OPS = [
  'equals', 'not_equals', 'in', 'not_in', 'exists', 'not_exists', 'contains',
] as const;

export const metadataFilterOpSchema = z.enum(METADATA_FILTER_OPS);

const NEGATIVE_OPS = new Set(['not_equals', 'not_in', 'not_exists']);

export const metadataFilterSchema = z
  .object({
    key: z.string().min(1).max(200),
    op: metadataFilterOpSchema,
    value: z.string().max(1000).optional(),
    values: z.array(z.string().max(1000)).min(1).max(50).optional(),
    include_missing: z.boolean().optional(),
  })
  .superRefine((f, ctx) => {
    if (f.op === 'equals' || f.op === 'not_equals' || f.op === 'contains') {
      if (f.value === undefined) {
        ctx.addIssue({ code: 'custom', path: ['value'], message: `op ${f.op} requires value` });
      }
    }
    if (f.op === 'in' || f.op === 'not_in') {
      if (!f.values || f.values.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['values'], message: `op ${f.op} requires non-empty values` });
      }
    }
  })
  .transform((f) => ({
    ...f,
    include_missing: f.include_missing ?? NEGATIVE_OPS.has(f.op),
  }));

export const metadataFiltersSchema = z.array(metadataFilterSchema).max(10).default([]);

export type MetadataFilterOp = z.infer<typeof metadataFilterOpSchema>;
export type MetadataFilter = z.infer<typeof metadataFilterSchema>;
