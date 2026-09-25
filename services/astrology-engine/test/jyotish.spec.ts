import { describe, expect, it } from 'vitest';
import { nakshatraOf, NAKSHATRAS } from '../src/jyotish/nakshatra';
import { elongation, karanaOf, tithiOf, varaOf, weekdayOf, yogaAngle, yogaOf } from '../src/jyotish/panchang';
import { rashiOf, wholeSignHouse } from '../src/jyotish/rashi';

const ARCSEC = 1 / 3600;

describe('rashi', () => {
  it('puts 29°59′59″ in the sign it is in, and 30° in the next', () => {
    expect(rashiOf(30 - ARCSEC).sign).toBe('Aries');
    expect(rashiOf(30 - ARCSEC).degreeInSign).toBeCloseTo(30 - ARCSEC, 9);
    expect(rashiOf(30).sign).toBe('Taurus');
    expect(rashiOf(30).degreeInSign).toBe(0);
  });
  it('wraps 360° to Aries and keeps 359°59′59″ in Pisces', () => {
    expect(rashiOf(360 - ARCSEC).sign).toBe('Pisces');
    expect(rashiOf(360).sign).toBe('Aries');
    expect(rashiOf(0).signNumber).toBe(1);
    expect(rashiOf(-ARCSEC).sign).toBe('Pisces');
  });
  it('names the sign lord', () => {
    expect(rashiOf(128.456)).toMatchObject({ sign: 'Leo', rashi: 'Simha', signLord: 'sun', signNumber: 5 });
    expect(rashiOf(128.456).degreeInSign).toBeCloseTo(8.456, 9);
  });
});

describe('whole-sign houses', () => {
  it('counts houses from the Ascendant\'s SIGN, not its degree', () => {
    // Ascendant late in Leo: a planet early in Leo, BEFORE the Ascendant degree, is still house 1.
    expect(wholeSignHouse(121, 148)).toBe(1);
    expect(wholeSignHouse(150, 148)).toBe(2);
    expect(wholeSignHouse(119.9, 148)).toBe(12);
    expect(wholeSignHouse(0, 359)).toBe(2);
  });
});

describe('nakshatra and pada', () => {
  const NAK = 40 / 3;
  it('changes nakshatra exactly at each 13°20′ boundary', () => {
    for (let k = 1; k < 27; k++) {
      expect(nakshatraOf(k * NAK - ARCSEC).number).toBe(k);
      expect(nakshatraOf(k * NAK).number).toBe(k + 1);
      expect(nakshatraOf(k * NAK).pada).toBe(1);
      expect(nakshatraOf(k * NAK - ARCSEC).pada).toBe(4);
    }
  });
  it('changes pada exactly at each 3°20′ boundary', () => {
    for (let p = 1; p < 4; p++) {
      expect(nakshatraOf(p * (NAK / 4) - ARCSEC).pada).toBe(p);
      expect(nakshatraOf(p * (NAK / 4)).pada).toBe(p + 1);
    }
  });
  it('wraps Revati pada 4 to Ashwini pada 1 at 360°', () => {
    expect(nakshatraOf(360 - ARCSEC)).toMatchObject({ name: 'Revati', pada: 4, lord: 'mercury', number: 27 });
    expect(nakshatraOf(360)).toMatchObject({ name: 'Ashwini', pada: 1, lord: 'ketu', number: 1 });
  });
  it('follows the Vimshottari lord order three times round', () => {
    expect(NAKSHATRAS).toHaveLength(27);
    expect(nakshatraOf(NAK * 18 + 1).lord).toBe('ketu'); // Mula
    expect(nakshatraOf(NAK * 15 + 1).lord).toBe('jupiter'); // Vishakha
  });
});

describe('tithi', () => {
  it('runs 1–15 Shukla to Purnima, then 16–30 Krishna to Amavasya', () => {
    expect(tithiOf(0)).toEqual({ number: 1, name: 'Pratipada', paksha: 'shukla' });
    expect(tithiOf(12 - ARCSEC).number).toBe(1);
    expect(tithiOf(12).number).toBe(2);
    expect(tithiOf(180 - ARCSEC)).toEqual({ number: 15, name: 'Purnima', paksha: 'shukla' });
    expect(tithiOf(180)).toEqual({ number: 16, name: 'Pratipada', paksha: 'krishna' });
    expect(tithiOf(360 - ARCSEC)).toEqual({ number: 30, name: 'Amavasya', paksha: 'krishna' });
    expect(tithiOf(360).number).toBe(1);
  });
  it('does not depend on the ayanamsa', () => {
    expect(elongation(100, 110)).toBeCloseTo(elongation(100 - 24, 110 - 24), 12);
    expect(elongation(355, 5)).toBeCloseTo(10, 12);
  });
});

describe('karana', () => {
  it('is Kimstughna, eight cycles of the seven movable karanas, then Shakuni, Chatushpada, Naga', () => {
    const names = Array.from({ length: 60 }, (_, i) => karanaOf(i * 6 + 3).name);
    expect(names[0]).toBe('Kimstughna');
    expect(names.slice(1, 8)).toEqual(['Bava', 'Balava', 'Kaulava', 'Taitila', 'Garaja', 'Vanija', 'Vishti']);
    expect(names.slice(50, 57)).toEqual(['Bava', 'Balava', 'Kaulava', 'Taitila', 'Garaja', 'Vanija', 'Vishti']);
    expect(names.slice(57)).toEqual(['Shakuni', 'Chatushpada', 'Naga']);
    expect(names.filter((n) => n === 'Vishti')).toHaveLength(8);
    expect(karanaOf(0).kind).toBe('fixed');
    expect(karanaOf(10).kind).toBe('movable');
  });
  it('wraps Naga to Kimstughna at the new moon', () => {
    expect(karanaOf(360 - ARCSEC).name).toBe('Naga');
    expect(karanaOf(360).name).toBe('Kimstughna');
  });
});

describe('yoga', () => {
  it('divides sidereal Sun + Moon into 27 and wraps Vaidhriti to Vishkambha', () => {
    expect(yogaOf(0)).toEqual({ number: 1, name: 'Vishkambha' });
    expect(yogaOf(360 - ARCSEC)).toEqual({ number: 27, name: 'Vaidhriti' });
    expect(yogaOf(yogaAngle(200, 170)).number).toBe(1);
  });
});

describe('vara', () => {
  it('knows the weekday of fixed dates', () => {
    expect(varaOf(weekdayOf(2000, 1, 1)).english).toBe('Saturday');
    expect(varaOf(weekdayOf(1972, 4, 5)).english).toBe('Wednesday');
    expect(varaOf(weekdayOf(2026, 9, 25)).english).toBe('Friday');
    expect(varaOf(weekdayOf(1801, 1, 1)).english).toBe('Thursday');
    // The Gregorian calendar repeats every 400 years: same weekday as 1998-12-31.
    expect(varaOf(weekdayOf(2398, 12, 31)).english).toBe('Thursday');
  });
  it('steps back from Sunday to Saturday', () => {
    expect(varaOf(-1)).toMatchObject({ name: 'Shanivara', english: 'Saturday' });
  });
});
