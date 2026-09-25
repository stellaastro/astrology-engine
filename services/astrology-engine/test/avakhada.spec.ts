import { describe, expect, it } from 'vitest';
import { avakhadaOf } from '../src/jyotish/avakhada';

const NAKSHATRA = 40 / 3; // 13°20′
const PADA = NAKSHATRA / 4;
const MAS = 1 / 3_600_000;
/** A longitude in the middle of a nakshatra (1-based) and pada (1-based). */
const at = (nakshatra: number, pada = 1) => (nakshatra - 1) * NAKSHATRA + (pada - 0.5) * PADA;

describe('standard birth details: the tables', () => {
  // A second, independent encoding: the index arrays of PyJHora's
  // horoscope/match/compatibility.py (yoni_mappings, _find_gana, the naadi
  // bvk list), so a mistyped row in either shows up here.
  const PYJHORA_YONI = ['horse', 'elephant', 'sheep', 'serpent', 'dog', 'cat', 'rat', 'cow', 'buffalo', 'tiger', 'deer', 'monkey', 'mongoose', 'lion'];
  const yoniMappings = [0, 1, 2, 3, 3, 4, 5, 2, 5, 6, 6, 7, 8, 9, 8, 9, 10, 10, 4, 11, 12, 11, 13, 0, 13, 7, 1];
  const deva = [0, 4, 6, 7, 12, 14, 16, 21, 26];
  const manushya = [1, 3, 5, 10, 11, 19, 20, 24, 25];
  const nadi = [0, 1, 2, 2, 1, 0, 0, 1, 2, 2, 1, 0, 0, 1, 2, 2, 1, 0, 0, 1, 2, 2, 1, 0, 0, 1, 2];

  it.each(Array.from({ length: 27 }, (_, i) => i))('nakshatra %i: yoni, gana and nadi agree with the independent encoding', (i) => {
    for (let pada = 1; pada <= 4; pada++) {
      const a = avakhadaOf(at(i + 1, pada));
      expect(a.yoni.id).toBe(PYJHORA_YONI[yoniMappings[i]!]);
      expect(a.gana.id).toBe(deva.includes(i) ? 'deva' : manushya.includes(i) ? 'manushya' : 'rakshasa');
      expect(a.nadi.id).toBe(['adi', 'madhya', 'antya'][nadi[i]!]);
      expect(a.nameSyllable.pada).toBe(pada);
      expect(a.nakshatraSyllables).toHaveLength(4);
      expect(a.nameSyllable.devanagari).toBe(a.nakshatraSyllables[pada - 1]!.devanagari);
    }
  });

  it('varna follows the element of the Moon sign (Muhurta Chintamani)', () => {
    const byElement = { fire: 'kshatriya', earth: 'vaishya', air: 'shudra', water: 'brahmin' } as const;
    for (let sign = 0; sign < 12; sign++) {
      const a = avakhadaOf(sign * 30 + 7);
      expect(a.tatva.id).toBe(['fire', 'earth', 'air', 'water'][sign % 4]);
      expect(a.varna.id).toBe(byElement[a.tatva.id]);
    }
  });

  it('vashya by sign, with Sagittarius and Capricorn changing exactly at 15°', () => {
    const whole = ['chatushpada', 'chatushpada', 'manava', 'jalachara', 'vanachara', 'manava', 'manava', 'keeta', null, null, 'manava', 'jalachara'];
    whole.forEach((v, sign) => {
      if (v) for (const d of [0, 14.9, 15, 29.9]) expect(avakhadaOf(sign * 30 + d).vashya.id).toBe(v);
    });
    expect(avakhadaOf(255 - MAS).vashya.id).toBe('manava'); // Sagittarius 14°59′59.999″
    expect(avakhadaOf(255).vashya.id).toBe('chatushpada');
    expect(avakhadaOf(285 - MAS).vashya.id).toBe('chatushpada'); // Capricorn
    expect(avakhadaOf(285).vashya.id).toBe('jalachara');
  });

  it('the name syllable changes exactly at a pada boundary', () => {
    // Swati pada 3 → 4 (ProKerala's Delhi 2000-01-01 case: Swati 4, "Ru, Re, Ro, Taa").
    const boundary = 14 * NAKSHATRA + 3 * PADA;
    expect(avakhadaOf(boundary - MAS).nameSyllable).toEqual({ pada: 3, devanagari: 'रो', latin: 'Ro' });
    expect(avakhadaOf(boundary).nameSyllable).toEqual({ pada: 4, devanagari: 'ता', latin: 'Ta' });
    expect(avakhadaOf(at(15)).nakshatraSyllables.map((s) => s.latin)).toEqual(['Ru', 'Re', 'Ro', 'Ta']);
  });

  it('wraps: 359.999…° is Revati pada 4 and 360° is Ashwini pada 1', () => {
    expect(avakhadaOf(360 - MAS)).toMatchObject({ nameSyllable: { pada: 4, devanagari: 'ची' }, yoni: { id: 'elephant' }, vashya: { id: 'jalachara' } });
    expect(avakhadaOf(360)).toMatchObject({ nameSyllable: { pada: 1, devanagari: 'चू' }, yoni: { id: 'horse' }, vashya: { id: 'chatushpada' } });
  });

  it('every label carries its traditional and English name', () => {
    const a = avakhadaOf(at(15, 4));
    expect(a.yoni).toEqual({ id: 'buffalo', name: 'Mahisha', english: 'Buffalo' });
    expect(a.gana).toEqual({ id: 'deva', name: 'Deva', english: 'Divine' });
    expect(a.nadi).toEqual({ id: 'antya', name: 'Antya', english: 'Kapha' });
    expect(a.varna).toEqual({ id: 'shudra', name: 'Shudra', english: 'Shudra' });
    expect(a.vashya).toEqual({ id: 'manava', name: 'Manava', english: 'Human' });
    expect(a.tatva).toEqual({ id: 'air', name: 'Vayu', english: 'Air' });
  });
});
