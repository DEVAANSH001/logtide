import { describe, it, expect } from 'vitest';
import { matchesMetadataFilters } from '../../../modules/alerts/metadata-filter-match.js';
import type { MetadataFilter } from '@logtide/shared';

const f = (o: Partial<MetadataFilter> & Pick<MetadataFilter, 'key' | 'op'>) =>
  ({ include_missing: false, ...o }) as MetadataFilter;

describe('matchesMetadataFilters', () => {
  it('true for no filters', () => {
    expect(matchesMetadataFilters({ foo: 'bar' }, [])).toBe(true);
  });

  it('equals', () => {
    const filt = [f({ key: 'env', op: 'equals', value: 'prod' })];
    expect(matchesMetadataFilters({ env: 'prod' }, filt)).toBe(true);
    expect(matchesMetadataFilters({ env: 'dev' }, filt)).toBe(false);
    expect(matchesMetadataFilters({}, filt)).toBe(false);
  });

  it('not_equals include_missing=true excludes only explicit match', () => {
    const filt = [f({ key: 'env', op: 'not_equals', value: 'dev', include_missing: true })];
    expect(matchesMetadataFilters({ env: 'prod' }, filt)).toBe(true);
    expect(matchesMetadataFilters({ env: 'dev' }, filt)).toBe(false);
    expect(matchesMetadataFilters({}, filt)).toBe(true);
    expect(matchesMetadataFilters(null, filt)).toBe(true);
  });

  it('not_equals include_missing=false requires key present', () => {
    const filt = [f({ key: 'env', op: 'not_equals', value: 'dev', include_missing: false })];
    expect(matchesMetadataFilters({ env: 'prod' }, filt)).toBe(true);
    expect(matchesMetadataFilters({}, filt)).toBe(false);
  });

  it('in', () => {
    const filt = [f({ key: 'env', op: 'in', values: ['prod', 'staging'] })];
    expect(matchesMetadataFilters({ env: 'prod' }, filt)).toBe(true);
    expect(matchesMetadataFilters({ env: 'staging' }, filt)).toBe(true);
    expect(matchesMetadataFilters({ env: 'dev' }, filt)).toBe(false);
    expect(matchesMetadataFilters({}, filt)).toBe(false);
  });

  it('not_in include_missing=true', () => {
    const filt = [f({ key: 'env', op: 'not_in', values: ['dev'], include_missing: true })];
    expect(matchesMetadataFilters({ env: 'prod' }, filt)).toBe(true);
    expect(matchesMetadataFilters({ env: 'dev' }, filt)).toBe(false);
    expect(matchesMetadataFilters({}, filt)).toBe(true);
  });

  it('not_in include_missing=false', () => {
    const filt = [f({ key: 'env', op: 'not_in', values: ['dev'], include_missing: false })];
    expect(matchesMetadataFilters({ env: 'prod' }, filt)).toBe(true);
    expect(matchesMetadataFilters({ env: 'dev' }, filt)).toBe(false);
    expect(matchesMetadataFilters({}, filt)).toBe(false);
  });

  it('exists', () => {
    expect(matchesMetadataFilters({ env: 'x' }, [f({ key: 'env', op: 'exists' })])).toBe(true);
    expect(matchesMetadataFilters({}, [f({ key: 'env', op: 'exists' })])).toBe(false);
  });

  it('not_exists', () => {
    expect(matchesMetadataFilters({}, [f({ key: 'env', op: 'not_exists' })])).toBe(true);
    expect(matchesMetadataFilters({ env: 'x' }, [f({ key: 'env', op: 'not_exists' })])).toBe(false);
  });

  it('contains is case-insensitive', () => {
    const filt = [f({ key: 'msg', op: 'contains', value: 'FOO' })];
    expect(matchesMetadataFilters({ msg: 'hello foobar' }, filt)).toBe(true);
    expect(matchesMetadataFilters({ msg: 'bar' }, filt)).toBe(false);
    expect(matchesMetadataFilters({}, filt)).toBe(false);
  });

  it('coerces non-string metadata values via String() before comparing', () => {
    const filt = [f({ key: 'port', op: 'equals', value: '8080' })];
    expect(matchesMetadataFilters({ port: 8080 }, filt)).toBe(true);
  });

  it('treats null metadata value as missing', () => {
    const filt = [f({ key: 'env', op: 'equals', value: 'prod' })];
    expect(matchesMetadataFilters({ env: null }, filt)).toBe(false);
  });

  it('ANDs all filters', () => {
    const filt = [
      f({ key: 'env', op: 'equals', value: 'prod' }),
      f({ key: 'region', op: 'in', values: ['us', 'eu'] }),
    ];
    expect(matchesMetadataFilters({ env: 'prod', region: 'us' }, filt)).toBe(true);
    expect(matchesMetadataFilters({ env: 'prod', region: 'asia' }, filt)).toBe(false);
    expect(matchesMetadataFilters({ env: 'dev', region: 'us' }, filt)).toBe(false);
  });
});
