import { describe, it, expect } from 'vitest';
import { buildMetadataFilterSql } from '../../../modules/query/metadata-filter-sql.js';
import type { MetadataFilter } from '@logtide/shared';

const f = (o: Partial<MetadataFilter> & Pick<MetadataFilter, 'key' | 'op'>) =>
  ({ include_missing: false, ...o }) as MetadataFilter;

describe('buildMetadataFilterSql', () => {
  it('returns empty for no filters', () => {
    expect(buildMetadataFilterSql([], 0)).toEqual({ sql: '', params: [] });
  });

  it('builds equals', () => {
    const r = buildMetadataFilterSql([f({ key: 'env', op: 'equals', value: 'prod' })], 3);
    expect(r.sql).toBe(` AND (metadata->>$4 = $5)`);
    expect(r.params).toEqual(['env', 'prod']);
  });

  it('builds not_equals with include_missing=true', () => {
    const r = buildMetadataFilterSql(
      [f({ key: 'env', op: 'not_equals', value: 'dev', include_missing: true })],
      0,
    );
    expect(r.sql).toBe(` AND (metadata->>$1 IS DISTINCT FROM $2)`);
    expect(r.params).toEqual(['env', 'dev']);
  });

  it('builds not_equals with include_missing=false', () => {
    const r = buildMetadataFilterSql(
      [f({ key: 'env', op: 'not_equals', value: 'dev', include_missing: false })],
      0,
    );
    expect(r.sql).toBe(` AND (metadata ? $1 AND metadata->>$1 <> $2)`);
    expect(r.params).toEqual(['env', 'dev']);
  });

  it('builds in', () => {
    const r = buildMetadataFilterSql(
      [f({ key: 'env', op: 'in', values: ['prod', 'staging'] })],
      0,
    );
    expect(r.sql).toBe(` AND (metadata->>$1 = ANY($2))`);
    expect(r.params).toEqual(['env', ['prod', 'staging']]);
  });

  it('builds not_in with include_missing=true', () => {
    const r = buildMetadataFilterSql(
      [f({ key: 'env', op: 'not_in', values: ['dev'], include_missing: true })],
      0,
    );
    expect(r.sql).toBe(` AND (metadata->>$1 IS NULL OR metadata->>$1 <> ALL($2))`);
    expect(r.params).toEqual(['env', ['dev']]);
  });

  it('builds not_in with include_missing=false', () => {
    const r = buildMetadataFilterSql(
      [f({ key: 'env', op: 'not_in', values: ['dev'], include_missing: false })],
      0,
    );
    expect(r.sql).toBe(` AND (metadata ? $1 AND metadata->>$1 <> ALL($2))`);
    expect(r.params).toEqual(['env', ['dev']]);
  });

  it('builds exists', () => {
    const r = buildMetadataFilterSql([f({ key: 'env', op: 'exists' })], 0);
    expect(r.sql).toBe(` AND (metadata ? $1)`);
    expect(r.params).toEqual(['env']);
  });

  it('builds not_exists', () => {
    const r = buildMetadataFilterSql([f({ key: 'env', op: 'not_exists' })], 0);
    expect(r.sql).toBe(` AND (NOT (metadata ? $1))`);
    expect(r.params).toEqual(['env']);
  });

  it('builds contains', () => {
    const r = buildMetadataFilterSql([f({ key: 'msg', op: 'contains', value: 'foo' })], 0);
    expect(r.sql).toBe(` AND (metadata->>$1 ILIKE $2)`);
    expect(r.params).toEqual(['msg', '%foo%']);
  });

  it('escapes ILIKE wildcards in contains', () => {
    const r = buildMetadataFilterSql([f({ key: 'msg', op: 'contains', value: 'a%b_c' })], 0);
    expect(r.params[1]).toBe('%a\\%b\\_c%');
  });

  it('escapes backslash in contains', () => {
    const r = buildMetadataFilterSql([f({ key: 'msg', op: 'contains', value: 'a\\b' })], 0);
    expect(r.params[1]).toBe('%a\\\\b%');
  });

  it('combines multiple filters with AND and increments param offset', () => {
    const r = buildMetadataFilterSql(
      [
        f({ key: 'env', op: 'equals', value: 'prod' }),
        f({ key: 'region', op: 'in', values: ['us', 'eu'] }),
      ],
      0,
    );
    expect(r.sql).toBe(
      ` AND (metadata->>$1 = $2) AND (metadata->>$3 = ANY($4))`,
    );
    expect(r.params).toEqual(['env', 'prod', 'region', ['us', 'eu']]);
  });
});
