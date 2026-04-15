import type { MetadataFilter } from '@logtide/shared';

type BuildResult = { sql: string; params: unknown[] };

function escapeLike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Build a parameterized SQL WHERE fragment for metadata filters.
 * Returns sql starting with " AND " (or "" for empty input) plus a parallel params array.
 * paramOffset is the count of placeholders already used in the outer query.
 */
export function buildMetadataFilterSql(
  filters: MetadataFilter[],
  paramOffset: number,
): BuildResult {
  const parts: string[] = [];
  const params: unknown[] = [];
  let i = paramOffset;

  for (const f of filters) {
    switch (f.op) {
      case 'equals': {
        i += 2;
        parts.push(`(metadata->>$${i - 1} = $${i})`);
        params.push(f.key, f.value);
        break;
      }
      case 'not_equals': {
        if (f.include_missing) {
          i += 2;
          parts.push(`(metadata->>$${i - 1} IS DISTINCT FROM $${i})`);
        } else {
          i += 1;
          parts.push(`(metadata ? $${i} AND metadata->>$${i} <> $${i + 1})`);
          i += 1;
        }
        params.push(f.key, f.value);
        break;
      }
      case 'in': {
        i += 2;
        parts.push(`(metadata->>$${i - 1} = ANY($${i}))`);
        params.push(f.key, f.values);
        break;
      }
      case 'not_in': {
        i += 2;
        if (f.include_missing) {
          parts.push(`(metadata->>$${i - 1} IS NULL OR metadata->>$${i - 1} <> ALL($${i}))`);
        } else {
          parts.push(`(metadata ? $${i - 1} AND metadata->>$${i - 1} <> ALL($${i}))`);
        }
        params.push(f.key, f.values);
        break;
      }
      case 'exists': {
        i += 1;
        parts.push(`(metadata ? $${i})`);
        params.push(f.key);
        break;
      }
      case 'not_exists': {
        i += 1;
        parts.push(`(NOT (metadata ? $${i}))`);
        params.push(f.key);
        break;
      }
      case 'contains': {
        i += 2;
        parts.push(`(metadata->>$${i - 1} ILIKE $${i})`);
        params.push(f.key, `%${escapeLike(f.value ?? '')}%`);
        break;
      }
    }
  }

  if (parts.length === 0) return { sql: '', params: [] };
  return { sql: ' AND ' + parts.join(' AND '), params };
}
