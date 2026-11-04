import { describe, it, expect } from 'vitest';
import { classifySafety, classifySurface, shareBy, runsBy, SAFETY_ORDER } from '../safety';

describe('safety', () => {
  it.each([
    [{ highway: 'cycleway' }, 'safe'],
    [{ highway: 'track' }, 'safe'],
    [{ highway: 'residential', maxspeed: '30' }, 'safe'],
    [{ highway: 'residential', maxspeed: 'CH:zone30' }, 'safe'],
    [{ highway: 'residential' }, 'medium'],
    [{ highway: 'secondary', 'cycleway:right': 'lane', maxspeed: '50' }, 'medium'],
    [{ highway: 'secondary', cycleway: 'track' }, 'safe'],
    [{ highway: 'primary', maxspeed: '50' }, 'exposed'],
    [{ highway: 'tertiary', maxspeed: '80' }, 'exposed'],
    [{ highway: 'unclassified' }, 'medium'],
    [{}, 'unknown'],
  ])('%j → %s', (tags, cls) => expect(classifySafety(tags as Record<string, string>)).toBe(cls));

  it('surface', () => {
    expect(classifySurface({ surface: 'asphalt' })).toBe('paved');
    expect(classifySurface({ surface: 'fine_gravel' })).toBe('gravel');
    expect(classifySurface({ highway: 'track', tracktype: 'grade4' })).toBe('unpaved');
    expect(classifySurface({ highway: 'residential' })).toBe('paved');
    expect(classifySurface({ highway: 'path' })).toBe('unknown');
  });

  const segs = [
    { from: 0, to: 300, tags: { highway: 'cycleway' } },
    { from: 300, to: 500, tags: { highway: 'path' } },
    { from: 500, to: 1000, tags: { highway: 'primary' } },
  ];
  it('shareBy sums percentages', () => {
    const s = shareBy(segs, classifySafety, SAFETY_ORDER);
    expect(s).toEqual([{ cls: 'safe', meters: 500, pct: 50 }, { cls: 'exposed', meters: 500, pct: 50 }]);
  });
  it('runsBy merges consecutive equal classes', () => {
    expect(runsBy(segs, classifySafety)).toEqual([{ from: 0, to: 500, cls: 'safe' }, { from: 500, to: 1000, cls: 'exposed' }]);
  });
});
