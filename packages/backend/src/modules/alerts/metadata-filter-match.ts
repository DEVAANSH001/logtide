import type { MetadataFilter } from '@logtide/shared';

/**
 * Pure in-memory evaluator of MetadataFilter[] against a single metadata object.
 * Semantics MUST match buildMetadataFilterSql.
 * Non-string values are coerced via String() before comparison.
 * A key whose value is null is treated as missing.
 */
export function matchesMetadataFilters(
  metadata: Record<string, unknown> | null | undefined,
  filters: MetadataFilter[],
): boolean {
  if (filters.length === 0) return true;
  const meta = metadata ?? {};
  return filters.every((f) => matchOne(meta, f));
}

function matchOne(meta: Record<string, unknown>, f: MetadataFilter): boolean {
  const raw = meta[f.key];
  const present = Object.prototype.hasOwnProperty.call(meta, f.key) && raw !== null && raw !== undefined;
  const str = present ? String(raw) : undefined;

  switch (f.op) {
    case 'equals':
      return str !== undefined && str === f.value;
    case 'not_equals':
      if (!present) return !!f.include_missing;
      return str !== f.value;
    case 'in':
      return str !== undefined && (f.values ?? []).includes(str);
    case 'not_in':
      if (!present) return !!f.include_missing;
      return str !== undefined && !(f.values ?? []).includes(str);
    case 'exists':
      return present;
    case 'not_exists':
      return !present;
    case 'contains':
      return str !== undefined && str.toLowerCase().includes((f.value ?? '').toLowerCase());
  }
}
