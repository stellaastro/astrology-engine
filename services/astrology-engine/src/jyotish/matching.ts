import { avakhadaOf, type Gana, type Vashya, type Yoni } from './avakhada';
import { nakshatraOf } from './nakshatra';
import { rashiOf, type Graha } from './rashi';

// Kundli Matching: Ashtakoota, the eight-koota Guna Milan of 36 points
// (owner decision, 2026-09-26; ADR-091). Everything is read from the two Moons,
// through the same birth-detail tables as the Kundli (avakhada.ts), so a
// person's varna, vashya, yoni, gana and nadi are identical in their Kundli and
// in a match.
//
// Direction matters in three kootas, as in the texts: Varna and Vashya compare
// the groom's with the bride's, and Tara counts from each to the other.
//
// EXCEPTIONS ARE NAMED, NEVER APPLIED (owner decision): the score is the plain
// sum of the eight tables. Where a traditional exception (parihara) to Nadi or
// Bhakoot dosha applies, it is listed beside the score for the astrologer.
//
// Tables:
//   varna     1 point when the groom's varna ranks at or above the bride's.
//   vashya    the 5×5 table as ProKerala applies it, reconstructed from 60
//             pairs with no conflicting cell: a predator and its prey score 0
//             (the lion with quadrupeds, either way; a human groom with a
//             Scorpio bride). One cell, lion groom with Scorpio bride, was not
//             covered and stays 0, as its mirror is in every table.
//   tara      counted from each Moon's nakshatra to the other's; a remainder
//             (mod 9) of 3, 5 or 7 is unfavourable (Vipat, Pratyak, Naidhana);
//             1½ points for each favourable direction.
//   yoni      the 14×14 animal table: 4 same, 3 friendly, 2 neutral, 1
//             unfriendly, 0 sworn enemies (horse–buffalo, elephant–lion,
//             sheep–monkey, serpent–mongoose, dog–deer, cat–rat, cow–tiger).
//   maitri    natural friendship of the two Moon-sign lords (BPHS 3.55–57):
//             5 friends or the same lord, 4 friend+neutral, 3 neutral, 1
//             friend+enemy, ½ neutral+enemy, 0 enemies.
//   gana      6 same; groom deva with bride manushya 6, the reverse 5;
//             rakshasa groom with deva bride 1, the reverse 0; rakshasa with
//             manushya 0 either way (the commonly printed table, and ProKerala's).
//   bhakoot   the signs' distance: 1/1, 3/11, 4/10, 7/7 give 7; 2/12, 5/9 and
//             6/8 give 0 (Bhakoot dosha).
//   nadi      8 different, 0 the same (Nadi dosha).

type Lord = Exclude<Graha, 'rahu' | 'ketu'>;
type Relation = 'friend' | 'neutral' | 'enemy';

const NATURAL: Record<Lord, { friends: Lord[]; enemies: Lord[] }> = {
  sun: { friends: ['moon', 'mars', 'jupiter'], enemies: ['venus', 'saturn'] },
  moon: { friends: ['sun', 'mercury'], enemies: [] },
  mars: { friends: ['sun', 'moon', 'jupiter'], enemies: ['mercury'] },
  mercury: { friends: ['sun', 'venus'], enemies: ['moon'] },
  jupiter: { friends: ['sun', 'moon', 'mars'], enemies: ['mercury', 'venus'] },
  venus: { friends: ['mercury', 'saturn'], enemies: ['sun', 'moon'] },
  saturn: { friends: ['mercury', 'venus'], enemies: ['sun', 'moon', 'mars'] },
};

/** How `a` regards `b` in natural friendship. */
export function relationOf(a: Lord, b: Lord): Relation {
  if (a === b) return 'friend';
  return NATURAL[a].friends.includes(b) ? 'friend' : NATURAL[a].enemies.includes(b) ? 'enemy' : 'neutral';
}

const MAITRI_POINTS: Record<string, number> = {
  'friend+friend': 5, 'friend+neutral': 4, 'neutral+neutral': 3, 'enemy+friend': 1, 'enemy+neutral': 0.5, 'enemy+enemy': 0,
};

const VARNA_RANK = { brahmin: 4, kshatriya: 3, vaishya: 2, shudra: 1 } as const;

/** Rows: the groom's vashya; columns: the bride's. */
const VASHYA_POINTS: Record<Vashya, Record<Vashya, number>> = {
  chatushpada: { chatushpada: 2, manava: 1, jalachara: 1, vanachara: 0, keeta: 1 },
  manava: { chatushpada: 1, manava: 2, jalachara: 0.5, vanachara: 0, keeta: 0 },
  jalachara: { chatushpada: 1, manava: 0.5, jalachara: 2, vanachara: 1, keeta: 1 },
  vanachara: { chatushpada: 0, manava: 0, jalachara: 1, vanachara: 2, keeta: 0 },
  keeta: { chatushpada: 1, manava: 1, jalachara: 1, vanachara: 0, keeta: 2 },
};

