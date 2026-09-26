// The day's traditional periods (standard 1.8): each a fixed share of the
// daytime (sunrise to sunset) or of the night, chosen by the weekday. Pure
// arithmetic on the sunrise and sunset the engine already computes, so they
// follow its sunrise setting (the centre of the disc, as Jagannatha Hora).
//
//   Rahu Kaal, Yamaganda, Gulika Kaal
//                 one eighth of the daytime each; the weekday picks which.
//   Dur Muhurtam  one or two of the day's 15 muhurtas (on a Tuesday, one of
//                 them is a muhurta of the night); the weekday picks which.
//   Abhijit Muhurta
//                 the 8th of the day's 15 muhurtas, centred on midday.
//                 Tradition does not use it on a Wednesday, when it is also
//                 that day's Dur Muhurtam: NAMED, NEVER APPLIED, like every
//                 other exception on Stella's pages.
//   Brahma Muhurta
//                 the 14th of the 15 muhurtas of the night that ends at this
//                 sunrise, so it ends one night-muhurta before sunrise.

export type DayPeriodId = 'rahu_kaal' | 'yamaganda' | 'gulika_kaal' | 'dur_muhurtam' | 'abhijit_muhurta' | 'brahma_muhurta';

export interface DayPeriod {
  id: DayPeriodId;
  name: string;
  nature: 'auspicious' | 'inauspicious';
  /** Which share it is: the `number`th of `of` equal parts of the daytime or the night. */
  part: { of: 8 | 15; number: number; basis: 'day' | 'night' };
  startJd: number;
  endJd: number;
  /** A traditional exception that applies today, named and not applied. */
  note?: string;
}

/** Which eighth of the daytime, Sunday first. */
const RAHU_KAAL = [8, 2, 7, 5, 6, 4, 3];
const YAMAGANDA = [5, 4, 3, 2, 1, 7, 6];
const GULIKA_KAAL = [7, 6, 5, 4, 3, 2, 1];

/** Dur Muhurtam, Sunday first: the day's muhurtas, then the night's (1 to 15). */
const DUR_MUHURTAM: [day: number[], night: number[]][] = [
  [[14], []],
  [[9, 12], []],
  [[4], [7]],
  [[8], []],
  [[6, 12], []],
  [[4, 9], []],
  [[1, 2], []],
];

const WEDNESDAY = 3;

export interface DayBounds {
  /** 0 = Sunday … 6 = Saturday: the weekday of the civil date whose sunrise starts this Hindu day. */
  weekday: number;
  sunriseJd: number;
  /** Null where the Sun does not set that day. */
  sunsetJd: number | null;
  nextSunriseJd: number;
  /** The sunset before this sunrise; null where there was none. */
  previousSunsetJd: number | null;
}

function share(from: number, to: number, of: 8 | 15, number: number) {
  const length = (to - from) / of;
  return { startJd: from + (number - 1) * length, endJd: from + number * length };
}

/** The periods that can be drawn for this day, in order of their start. */
export function dayPeriods({ weekday, sunriseJd, sunsetJd, nextSunriseJd, previousSunsetJd }: DayBounds): DayPeriod[] {
  const w = ((weekday % 7) + 7) % 7;
  const periods: DayPeriod[] = [];

  if (previousSunsetJd !== null && previousSunsetJd < sunriseJd) {
    periods.push({
      id: 'brahma_muhurta', name: 'Brahma Muhurta', nature: 'auspicious',
      part: { of: 15, number: 14, basis: 'night' }, ...share(previousSunsetJd, sunriseJd, 15, 14),
    });
  }

  if (sunsetJd !== null && sunsetJd > sunriseJd) {
    const eighth = (id: DayPeriodId, name: string, number: number): DayPeriod => ({
      id, name, nature: 'inauspicious', part: { of: 8, number, basis: 'day' }, ...share(sunriseJd, sunsetJd, 8, number),
    });
    periods.push(eighth('rahu_kaal', 'Rahu Kaal', RAHU_KAAL[w]!));
    periods.push(eighth('yamaganda', 'Yamaganda', YAMAGANDA[w]!));
    periods.push(eighth('gulika_kaal', 'Gulika Kaal', GULIKA_KAAL[w]!));

    periods.push({
      id: 'abhijit_muhurta', name: 'Abhijit Muhurta', nature: 'auspicious',
      part: { of: 15, number: 8, basis: 'day' }, ...share(sunriseJd, sunsetJd, 15, 8),
      ...(w === WEDNESDAY ? { note: 'Tradition does not use Abhijit Muhurta on a Wednesday, when it is also the Dur Muhurtam.' } : {}),
    });

    const [day, night] = DUR_MUHURTAM[w]!;
    for (const number of day) {
      periods.push({ id: 'dur_muhurtam', name: 'Dur Muhurtam', nature: 'inauspicious', part: { of: 15, number, basis: 'day' }, ...share(sunriseJd, sunsetJd, 15, number) });
    }
    if (nextSunriseJd > sunsetJd) {
      for (const number of night) {
        periods.push({ id: 'dur_muhurtam', name: 'Dur Muhurtam', nature: 'inauspicious', part: { of: 15, number, basis: 'night' }, ...share(sunsetJd, nextSunriseJd, 15, number) });
      }
    }
  }

  return periods.sort((a, b) => a.startJd - b.startJd);
}
