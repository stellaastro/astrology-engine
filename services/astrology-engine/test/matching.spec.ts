import { describe, expect, it } from 'vitest';
import { ashtakoota, relationOf } from '../src/jyotish/matching';

// Longitudes placed in the middle of a nakshatra (13°20′ each), so no case
// sits near a boundary: nakshatra n (1-based) spans (n−1)·13.333…° onwards.
const mid = (nakshatra: number, offset = 6.5) => (nakshatra - 1) * (40 / 3) + offset;
const byId = (r: ReturnType<typeof ashtakoota>) => Object.fromEntries(r.kootas.map((k) => [k.id, k.points]));

describe('Ashtakoota, worked by hand', () => {
  it('bride Moon in Ashwini (Aries), groom Moon in Rohini (Taurus): 22½ of 36', () => {
    // Varna: groom Vaishya below bride Kshatriya, 0. Vashya: both quadruped, 2.
    // Tara: Ashwini→Rohini counts 4 (Kshema, good); Rohini→Ashwini counts 25,
    // remainder 7 (Naidhana, bad): 1½. Yoni: horse and serpent, 3. Maitri: Mars
    // and Venus neutral both ways, 3. Gana: groom Manushya, bride Deva, 5.
    // Bhakoot: Aries to Taurus is 2/12, dosha, 0. Nadi: Adi and Antya, 8.
    // ProKerala's advanced matching gives exactly these eight numbers.
    const r = ashtakoota(mid(1), mid(4));
    expect(byId(r)).toEqual({ varna: 0, vashya: 2, tara: 1.5, yoni: 3, maitri: 3, gana: 5, bhakoot: 0, nadi: 8 });
    expect(r.total).toBe(22.5);
    expect(r.max).toBe(36);
    expect(r.doshas).toEqual({ nadi: false, bhakoot: true });
  });

  it('the total is always the sum of the eight kootas, within 0 to 36', () => {
    for (let b = 1; b <= 27; b += 2) {
      for (let g = 1; g <= 27; g += 3) {
        const r = ashtakoota(mid(b), mid(g));
        expect(r.total).toBe(r.kootas.reduce((s, k) => s + k.points, 0));
        expect(r.total).toBeGreaterThanOrEqual(0);
        expect(r.total).toBeLessThanOrEqual(36);
        for (const k of r.kootas) expect(k.points).toBeLessThanOrEqual(k.max);
      }
    }
  });
});

