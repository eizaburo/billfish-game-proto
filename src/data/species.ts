/** 日本近海で釣れるカジキ類 */
export type SpeciesId = 'sailfish' | 'striped' | 'blue' | 'black' | 'swordfish' | 'spearfish';

export interface Species {
  id: SpeciesId;
  nameJa: string;
  nameEn: string;
  minKg: number;
  maxKg: number;
  /** 引きの強さ係数（体重比） */
  power: number;
  /** 走っている間にジャンプする傾向 0..1 */
  jumpy: number;
  /** 休むときに深く潜る傾向 0..1（メカジキは深い、バショウカジキは浅い） */
  dive: number;
  /** 好む海域: 岸(0)〜沖(1) の範囲 */
  zone: [number, number];
  /** 出現頻度の基礎値 */
  rarity: number;
  /** 朝夕マズメの倍率 */
  dawnDusk: number;
  scoreMul: number;
  color: string;
  note: string;
}

export const SPECIES: Species[] = [
  {
    id: 'sailfish',
    nameJa: 'バショウカジキ',
    nameEn: 'Sailfish',
    minKg: 15,
    maxKg: 45,
    power: 1.3,
    jumpy: 0.9,
    dive: 0.15,
    zone: [0.05, 0.45],
    rarity: 1.0,
    dawnDusk: 1.0,
    scoreMul: 1.0,
    color: '#4fc3f7',
    note: '比較的岸寄りの暖かい海に多い。とにかく速く、よく跳ぶ。',
  },
  {
    id: 'striped',
    nameJa: 'マカジキ',
    nameEn: 'Striped marlin',
    minKg: 30,
    maxKg: 110,
    power: 1.0,
    jumpy: 0.8,
    dive: 0.35,
    zone: [0.3, 0.75],
    rarity: 1.0,
    dawnDusk: 1.0,
    scoreMul: 1.0,
    color: '#7986cb',
    note: '日本のトローリングの主役。潮目や鳥山に付きやすい。',
  },
  {
    id: 'blue',
    nameJa: 'クロカジキ',
    nameEn: 'Blue marlin',
    minKg: 80,
    maxKg: 350,
    power: 1.1,
    jumpy: 0.6,
    dive: 0.65,
    zone: [0.6, 1.0],
    rarity: 0.5,
    dawnDusk: 1.0,
    scoreMul: 1.5,
    color: '#1e3a8a',
    note: '沖の黒潮に付く大物。重いタックルでなければ止められない。',
  },
  {
    id: 'black',
    nameJa: 'シロカジキ',
    nameEn: 'Black marlin',
    minKg: 100,
    maxKg: 450,
    power: 1.2,
    jumpy: 0.4,
    dive: 0.8,
    zone: [0.5, 1.0],
    rarity: 0.2,
    dawnDusk: 1.0,
    scoreMul: 2.0,
    color: '#455a64',
    note: '最大級のカジキ。生き餌に反応しやすい。',
  },
  {
    id: 'swordfish',
    nameJa: 'メカジキ',
    nameEn: 'Swordfish',
    minKg: 40,
    maxKg: 250,
    power: 0.9,
    jumpy: 0.2,
    dive: 1.0,
    zone: [0.75, 1.0],
    rarity: 0.15,
    dawnDusk: 2.5,
    scoreMul: 2.0,
    color: '#8d6e63',
    note: '深場の魚。朝夕マズメに沖で浮いてくる。',
  },
  {
    id: 'spearfish',
    nameJa: 'フウライカジキ',
    nameEn: 'Shortbill spearfish',
    minKg: 12,
    maxKg: 30,
    power: 1.1,
    jumpy: 0.7,
    dive: 0.3,
    zone: [0.5, 1.0],
    rarity: 0.25,
    dawnDusk: 1.0,
    scoreMul: 1.5,
    color: '#26a69a',
    note: '小型で細身。小さなルアーに掛かることが多い。',
  },
];

export const speciesById = (id: SpeciesId): Species => SPECIES.find((s) => s.id === id)!;
