import { MAS_PER_DEGREE, toMilliarcseconds } from './angles';
import { MAS_PER_NAKSHATRA } from './nakshatra';

// The standard birth details (the Avakhada chakra): classifications read from
// the Moon's sign, nakshatra and pada. Each is a fixed table; nothing here is
// computed beyond choosing a row. Where traditions differ, the table used is
// named and the variant recorded (ADR-091, Stage 2b).
//
//   varna    Moon sign. Muhurta Chintamani, Vivaha Prakarana: "द्विजा
//            झषालिकर्कटास्ततो नृपा विशोऽङ्घ्रिजाः" — Pisces, Scorpio, Cancer
//            Brahmin; the signs after each Kshatriya; then Vaishya; then
//            Shudra. (PyJHora swaps Vaishya and Shudra; not followed.)
//   vashya   Moon sign, with Sagittarius and Capricorn split at 15°:
//            Sagittarius human then quadruped, Capricorn quadruped then water.
//   yoni     Moon nakshatra: the animal only. The male/female of each pair
//            differs between sources (ProKerala makes both serpents female).
//   gana     Moon nakshatra.
//   nadi     Moon nakshatra: Adi, Madhya, Antya in the zig-zag order.
//   tatva    Moon sign's element.
//   syllable Moon nakshatra and pada: the Hoda Chakra of 27 nakshatras, which
//            gives Shravana खी खू खे खो (the 28-nakshatra form with Abhijit
//            differs). Devanagari is the reference; the Latin is a reading aid.

const ids = <T extends string>(...values: T[]) => values;

export const VARNAS = ids('brahmin', 'kshatriya', 'vaishya', 'shudra');
export const VASHYAS = ids('chatushpada', 'manava', 'jalachara', 'vanachara', 'keeta');
export const YONIS = ids('horse', 'elephant', 'sheep', 'serpent', 'dog', 'cat', 'rat', 'cow', 'buffalo', 'tiger', 'deer', 'monkey', 'mongoose', 'lion');
export const GANAS = ids('deva', 'manushya', 'rakshasa');
export const NADIS = ids('adi', 'madhya', 'antya');
export const TATVAS = ids('fire', 'earth', 'air', 'water');

export type Varna = (typeof VARNAS)[number];
export type Vashya = (typeof VASHYAS)[number];
export type Yoni = (typeof YONIS)[number];
export type Gana = (typeof GANAS)[number];
export type Nadi = (typeof NADIS)[number];
export type Tatva = (typeof TATVAS)[number];

const NAMES: Record<string, { name: string; english: string }> = {
  brahmin: { name: 'Brahmin', english: 'Brahmin' },
  kshatriya: { name: 'Kshatriya', english: 'Kshatriya' },
  vaishya: { name: 'Vaishya', english: 'Vaishya' },
  shudra: { name: 'Shudra', english: 'Shudra' },
  chatushpada: { name: 'Chatushpada', english: 'Quadruped' },
  manava: { name: 'Manava', english: 'Human' },
  jalachara: { name: 'Jalachara', english: 'Water-dwelling' },
  vanachara: { name: 'Vanachara', english: 'Wild' },
  keeta: { name: 'Keeta', english: 'Insect' },
  horse: { name: 'Ashva', english: 'Horse' },
  elephant: { name: 'Gaja', english: 'Elephant' },
  sheep: { name: 'Mesha', english: 'Sheep' },
  serpent: { name: 'Sarpa', english: 'Serpent' },
  dog: { name: 'Shvana', english: 'Dog' },
  cat: { name: 'Marjara', english: 'Cat' },
  rat: { name: 'Mushaka', english: 'Rat' },
  cow: { name: 'Gau', english: 'Cow' },
  buffalo: { name: 'Mahisha', english: 'Buffalo' },
  tiger: { name: 'Vyaghra', english: 'Tiger' },
  deer: { name: 'Mriga', english: 'Deer' },
  monkey: { name: 'Vanara', english: 'Monkey' },
  mongoose: { name: 'Nakula', english: 'Mongoose' },
  lion: { name: 'Simha', english: 'Lion' },
  deva: { name: 'Deva', english: 'Divine' },
  manushya: { name: 'Manushya', english: 'Human' },
  rakshasa: { name: 'Rakshasa', english: 'Demonic' },
  adi: { name: 'Adi', english: 'Vata' },
  madhya: { name: 'Madhya', english: 'Pitta' },
  antya: { name: 'Antya', english: 'Kapha' },
  fire: { name: 'Agni', english: 'Fire' },
  earth: { name: 'Prithvi', english: 'Earth' },
  air: { name: 'Vayu', english: 'Air' },
  water: { name: 'Jala', english: 'Water' },
};

