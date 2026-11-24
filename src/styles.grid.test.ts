/// <reference types="vite/client" />
// A grid track written as `1fr` is `minmax(auto, 1fr)`: it cannot shrink below the widest unbreakable thing inside it (a pill, a date),
// so with a wider fallback font the whole page became wider than a 390 px window (found on Linux, 14 px). Every flexible track in the
// stylesheet must be able to shrink: `minmax(0, 1fr)`.
import css from './styles.css?raw';
import { describe, expect, it } from 'vitest';

describe('styles.css grid tracks', () => {
  it('has no flexible track that cannot shrink', () => {
    const bare: string[] = [];
    for (const m of css.matchAll(/grid-template-columns:([^;}]+)/g)) {
      const withoutMinmax = m[1].replace(/minmax\([^)]*\)/g, '');
      if (/\d*\.?\d+fr/.test(withoutMinmax)) bare.push(m[0]);
    }
    expect(bare).toEqual([]);
  });
});