const YONI_ORDER: Yoni[] = ['horse', 'elephant', 'sheep', 'serpent', 'dog', 'cat', 'rat', 'cow', 'buffalo', 'tiger', 'deer', 'monkey', 'mongoose', 'lion'];
/** Symmetric; rows and columns in YONI_ORDER. */
const YONI_POINTS: number[][] = [
  [4, 2, 2, 3, 2, 2, 2, 1, 0, 1, 3, 3, 2, 1],
  [2, 4, 3, 3, 2, 2, 2, 2, 3, 1, 2, 3, 2, 0],
  [2, 3, 4, 2, 1, 2, 1, 3, 3, 1, 2, 0, 3, 1],
  [3, 3, 2, 4, 2, 1, 1, 1, 1, 2, 2, 2, 0, 2],
  [2, 2, 1, 2, 4, 2, 1, 2, 2, 1, 0, 2, 1, 1],
  [2, 2, 2, 1, 2, 4, 0, 2, 2, 1, 3, 3, 2, 1],
  [2, 2, 1, 1, 1, 0, 4, 2, 2, 2, 2, 2, 1, 2],
  [1, 2, 3, 1, 2, 2, 2, 4, 3, 0, 3, 2, 2, 1],
  [0, 3, 3, 1, 2, 2, 2, 3, 4, 1, 2, 2, 2, 1],
  [1, 1, 1, 2, 1, 1, 2, 0, 1, 4, 1, 1, 2, 1],
  [3, 2, 2, 2, 0, 3, 2, 3, 2, 1, 4, 2, 2, 1],
  [3, 3, 0, 2, 2, 3, 2, 2, 2, 1, 2, 4, 3, 2],
  [2, 2, 3, 0, 1, 2, 1, 2, 2, 2, 2, 3, 4, 2],
  [1, 0, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 2, 4],
];

/** Rows: the groom's gana; columns: the bride's. */
const GANA_POINTS: Record<Gana, Record<Gana, number>> = {
  deva: { deva: 6, manushya: 6, rakshasa: 0 },
  manushya: { deva: 5, manushya: 6, rakshasa: 0 },
  rakshasa: { deva: 1, manushya: 0, rakshasa: 6 },
};

/** The nine taras, by the remainder of the count (1 … 9, with 0 read as 9). */
const TARAS = ['Janma', 'Sampat', 'Vipat', 'Kshema', 'Pratyak', 'Sadhana', 'Naidhana', 'Mitra', 'Parama Mitra'];
const UNFAVOURABLE_TARA = new Set([3, 5, 7]);

function taraFrom(fromNakshatra: number, toNakshatra: number) {
  const count = ((toNakshatra - fromNakshatra + 27) % 27) + 1;
  const remainder = count % 9 === 0 ? 9 : count % 9;
  return { count, number: remainder, name: TARAS[remainder - 1]!, favourable: !UNFAVOURABLE_TARA.has(remainder) };
}

export type KootaId = 'varna' | 'vashya' | 'tara' | 'yoni' | 'maitri' | 'gana' | 'bhakoot' | 'nadi';

/** One partner's Moon, as the kootas read it. */
function moonOf(longitude: number) {
  const rashi = rashiOf(longitude);
  const nakshatra = nakshatraOf(longitude);
  const details = avakhadaOf(longitude);
  return { longitude, sign: rashi.sign, rashi: rashi.rashi, signNumber: rashi.signNumber, signLord: rashi.signLord as Lord, nakshatra, details };
}

export type MatchMoon = ReturnType<typeof moonOf>;

/**
 * Ashtakoota between two Moons. The first argument is the bride's, the second
 * the groom's, because Varna, Vashya and Gana are not symmetric.
 */