describe('the tables', () => {
  it('yoni: the same animal scores 4, and the seven sworn enemies 0, whichever is the bride', () => {
    // Nakshatras by yoni: horse Ashwini(1), buffalo Hasta(13), elephant Bharani(2),
    // lion Dhanishta(23), sheep Krittika(3), monkey Purva Ashadha(20), serpent
    // Rohini(4), mongoose Uttara Ashadha(21), dog Ardra(6), deer Anuradha(17),
    // cat Punarvasu(7), rat Magha(10), cow Uttara Phalguni(12), tiger Chitra(14).
    const enemies: [number, number][] = [[1, 13], [2, 23], [3, 20], [4, 21], [6, 17], [7, 10], [12, 14]];
    for (const [a, b] of enemies) {
      expect(byId(ashtakoota(mid(a), mid(b))).yoni).toBe(0);
      expect(byId(ashtakoota(mid(b), mid(a))).yoni).toBe(0);
    }
    expect(byId(ashtakoota(mid(1), mid(24))).yoni).toBe(4); // Ashwini and Shatabhisha: both horse
  });

  it('natural friendship follows Parashara, and is not always mutual', () => {
    expect(relationOf('sun', 'moon')).toBe('friend');
    expect(relationOf('moon', 'mercury')).toBe('friend');
    expect(relationOf('mercury', 'moon')).toBe('enemy');
    expect(relationOf('jupiter', 'saturn')).toBe('neutral');
    expect(relationOf('saturn', 'jupiter')).toBe('neutral');
    expect(relationOf('venus', 'sun')).toBe('enemy');
  });

  it('graha maitri: the same lord scores 5, mutual enemies 0', () => {
    // Aries (Mars) and Scorpio (Mars): same lord. Magha (Leo, Sun) with Shatabhisha (Aquarius, Saturn): enemies both ways.
    expect(byId(ashtakoota(mid(1), mid(18))).maitri).toBe(5);
    expect(byId(ashtakoota(mid(10), mid(24))).maitri).toBe(0);
  });

  it('gana is directional: a Manushya groom with a Deva bride scores 5, the reverse 6', () => {
    // Ashwini is Deva, Bharani Manushya, Krittika Rakshasa.
    expect(byId(ashtakoota(mid(1), mid(2))).gana).toBe(5);
    expect(byId(ashtakoota(mid(2), mid(1))).gana).toBe(6);
    // A Rakshasa groom with a Deva bride scores 1; a Deva groom with a Rakshasa bride 0.
    expect(byId(ashtakoota(mid(1), mid(3))).gana).toBe(1);
    expect(byId(ashtakoota(mid(3), mid(1))).gana).toBe(0);
    expect(byId(ashtakoota(mid(2), mid(3))).gana).toBe(0);
  });

  it('vashya: a predator and its prey score 0', () => {
    // Magha is in Leo (wild), Ashwini in Aries (quadruped): 0 whichever is the groom.
    expect(byId(ashtakoota(mid(1), mid(10))).vashya).toBe(0);
    expect(byId(ashtakoota(mid(10), mid(1))).vashya).toBe(0);
    // A human groom (Aquarius, Shatabhisha) with a Scorpio bride (Anuradha): 0; the reverse 1.
    expect(byId(ashtakoota(mid(17), mid(24))).vashya).toBe(0);
    expect(byId(ashtakoota(mid(24), mid(17))).vashya).toBe(1);
  });

  it('bhakoot: 2/12, 5/9 and 6/8 are the dosha; every other distance scores 7', () => {
    // Moon in the middle of each sign: 15° + 30°·(sign − 1), kept clear of nakshatra edges by the tables' own reading.
    const sign = (n: number) => (n - 1) * 30 + 15;
    const pointsFor = (distance: number) => byId(ashtakoota(sign(1), sign(distance))).bhakoot;
    for (const d of [1, 3, 4, 7, 10, 11]) expect(pointsFor(d)).toBe(7);
    for (const d of [2, 5, 6, 8, 9, 12]) expect(pointsFor(d)).toBe(0);
  });

  it('nadi: the same nadi is the dosha, 0 of 8', () => {
    // Ashwini and Ardra are both Adi.
    const r = ashtakoota(mid(1), mid(6));
    expect(byId(r).nadi).toBe(0);
    expect(r.doshas.nadi).toBe(true);
  });
});

describe('exceptions are named, never applied', () => {
  it('Nadi dosha with both Moons in one sign but different nakshatras is named, and still scores 0', () => {
    // Krittika's last three padas are in Taurus (30°–40°), as is Rohini. Both are Antya nadi.
    const r = ashtakoota(32, 45);
    expect(r.doshas.nadi).toBe(true);
    expect(byId(r).nadi).toBe(0);
    expect(r.exceptions).toContainEqual({ dosha: 'nadi', rule: 'Both Moons are in the same sign but in different nakshatras.' });
  });

  it('Bhakoot dosha with signs of the same lord is named, and still scores 0', () => {
    // Aries and Scorpio: 6/8 apart, both ruled by Mars.
    const r = ashtakoota(15, 7 * 30 + 15);
    expect(r.doshas.bhakoot).toBe(true);
    expect(byId(r).bhakoot).toBe(0);
    expect(r.exceptions).toContainEqual({ dosha: 'bhakoot', rule: 'Both Moon signs have the same lord.' });
  });

  it('no exception is listed when there is no dosha', () => {
    expect(ashtakoota(mid(1), mid(8)).exceptions.filter((e) => e.dosha === 'nadi')).toEqual([]);
  });
});
