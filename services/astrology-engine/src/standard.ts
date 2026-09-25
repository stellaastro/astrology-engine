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
// 1.2  2026-09-25  Moonrise and moonset: the Moon's centre on the true horizon
//                  WITH its latitude (SE_BIT_DISC_CENTER|SE_BIT_NO_REFRACTION),
//                  not SE_BIT_HINDU_RISING, which ignores it (ADR-091).
// 1.3  2026-09-25  Navamsa (D9), and Vimshottari dasha from the Moon to three
//                  levels in true sidereal solar years (ADR-091).
// 1.4  2026-09-25  Standard birth details from the Moon: varna, vashya, yoni,
//                  gana, nadi, tatva and the name syllable (ADR-091).
// 1.5  2026-09-25  The sixteen Parashari divisional charts, D1 to D60, with
//                  the Parashara (Cancer-Leo) hora for D2 (ADR-091).
export const CALCULATION_STANDARD_VERSION = 'stella-jyotish-1.5';