// Indexed by sign, 0 = Aries.
const VARNA_BY_SIGN: Varna[] = ['kshatriya', 'vaishya', 'shudra', 'brahmin', 'kshatriya', 'vaishya', 'shudra', 'brahmin', 'kshatriya', 'vaishya', 'shudra', 'brahmin'];
/** [first 15°, last 15°]. Only Sagittarius and Capricorn change within the sign. */
const VASHYA_BY_SIGN: [Vashya, Vashya][] = [
  ['chatushpada', 'chatushpada'], ['chatushpada', 'chatushpada'], ['manava', 'manava'], ['jalachara', 'jalachara'],
  ['vanachara', 'vanachara'], ['manava', 'manava'], ['manava', 'manava'], ['keeta', 'keeta'],
  ['manava', 'chatushpada'], ['chatushpada', 'jalachara'], ['manava', 'manava'], ['jalachara', 'jalachara'],
];
const TATVA_BY_SIGN: Tatva[] = ['fire', 'earth', 'air', 'water', 'fire', 'earth', 'air', 'water', 'fire', 'earth', 'air', 'water'];

// Indexed by nakshatra, 0 = Ashwini.
const YONI_BY_NAKSHATRA: Yoni[] = [
  'horse', 'elephant', 'sheep', 'serpent', 'serpent', 'dog', 'cat', 'sheep', 'cat',
  'rat', 'rat', 'cow', 'buffalo', 'tiger', 'buffalo', 'tiger', 'deer', 'deer',
  'dog', 'monkey', 'mongoose', 'monkey', 'lion', 'horse', 'lion', 'cow', 'elephant',
];
const GANA_BY_NAKSHATRA: Gana[] = [
  'deva', 'manushya', 'rakshasa', 'manushya', 'deva', 'manushya', 'deva', 'deva', 'rakshasa',
  'rakshasa', 'manushya', 'manushya', 'deva', 'rakshasa', 'deva', 'rakshasa', 'deva', 'rakshasa',
  'rakshasa', 'manushya', 'manushya', 'deva', 'rakshasa', 'rakshasa', 'manushya', 'manushya', 'deva',
];
const NADI_BY_NAKSHATRA: Nadi[] = [
  'adi', 'madhya', 'antya', 'antya', 'madhya', 'adi', 'adi', 'madhya', 'antya',
  'antya', 'madhya', 'adi', 'adi', 'madhya', 'antya', 'antya', 'madhya', 'adi',
  'adi', 'madhya', 'antya', 'antya', 'madhya', 'adi', 'adi', 'madhya', 'antya',
];
/** Four per nakshatra, one per pada: [Devanagari, Latin]. */
const SYLLABLES: [string, string][][] = [
  [['चू', 'Chu'], ['चे', 'Che'], ['चो', 'Cho'], ['ला', 'La']],
  [['ली', 'Li'], ['लू', 'Lu'], ['ले', 'Le'], ['लो', 'Lo']],
  [['अ', 'A'], ['ई', 'I'], ['उ', 'U'], ['ए', 'E']],
  [['ओ', 'O'], ['वा', 'Va'], ['वी', 'Vi'], ['वू', 'Vu']],
  [['वे', 'Ve'], ['वो', 'Vo'], ['का', 'Ka'], ['की', 'Ki']],
  [['कू', 'Ku'], ['घ', 'Gha'], ['ङ', 'Nga'], ['छ', 'Chha']],
  [['के', 'Ke'], ['को', 'Ko'], ['हा', 'Ha'], ['ही', 'Hi']],
  [['हू', 'Hu'], ['हे', 'He'], ['हो', 'Ho'], ['डा', 'Da']],
  [['डी', 'Di'], ['डू', 'Du'], ['डे', 'De'], ['डो', 'Do']],
  [['मा', 'Ma'], ['मी', 'Mi'], ['मू', 'Mu'], ['मे', 'Me']],
  [['मो', 'Mo'], ['टा', 'Ta'], ['टी', 'Ti'], ['टू', 'Tu']],
  [['टे', 'Te'], ['टो', 'To'], ['पा', 'Pa'], ['पी', 'Pi']],
  [['पू', 'Pu'], ['ष', 'Sha'], ['ण', 'Na'], ['ठ', 'Tha']],
  [['पे', 'Pe'], ['पो', 'Po'], ['रा', 'Ra'], ['री', 'Ri']],
  [['रू', 'Ru'], ['रे', 'Re'], ['रो', 'Ro'], ['ता', 'Ta']],
  [['ती', 'Ti'], ['तू', 'Tu'], ['ते', 'Te'], ['तो', 'To']],
  [['ना', 'Na'], ['नी', 'Ni'], ['नू', 'Nu'], ['ने', 'Ne']],
  [['नो', 'No'], ['या', 'Ya'], ['यी', 'Yi'], ['यू', 'Yu']],
  [['ये', 'Ye'], ['यो', 'Yo'], ['भा', 'Bha'], ['भी', 'Bhi']],
  [['भू', 'Bhu'], ['धा', 'Dha'], ['फा', 'Pha'], ['ढा', 'Dha']],
  [['भे', 'Bhe'], ['भो', 'Bho'], ['जा', 'Ja'], ['जी', 'Ji']],
  [['खी', 'Khi'], ['खू', 'Khu'], ['खे', 'Khe'], ['खो', 'Kho']],
  [['गा', 'Ga'], ['गी', 'Gi'], ['गू', 'Gu'], ['गे', 'Ge']],
  [['गो', 'Go'], ['सा', 'Sa'], ['सी', 'Si'], ['सू', 'Su']],
  [['से', 'Se'], ['सो', 'So'], ['दा', 'Da'], ['दी', 'Di']],
  [['दू', 'Du'], ['थ', 'Tha'], ['झ', 'Jha'], ['ञ', 'Nya']],
  [['दे', 'De'], ['दो', 'Do'], ['चा', 'Cha'], ['ची', 'Chi']],
];

