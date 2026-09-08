import { boatById, lineById, lureById, reelById, type TackleConfig } from './equipment';

export interface Preset {
  id: string;
  name: string;
  desc: string;
  boat: string;
  rods: number;
  reel: string;
  line: string;
  lure: string;
}

export const PRESETS: Preset[] = [
  {
    id: 'beginner',
    name: 'はじめてのカジキ',
    desc: '遊漁船でマカジキ・バショウカジキを狙う。扱いやすい50lbタックル、竿3本。',
    boat: 'charter',
    rods: 3,
    reel: 'r50',
    line: 'l50',
    lure: 'skirted',
  },
  {
    id: 'light',
    name: 'ライトタックルで数釣り',
    desc: '小型ボート＋弓角。近海のバショウカジキを速い曳きで狙う。',
    boat: 'skiff',
    rods: 2,
    reel: 'r30',
    line: 'l30',
    lure: 'yumizuno',
  },
  {
    id: 'bigblue',
    name: 'クロカジキを獲る',
    desc: 'スポーツフィッシャーで黒潮本流へ。80lbタックル＋コナヘッド、竿4本。',
    boat: 'sportfisher',
    rods: 4,
    reel: 'r80',
    line: 'l80',
    lure: 'kona',
  },
  {
    id: 'livebait',
    name: '生き餌の流し釣り',
    desc: 'ムロアジを泳がせてシロカジキ級を待つ。130lbヘビータックル、竿2本。',
    boat: 'sportfisher',
    rods: 2,
    reel: 'r130',
    line: 'l130',
    lure: 'livebait',
  },
];

export function presetToTackle(p: Preset): TackleConfig {
  return {
    boat: boatById(p.boat),
    rodCount: p.rods,
    reel: reelById(p.reel),
    line: lineById(p.line),
    lure: lureById(p.lure),
  };
}
