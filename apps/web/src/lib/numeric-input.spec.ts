import { num } from './numeric-input';

/**
 * The half-typed states are the whole point of this helper, and they are what the clinic
 * originally reported: "i can not type the amount", "puts 0 before the number". A controlled
 * number input that converts on every keystroke cannot hold "12." long enough for the user to
 * reach the decimals, and cannot be emptied at all.
 */
describe('num', () => {
  it('reads a plain amount', () => {
    expect(num('1200')).toBe(1200);
    expect(num('1200.50')).toBe(1200.5);
  });

  it('treats an empty field as the fallback rather than as zero-by-accident', () => {
    expect(num('')).toBe(0);
    expect(num('', 16)).toBe(16);
  });

  it('survives the intermediate states of typing a decimal', () => {
    // Each of these is a real keystroke-by-keystroke value of the card-fee field.
    expect(num('.')).toBe(0);
    expect(num('12.')).toBe(12);
    expect(num('12.5')).toBe(12.5);
  });

  it('does not turn junk into a number', () => {
    expect(num('abc')).toBe(0);
    expect(num('abc', 5)).toBe(5);
  });

  it('rejects a non-finite value', () => {
    // parseFloat('Infinity') is Infinity, which would print as "$∞" on a quote.
    expect(num('Infinity')).toBe(0);
  });

  it('keeps a negative, because a discount line can be one', () => {
    expect(num('-50')).toBe(-50);
  });
});