const MAS_PER_SIGN = 30 * MAS_PER_DEGREE;
const MAS_PER_PADA = MAS_PER_NAKSHATRA / 4;

const labelled = <T extends string>(id: T) => ({ id, ...NAMES[id]! });

export function avakhadaOf(moonLongitude: number) {
  const mas = toMilliarcseconds(moonLongitude);
  const sign = Math.floor(mas / MAS_PER_SIGN);
  const secondHalf = mas - sign * MAS_PER_SIGN >= MAS_PER_SIGN / 2;
  const nakshatra = Math.floor(mas / MAS_PER_NAKSHATRA);
  const pada = Math.floor((mas - nakshatra * MAS_PER_NAKSHATRA) / MAS_PER_PADA);
  const syllables = SYLLABLES[nakshatra]!.map(([devanagari, latin]) => ({ devanagari, latin }));
  return {
    varna: labelled(VARNA_BY_SIGN[sign]!),
    vashya: labelled(VASHYA_BY_SIGN[sign]![secondHalf ? 1 : 0]),
    yoni: labelled(YONI_BY_NAKSHATRA[nakshatra]!),
    gana: labelled(GANA_BY_NAKSHATRA[nakshatra]!),
    nadi: labelled(NADI_BY_NAKSHATRA[nakshatra]!),
    tatva: labelled(TATVA_BY_SIGN[sign]!),
    /** The syllable of the Moon's pada — the traditional first sound of a name. */
    nameSyllable: { pada: pada + 1, ...syllables[pada]! },
    nakshatraSyllables: syllables,
  };
}
