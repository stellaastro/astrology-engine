import { normalize360 } from './angles';
import { rashiOf, type Graha } from './rashi';

// Dosha checks, as placements only. Each rule is named, and no cancellation
// (parihara) is applied: exceptions differ between traditions and are for
// the astrologer, not the engine (ADR-091, Stage 2d).

/**
 * Manglik (Kuja dosha): Mars in the 1st, 4th, 7th, 8th or 12th house, counted
 * as whole signs from the Lagna, from the Moon and from Venus. The five houses
 * are the classical verse "लग्ने व्यये च पाताले जामित्रे चाष्टमे कुजे"; southern
 * practice adds the 2nd, reported separately so it is never silently counted.
 */
export const MANGLIK_HOUSES = [1, 4, 7, 8, 12] as const;

const houseFrom = (body: number, reference: number) => ((rashiOf(body).signNumber - rashiOf(reference).signNumber + 12) % 12) + 1;

export function manglikOf(mars: number, references: { lagna: number; moon: number; venus: number }) {
  const from = (reference: number) => {
    const house = houseFrom(mars, reference);
    return { house, manglik: (MANGLIK_HOUSES as readonly number[]).includes(house), secondHouse: house === 2 };
  };
  const result = { fromLagna: from(references.lagna), fromMoon: from(references.moon), fromVenus: from(references.venus) };
  return { houses: [...MANGLIK_HOUSES], ...result, present: result.fromLagna.manglik || result.fromMoon.manglik };
}

// Kaal Sarp: all seven planets (Sun to Saturn) on one side of the Rahu–Ketu
// axis. Decided BY LONGITUDE. Many programs decide it by sign instead — a
// planet in Rahu's or Ketu's own sign counts as enclosed whichever side of the
// axis it lies (ProKerala does, 27 of 27 cases) — so that answer is given too,
// never silently swapped in. Its twelve names follow Rahu's house from the Lagna.
const KAAL_SARP_TYPES = ['Anant', 'Kulik', 'Vasuki', 'Shankhpal', 'Padma', 'Mahapadma', 'Takshak', 'Karkotak', 'Shankhachud', 'Ghatak', 'Vishdhar', 'Sheshnag'];
const SEVEN: Graha[] = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn'];
type Hemmed = 'rahu_to_ketu' | 'ketu_to_rahu' | null;

export function kaalSarpOf(longitudes: Record<Graha, number>, lagna: number) {
  const rahu = longitudes.rahu;
  // 0 < d < 180: the planet lies on the arc from Rahu forward to Ketu.
  const side = (id: Graha) => normalize360(longitudes[id] - rahu) < 180;
  const ahead = SEVEN.filter(side);
  const hemmed: Hemmed = ahead.length === 7 ? 'rahu_to_ketu' : ahead.length === 0 ? 'ketu_to_rahu' : null;
  // By sign: houses 2–6 from Rahu's sign are Rahu→Ketu, 8–12 Ketu→Rahu; Rahu's
  // and Ketu's own signs (1 and 7) belong to either side.
  const arc = (id: Graha) => houseFrom(longitudes[id], rahu);
  const bySign: Hemmed = SEVEN.every((id) => arc(id) <= 7) ? 'rahu_to_ketu' : SEVEN.every((id) => arc(id) === 1 || arc(id) >= 7) ? 'ketu_to_rahu' : null;
  const rahuHouse = houseFrom(rahu, lagna);
  return {
    present: hemmed !== null,
    hemmed,
    bySign: { present: bySign !== null, hemmed: bySign },
    type: hemmed || bySign ? KAAL_SARP_TYPES[rahuHouse - 1]! : null,
    rahuHouse,
    /** The planets on the other side of the axis, by longitude; empty when present. */
    outside: hemmed ? [] : (ahead.length > 3 ? SEVEN.filter((id) => !side(id)) : ahead),
  };
}
