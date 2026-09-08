import {
  BOATS,
  LINES,
  LURES,
  REELS,
  boatById,
  lineById,
  lureById,
  reelById,
  tackleWarnings,
  type TackleConfig,
} from '../data/equipment';
import { PRESETS } from '../data/presets';
import { SPECIES } from '../data/species';

interface Selection {
  boat: string;
  rods: number;
  reel: string;
  line: string;
  lure: string;
}

function toTackle(s: Selection): TackleConfig {
  const boat = boatById(s.boat);
  return {
    boat,
    rodCount: Math.min(s.rods, boat.maxRods),
    reel: reelById(s.reel),
    line: lineById(s.line),
    lure: lureById(s.lure),
  };
}

export function showSetup(root: HTMLElement, onStart: (t: TackleConfig) => void): void {
  const first = PRESETS[0];
  const sel: Selection = { boat: first.boat, rods: first.rods, reel: first.reel, line: first.line, lure: first.lure };
  let activePreset: string | null = first.id;

  root.innerHTML = `
    <div class="setup">
      <header class="setup-head">
        <h1>カジキ釣り</h1>
        <p>日本近海のカジキをトローリングで狙う。船を潮目や鳥山へ流し、タックルを選んで出港しよう。</p>
      </header>
      <section>
        <h2>プリセット</h2>
        <div class="preset-grid" id="presets"></div>
      </section>
      <section class="custom">
        <h2>カスタム</h2>
        <div class="custom-grid">
          <label>船
            <select id="sel-boat"></select>
            <small id="desc-boat"></small>
          </label>
          <label>竿の本数
            <select id="sel-rods"></select>
            <small>本数が多いほどヒット率は上がるが、同時に掛かるのは1本。</small>
          </label>
          <label>リール
            <select id="sel-reel"></select>
            <small id="desc-reel"></small>
          </label>
          <label>ライン（糸の太さ）
            <select id="sel-line"></select>
            <small id="desc-line"></small>
          </label>
          <label>ルアー / 餌
            <select id="sel-lure"></select>
            <small id="desc-lure"></small>
          </label>
        </div>
        <ul class="warnings" id="warnings"></ul>
      </section>
      <section class="species">
        <h2>釣れるカジキ</h2>
        <div class="species-grid">
          ${SPECIES.map(
            (s) => `<div class="sp"><span class="dot" style="background:${s.color}"></span>
              <b>${s.nameJa}</b> <small>${s.nameEn} / ${s.minKg}–${s.maxKg}kg</small><p>${s.note}</p></div>`,
          ).join('')}
        </div>
      </section>
      <footer class="setup-foot">
        <button id="start" class="primary">出港する</button>
        <p class="hint">操作: ←→ 舵 / ↑↓ スロットル / 海面クリックで目標地点 / ファイト中: Space長押しで巻く、↑↓でドラグ調整</p>
      </footer>
    </div>`;

  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const presetsEl = $('presets');
  const boatSel = $<HTMLSelectElement>('sel-boat');
  const rodsSel = $<HTMLSelectElement>('sel-rods');
  const reelSel = $<HTMLSelectElement>('sel-reel');
  const lineSel = $<HTMLSelectElement>('sel-line');
  const lureSel = $<HTMLSelectElement>('sel-lure');

  boatSel.innerHTML = BOATS.map((b) => `<option value="${b.id}">${b.name}（最高${b.maxSpeedKt}kt / 竿${b.maxRods}本）</option>`).join('');
  reelSel.innerHTML = REELS.map((r) => `<option value="${r.id}">${r.name}（最大ドラグ${r.maxDragKg}kg / ${r.capacityM}m）</option>`).join('');
  lineSel.innerHTML = LINES.map((l) => `<option value="${l.id}">${l.name} 強度${l.strengthKg}kg</option>`).join('');
  lureSel.innerHTML = LURES.map((l) => `<option value="${l.id}">${l.name}</option>`).join('');

  function renderPresets(): void {
    presetsEl.innerHTML = PRESETS.map(
      (p) => `<button class="preset ${p.id === activePreset ? 'active' : ''}" data-id="${p.id}">
        <b>${p.name}</b><span>${p.desc}</span></button>`,
    ).join('');
    presetsEl.querySelectorAll<HTMLButtonElement>('.preset').forEach((btn) => {
      btn.onclick = () => {
        const p = PRESETS.find((x) => x.id === btn.dataset.id)!;
        Object.assign(sel, { boat: p.boat, rods: p.rods, reel: p.reel, line: p.line, lure: p.lure });
        activePreset = p.id;
        syncForm();
      };
    });
  }

  function syncForm(): void {
    const boat = boatById(sel.boat);
    boatSel.value = sel.boat;
    rodsSel.innerHTML = Array.from({ length: boat.maxRods }, (_, i) => `<option value="${i + 1}">${i + 1}本</option>`).join('');
    sel.rods = Math.min(sel.rods, boat.maxRods);
    rodsSel.value = String(sel.rods);
    reelSel.value = sel.reel;
    lineSel.value = sel.line;
    lureSel.value = sel.lure;
    $('desc-boat').textContent = boat.desc;
    const reel = reelById(sel.reel);
    $('desc-reel').textContent = `ドラグ最大 ${reel.maxDragKg}kg、糸巻き量 ${reel.capacityM}m。`;
    const line = lineById(sel.line);
    $('desc-line').textContent = `破断強度 ${line.strengthKg}kg。細いほど食いは良いが切れやすい（ヒット率 ×${line.strikeFactor}）。`;
    $('desc-lure').textContent = lureById(sel.lure).desc;
    const warns = tackleWarnings(toTackle(sel));
    $('warnings').innerHTML = warns.map((w) => `<li>${w}</li>`).join('');
    renderPresets();
  }

  const onChange = () => {
    sel.boat = boatSel.value;
    sel.rods = Number(rodsSel.value);
    sel.reel = reelSel.value;
    sel.line = lineSel.value;
    sel.lure = lureSel.value;
    const match = PRESETS.find(
      (p) => p.boat === sel.boat && p.rods === sel.rods && p.reel === sel.reel && p.line === sel.line && p.lure === sel.lure,
    );
    activePreset = match ? match.id : null;
    syncForm();
  };
  [boatSel, rodsSel, reelSel, lineSel, lureSel].forEach((el) => (el.onchange = onChange));

  $('start').onclick = () => onStart(toTackle(sel));
  syncForm();
}
