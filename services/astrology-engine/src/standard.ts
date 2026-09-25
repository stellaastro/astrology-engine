// Stella's own Jyotish conventions have a version of their own, separate from
// the engine's code and from Swiss Ephemeris. Bump it whenever a convention
// changes what a calculation returns — even if Swiss Ephemeris did not change:
// panchang rules, the karana mapping, vara handling, the sunrise definition,
// varga algorithms, dasha definitions, yoga or dosha rules.
//
// The golden snapshot test is keyed by this value: outputs that change without
// a bump fail it. Never regenerate an existing version's snapshot; bump instead.
//
// 1.0  2026-09-25  First standard.
// 1.1  2026-09-25  'true' positions mode (SEFLG_TRUEPOS) with its Lagna rule,
//                  so the engine can follow Jagannatha Hora's default settings
//                  (ADR-091). Production: true_citra, mean nodes, true positions.
export const CALCULATION_STANDARD_VERSION = 'stella-jyotish-1.1';
