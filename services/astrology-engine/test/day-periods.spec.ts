import { describe, expect, it } from 'vitest';
import { dayPeriods, type DayPeriod } from '../src/jyotish/day-periods';

// A day worked by hand: sunrise 06:00, sunset 18:00, and a twelve-hour night on
// either side, so an eighth of the day is 90 minutes and a muhurta 48.
const BASE = 2461000.5; // a midnight; only the differences matter
const at = (hours: number, minutes = 0) => BASE + (hours * 60 + minutes) / 1440;
const clock = (jd: number) => {
  const m = Math.round((jd - BASE) * 1440);
  const h = Math.floor(m / 60);
  return `${String(((h % 24) + 24) % 24).padStart(2, '0')}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`;
};
const day = (weekday: number) => dayPeriods({ weekday, sunriseJd: at(6), sunsetJd: at(18), nextSunriseJd: at(30), previousSunsetJd: at(-6) });
const span = (p: DayPeriod) => `${clock(p.startJd)}-${clock(p.endJd)}`;
const find = (periods: DayPeriod[], id: DayPeriod['id']) => periods.filter((p) => p.id === id).map(span);

describe('the day\'s periods on a 06:00 to 18:00 day', () => {
  it('Rahu Kaal starts at the classical times: Mon 7:30, Sat 9:00, Fri 10:30, Wed 12:00, Thu 13:30, Tue 15:00, Sun 16:30', () => {
    const starts = [0, 1, 2, 3, 4, 5, 6].map((w) => find(day(w), 'rahu_kaal')[0]);
    expect(starts).toEqual(['16:30-18:00', '07:30-09:00', '15:00-16:30', '12:00-13:30', '13:30-15:00', '10:30-12:00', '09:00-10:30']);
  });

  it('Yamaganda and Gulika Kaal follow their own weekday tables', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((w) => find(day(w), 'yamaganda')[0]))
      .toEqual(['12:00-13:30', '10:30-12:00', '09:00-10:30', '07:30-09:00', '06:00-07:30', '15:00-16:30', '13:30-15:00']);
    expect([0, 1, 2, 3, 4, 5, 6].map((w) => find(day(w), 'gulika_kaal')[0]))
      .toEqual(['15:00-16:30', '13:30-15:00', '12:00-13:30', '10:30-12:00', '09:00-10:30', '07:30-09:00', '06:00-07:30']);
  });

  it('Abhijit Muhurta is the 8th of 15, centred on midday; on a Wednesday the exception is named, not applied', () => {
    const monday = day(1).find((p) => p.id === 'abhijit_muhurta')!;
    expect(span(monday)).toBe('11:36-12:24');
    expect(monday.nature).toBe('auspicious');
    expect(monday.note).toBeUndefined();
    const wednesday = day(3).find((p) => p.id === 'abhijit_muhurta')!;
    expect(span(wednesday)).toBe('11:36-12:24');
    expect(wednesday.note).toMatch(/Wednesday/);
    // It is that day's Dur Muhurtam too, which is why.
    expect(find(day(3), 'dur_muhurtam')).toEqual(['11:36-12:24']);
  });

  it('Brahma Muhurta is the 14th of the night\'s 15 muhurtas, ending one muhurta before sunrise', () => {
    expect(find(day(1), 'brahma_muhurta')).toEqual(['04:24-05:12']);
  });

  it('Dur Muhurtam by weekday, with Tuesday\'s second in the night', () => {
    expect(find(day(0), 'dur_muhurtam')).toEqual(['16:24-17:12']);
    expect(find(day(1), 'dur_muhurtam')).toEqual(['12:24-13:12', '14:48-15:36']);
    expect(find(day(2), 'dur_muhurtam')).toEqual(['08:24-09:12', '22:48-23:36']);
    expect(find(day(4), 'dur_muhurtam')).toEqual(['10:00-10:48', '14:48-15:36']);
    expect(find(day(5), 'dur_muhurtam')).toEqual(['08:24-09:12', '12:24-13:12']);
    expect(find(day(6), 'dur_muhurtam')).toEqual(['06:00-06:48', '06:48-07:36']);
  });

  it('every period is listed in the order it begins', () => {
    for (let w = 0; w < 7; w++) {
      const starts = day(w).map((p) => p.startJd);
      expect(starts).toEqual([...starts].sort((a, b) => a - b));
    }
  });
});

describe('days the Sun does not divide normally', () => {
  it('a longer day stretches every share: sunrise 05:30, sunset 19:30 gives a Monday Rahu Kaal of 07:15 to 09:00', () => {
    const periods = dayPeriods({ weekday: 1, sunriseJd: at(5, 30), sunsetJd: at(19, 30), nextSunriseJd: at(29, 30), previousSunsetJd: at(-4, -30) });
    expect(find(periods, 'rahu_kaal')).toEqual(['07:15-09:00']);
  });

  it('no sunset: nothing that divides the daytime is drawn, and nothing is invented', () => {
    const periods = dayPeriods({ weekday: 1, sunriseJd: at(6), sunsetJd: null, nextSunriseJd: at(30), previousSunsetJd: at(-6) });
    expect(periods.map((p) => p.id)).toEqual(['brahma_muhurta']);
  });

  it('no sunset the evening before: no Brahma Muhurta', () => {
    const periods = dayPeriods({ weekday: 1, sunriseJd: at(6), sunsetJd: at(18), nextSunriseJd: at(30), previousSunsetJd: null });
    expect(periods.some((p) => p.id === 'brahma_muhurta')).toBe(false);
    expect(periods.some((p) => p.id === 'rahu_kaal')).toBe(true);
  });
});
