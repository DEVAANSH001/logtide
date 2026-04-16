import { describe, it, expect } from 'vitest';
import { metadataFilterSchema, metadataFiltersSchema } from './metadata-filter.js';

describe('metadataFilterSchema', () => {
  it('accepts equals with value', () => {
    expect(metadataFilterSchema.parse({ key: 'env', op: 'equals', value: 'prod' })).toMatchObject({
      key: 'env', op: 'equals', value: 'prod',
    });
  });

  it('accepts in with values', () => {
    expect(metadataFilterSchema.parse({ key: 'env', op: 'in', values: ['prod', 'staging'] })).toBeTruthy();
  });

  it('accepts exists without value', () => {
    expect(metadataFilterSchema.parse({ key: 'env', op: 'exists' })).toBeTruthy();
  });

  it('rejects equals without value', () => {
    expect(() => metadataFilterSchema.parse({ key: 'env', op: 'equals' })).toThrow();
  });

  it('rejects in without values array', () => {
    expect(() => metadataFilterSchema.parse({ key: 'env', op: 'in' })).toThrow();
  });

  it('rejects empty key', () => {
    expect(() => metadataFilterSchema.parse({ key: '', op: 'exists' })).toThrow();
  });

  it('defaults include_missing to true for not_equals', () => {
    const r = metadataFilterSchema.parse({ key: 'env', op: 'not_equals', value: 'dev' });
    expect(r.include_missing).toBe(true);
  });

  it('defaults include_missing to false for equals', () => {
    const r = metadataFilterSchema.parse({ key: 'env', op: 'equals', value: 'prod' });
    expect(r.include_missing).toBe(false);
  });

  it('rejects not_exists with value', () => {
    expect(() => metadataFilterSchema.parse({ key: 'env', op: 'not_exists', value: 'prod' })).toThrow();
  });

  it('rejects exists with values', () => {
    expect(() => metadataFilterSchema.parse({ key: 'env', op: 'exists', values: ['x'] })).toThrow();
  });

  it('rejects equals with values', () => {
    expect(() => metadataFilterSchema.parse({ key: 'env', op: 'equals', value: 'prod', values: ['x'] })).toThrow();
  });

  it('rejects in with value', () => {
    expect(() => metadataFilterSchema.parse({ key: 'env', op: 'in', values: ['x'], value: 'y' })).toThrow();
  });
});

describe('metadataFiltersSchema', () => {
  it('accepts empty array as zero filters', () => {
    expect(metadataFiltersSchema.parse([])).toEqual([]);
  });

  it('caps at 10 filters', () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ key: `k${i}`, op: 'exists' as const }));
    expect(() => metadataFiltersSchema.parse(many)).toThrow();
  });
});
