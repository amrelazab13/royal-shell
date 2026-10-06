import { bandClass } from './band-colour';

describe('bandClass', () => {
  it('names the class a band code wears, in lower case', () => {
    expect(bandClass('B1')).toBe('b-b1');
    expect(bandClass('E2')).toBe('b-e2');
    expect(bandClass('a2')).toBe('b-a2');
  });

  it('gives nobody on a band the colourless class rather than a broken one', () => {
    expect(bandClass(null)).toBe('b-none');
    expect(bandClass('')).toBe('b-none');
    expect(bandClass(undefined)).toBe('b-none');
  });

  it('refuses anything that is not a band code, so no class is invented', () => {
    expect(bandClass('not a band')).toBe('b-none');
    expect(bandClass('E22')).toBe('b-none');
  });
});
