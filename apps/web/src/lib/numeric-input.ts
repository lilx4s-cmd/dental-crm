// Money and other numeric fields are held as text in editor components and converted on submit.
// A controlled number input backed by `number` can never be emptied — clearing it parses to NaN,
// falls back to 0, and the field immediately refills with "0", so typing a price appends after
// that zero. It also swallows the decimal point: "12." parses to 12 and is written straight back,
// so the separator can never be typed. Both were reported from the clinic ("i can not type the
// amount", "puts 0 before the number").

/** Reads a numeric form field, treating blank or half-typed input as `fallback`. */
export function num(value: string, fallback = 0): number {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