export function ashtakoota(brideMoonLongitude: number, groomMoonLongitude: number) {
  const bride = moonOf(brideMoonLongitude);
  const groom = moonOf(groomMoonLongitude);
  const b = bride.details;
  const g = groom.details;

  const varna = VARNA_RANK[g.varna.id] >= VARNA_RANK[b.varna.id] ? 1 : 0;
  const vashya = VASHYA_POINTS[g.vashya.id][b.vashya.id];

  const taraBrideToGroom = taraFrom(bride.nakshatra.number, groom.nakshatra.number);
  const taraGroomToBride = taraFrom(groom.nakshatra.number, bride.nakshatra.number);
  const tara = (taraBrideToGroom.favourable ? 1.5 : 0) + (taraGroomToBride.favourable ? 1.5 : 0);

  const yoni = YONI_POINTS[YONI_ORDER.indexOf(b.yoni.id)]![YONI_ORDER.indexOf(g.yoni.id)]!;

  const brideView = relationOf(bride.signLord, groom.signLord);
  const groomView = relationOf(groom.signLord, bride.signLord);
  const maitri = bride.signLord === groom.signLord ? 5 : MAITRI_POINTS[[brideView, groomView].sort().join('+')]!;

  const gana = GANA_POINTS[g.gana.id][b.gana.id];

  // Counted from the bride's sign to the groom's; the reverse count is 14 − d (mod 12).
  const distance = ((groom.signNumber - bride.signNumber + 12) % 12) + 1;
  const reverse = ((bride.signNumber - groom.signNumber + 12) % 12) + 1;
  const bhakootDosha = [2, 12, 5, 9, 6, 8].includes(distance);
  const bhakoot = bhakootDosha ? 0 : 7;

  const nadiDosha = b.nadi.id === g.nadi.id;
  const nadi = nadiDosha ? 0 : 8;

  const kootas = [
    { id: 'varna' as const, name: 'Varna', max: 1, points: varna, bride: b.varna, groom: g.varna },
    { id: 'vashya' as const, name: 'Vashya', max: 2, points: vashya, bride: b.vashya, groom: g.vashya },
    // Each partner's entry is counted from their own nakshatra to the other's.
    { id: 'tara' as const, name: 'Tara', max: 3, points: tara, bride: taraBrideToGroom, groom: taraGroomToBride },
    { id: 'yoni' as const, name: 'Yoni', max: 4, points: yoni, bride: b.yoni, groom: g.yoni },
    { id: 'maitri' as const, name: 'Graha Maitri', max: 5, points: maitri, bride: { lord: bride.signLord, regardsOther: brideView }, groom: { lord: groom.signLord, regardsOther: groomView } },
    { id: 'gana' as const, name: 'Gana', max: 6, points: gana, bride: b.gana, groom: g.gana },
    { id: 'bhakoot' as const, name: 'Bhakoot', max: 7, points: bhakoot, bride: { sign: bride.sign, signNumber: bride.signNumber }, groom: { sign: groom.sign, signNumber: groom.signNumber }, distance: { brideToGroom: distance, groomToBride: reverse } },
    { id: 'nadi' as const, name: 'Nadi', max: 8, points: nadi, bride: b.nadi, groom: g.nadi },
  ];
  const total = kootas.reduce((sum, k) => sum + k.points, 0);

  return {
    system: 'ashtakoota' as const,
    max: 36,
    total,
    kootas,
    doshas: { nadi: nadiDosha, bhakoot: bhakootDosha },
    exceptions: exceptionsFor(bride, groom, { nadiDosha, bhakootDosha, brideView, groomView }),
    moons: { bride: summary(bride), groom: summary(groom) },
  };
}

function summary(moon: MatchMoon) {
  return { longitude: moon.longitude, sign: moon.sign, rashi: moon.rashi, signNumber: moon.signNumber, signLord: moon.signLord, nakshatra: moon.nakshatra };
}

export interface MatchException { dosha: 'nadi' | 'bhakoot'; rule: string }

/**
 * The traditional exceptions (parihara) whose conditions hold for this pair.
 * Only those that apply are listed, and none changes the score.
 */
export function exceptionsFor(
  bride: MatchMoon, groom: MatchMoon,
  { nadiDosha, bhakootDosha, brideView, groomView }: { nadiDosha: boolean; bhakootDosha: boolean; brideView: Relation; groomView: Relation },
): MatchException[] {
  const found: MatchException[] = [];
  if (nadiDosha) {
    const sameSign = bride.signNumber === groom.signNumber;
    const sameStar = bride.nakshatra.number === groom.nakshatra.number;
    if (sameSign && !sameStar) found.push({ dosha: 'nadi', rule: 'Both Moons are in the same sign but in different nakshatras.' });
    if (sameStar && !sameSign) found.push({ dosha: 'nadi', rule: 'Both Moons are in the same nakshatra but in different signs.' });
    if (sameStar && bride.nakshatra.pada !== groom.nakshatra.pada) found.push({ dosha: 'nadi', rule: 'Both Moons are in the same nakshatra but in different padas.' });
  }
  if (bhakootDosha) {
    if (bride.signLord === groom.signLord) found.push({ dosha: 'bhakoot', rule: 'Both Moon signs have the same lord.' });
    else if (brideView === 'friend' && groomView === 'friend') found.push({ dosha: 'bhakoot', rule: 'The lords of the two Moon signs are natural friends.' });
  }
  return found;
}
