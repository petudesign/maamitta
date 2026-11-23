import { describe, expect, it } from 'vitest';
import { bucketAreaSqm } from './track';

describe('analytics helpers', () => {
  it('buckets areas into privacy-preserving ranges', () => {
    expect(bucketAreaSqm(0)).toBe('none');
    expect(bucketAreaSqm(-10)).toBe('none');
    expect(bucketAreaSqm(120)).toBe('<200m2');
    expect(bucketAreaSqm(550)).toBe('200-1000m2');
    expect(bucketAreaSqm(2500)).toBe('1000-5000m2');
    expect(bucketAreaSqm(12_000)).toBe('5000m2-2ha');
    expect(bucketAreaSqm(45_000)).toBe('>2ha');
  });
});
