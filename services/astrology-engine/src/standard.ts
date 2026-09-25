// Stella's own Jyotish conventions have a version of their own, separate from
// the engine's code and from Swiss Ephemeris. Bump it whenever a convention
// changes what a calculation returns — even if Swiss Ephemeris did not change:
// panchang rules, the karana mapping, vara handling, the sunrise definition,
// varga algorithms, dasha definitions, yoga or dosha rules.
//
// The golden snapshot test is keyed by this value: outputs that change without
// a bump fail it. Never regenerate an existing version's snapshot; bump instead.
export const CALCULATION_STANDARD_VERSION = 'stella-jyotish-1.0';
