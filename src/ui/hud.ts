import type { Game, LogEntry } from '../game/sim';
import { fmtHeading, fmtTime } from '../game/util';

export interface TouchInput {
  turn: number;
  throttle: number;
  reel: boolean;
  drag: number;
}

export class Hud {
  canvas: HTMLCanvasElement;
  touch: TouchInput = { turn: 0, throttle: 0, reel: false, drag: 0 };
  private els: Record<string, HTMLElement> = {};
  private lastLogLen = -1;
  private lastCatchLen = -1;

  constructor(
    root: HTMLElement,
    private game: Game,
    private onRestart: () => void,
  ) {
    const t = game.tackle;
    root.innerHTML = `
      <div class="play">
        <aside class="side">
          <div class="side-head"><h1>カジキ釣り</h1><button id="mute" class="mute" title="音のON/OFF (M)">🔊</button></div>
          <section class="panel status">
            <div class="row"><span>時刻</span><b id="time"></b></div>
            <div class="row"><span>速度</span><b id="speed"></b></div>
            <div class="row"><span>針路</span><b id="heading"></b></div>
            <div class="row"><span>スロットル</span><b id="throttle"></b></div>
            <div class="row"><span>状態</span><b id="mode"></b></div>
            <div class="row"><span>魚影</span><div class="bar"><i id="density"></i></div></div>
            <div class="row"><span>沖出し</span><b id="offshore"></b></div>
          </section>
          <section class="panel">
            <h3>竿</h3>
            <div class="rods" id="rods"></div>
          </section>
          <section class="panel tackle">
            <h3>タックル</h3>
            <div>${t.boat.name} / 竿${t.rodCount}本</div>
            <div>${t.reel.name}リール / ${t.line.name}</div>
            <div>${t.lure.name}（${t.lure.minSpeedKt}–${t.lure.maxSpeedKt}kt）</div>
          </section>
          <section class="panel">
            <h3>釣果 <small id="score"></small></h3>
            <ul class="catches" id="catches"><li class="empty">まだ釣れていません</li></ul>
          </section>
          <section class="panel log-panel">
            <h3>ログ</h3>
            <ul class="log" id="log"></ul>
          </section>
          <section class="panel help">
            <div>←→ / A D: 舵　↑↓ / W S: スロットル</div>
            <div>海面クリック: 目標地点へ自動操船</div>
            <div>ファイト: Space長押し=巻く、↑↓=ドラグ</div>
            <div>M: 音のON/OFF</div>
          </section>
        </aside>
        <main class="stage" id="stage">
          <canvas id="sea"></canvas>
          <div class="touch-nav" id="touch-nav">
            <button data-k="left">◀</button>
            <button data-k="right">▶</button>
            <button data-k="down">−</button>
            <button data-k="up">＋</button>
          </div>
          <div class="fight" id="fight" hidden>
            <div class="fight-head">
              <b id="f-name"></b> <span id="f-weight"></span>
              <span class="f-state" id="f-state"></span>
            </div>
            <div class="meter">
              <label>テンション <small id="f-tension"></small></label>
              <div class="bar big"><i id="f-tension-bar"></i><em id="f-drag-mark" title="ドラグ"></em></div>
            </div>
            <div class="meter">
              <label>ドラグ <small id="f-drag"></small></label>
              <div class="bar"><i id="f-drag-bar"></i><em id="f-safe-mark" title="安全上限"></em></div>
            </div>
            <div class="meter">
              <label>ライン放出 <small id="f-line"></small></label>
              <div class="bar"><i id="f-line-bar"></i></div>
            </div>
            <div class="meter">
              <label>魚の体力 <small id="f-stamina"></small></label>
              <div class="bar"><i id="f-stamina-bar" class="stamina"></i></div>
            </div>
            <div class="fight-btns">
              <button data-k="dragdown">ドラグ −</button>
              <button data-k="reel" class="reel">巻く（長押し）</button>
              <button data-k="dragup">ドラグ ＋</button>
            </div>
          </div>
          <div class="toast" id="toast"></div>
          <div class="banner" id="banner" hidden><b id="banner-title"></b><span id="banner-sub"></span></div>
          <div class="results" id="results" hidden></div>
        </main>
      </div>`;

    root.querySelectorAll<HTMLElement>('[id]').forEach((el) => (this.els[el.id] = el));
    this.canvas = this.els['sea'] as HTMLCanvasElement;
    this.bindTouch();
  }

  private bindTouch(): void {
    const set = (k: string, on: boolean) => {
      const v = on ? 1 : 0;
      switch (k) {
        case 'left':
          this.touch.turn = on ? -1 : this.touch.turn < 0 ? 0 : this.touch.turn;
          break;
        case 'right':
          this.touch.turn = on ? 1 : this.touch.turn > 0 ? 0 : this.touch.turn;
          break;
        case 'up':
          this.touch.throttle = on ? 1 : this.touch.throttle > 0 ? 0 : this.touch.throttle;
          break;
        case 'down':
          this.touch.throttle = on ? -1 : this.touch.throttle < 0 ? 0 : this.touch.throttle;
          break;
        case 'reel':
          this.touch.reel = on;
          break;
        case 'dragup':
          this.touch.drag = on ? 1 : this.touch.drag > 0 ? 0 : this.touch.drag;
          break;
        case 'dragdown':
          this.touch.drag = on ? -1 : this.touch.drag < 0 ? 0 : this.touch.drag;
          break;
      }
      void v;
    };
    document.querySelectorAll<HTMLButtonElement>('button[data-k]').forEach((btn) => {
      const k = btn.dataset.k!;
      const down = (e: Event) => {
        e.preventDefault();
        set(k, true);
      };
      const up = (e: Event) => {
        e.preventDefault();
        set(k, false);
      };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointerleave', up);
      btn.addEventListener('pointercancel', up);
    });
  }

  private onToggleMute: (() => boolean) | null = null;

  setMuteButton(available: boolean, onToggle: () => boolean): void {
    const btn = this.els['mute'];
    if (!available) {
      btn.hidden = true;
      return;
    }
    this.onToggleMute = onToggle;
    btn.onclick = () => this.toggleMuteFromKey();
  }

  toggleMuteFromKey(): void {
    if (!this.onToggleMute) return;
    const muted = this.onToggleMute();
    this.els['mute'].textContent = muted ? '🔇' : '🔊';
  }

  update(): void {
    const g = this.game;
    const e = this.els;
    e['time'].textContent = fmtTime(g.time);
    e['speed'].textContent = `${g.speedKt.toFixed(1)} kt`;
    e['heading'].textContent = fmtHeading(g.heading);
    e['throttle'].textContent = `${Math.round(g.throttle * 100)}%`;
    e['offshore'].textContent = `${(g.pos.y / 1000).toFixed(1)} km`;
    const d = g.densityHere();
    (e['density'] as HTMLElement).style.width = `${Math.min(100, (d / 2.2) * 100)}%`;
    e['density'].className = d > 1.2 ? 'hot' : d > 0.5 ? 'warm' : '';

    let mode: string;
    const sf = g.speedFactor();
    if (g.fight) mode = 'ファイト中！';
    else if (g.speedKt < 0.5) mode = g.tackle.lure.id === 'livebait' ? '流し釣り（潮に乗せる）' : '停船中';
    else if (sf > 0.7) mode = '曳航中 ◎';
    else if (sf > 0.2) mode = '曳航中（速度が合っていない）';
    else mode = '移動中（釣りにならない速度）';
    e['mode'].textContent = mode;
    e['mode'].className = sf > 0.7 || g.fight ? 'good' : sf > 0.2 ? 'meh' : 'bad';

    e['rods'].innerHTML = g.rods
      .map((r, i) => {
        const cls = r === 'hooked' ? 'hooked' : r === 'out' ? (sf > 0.2 ? 'out' : 'idle') : 'retrieved';
        const label = r === 'hooked' ? 'HIT!' : r === 'out' ? (sf > 0.2 ? '流し中' : '待機') : '回収';
        return `<div class="rod ${cls}">${i + 1}<small>${label}</small></div>`;
      })
      .join('');

    if (g.catches.length !== this.lastCatchLen) {
      this.lastCatchLen = g.catches.length;
      e['score'].textContent = `スコア ${g.score}`;
      e['catches'].innerHTML = g.catches.length
        ? g.catches
            .map(
              (c) =>
                `<li><span class="dot" style="background:${c.species.color}"></span>${c.species.nameJa} <b>${Math.round(c.weightKg)}kg</b><small>${fmtTime(c.time)}</small></li>`,
            )
            .join('')
        : '<li class="empty">まだ釣れていません</li>';
    }

    if (g.log.length !== this.lastLogLen) {
      this.lastLogLen = g.log.length;
      const items = g.log.slice(-14).reverse();
      e['log'].innerHTML = items.map((l) => `<li class="${l.kind}"><small>${fmtTime(l.time)}</small>${l.text}</li>`).join('');
      const latest = g.log[g.log.length - 1];
      if (latest) this.toast(latest);
    }

    this.updateFight();
    this.updateBanner();
  }

  private bannerShown: object | null = null;
  private bannerTimer: ReturnType<typeof setTimeout> | null = null;
  /** ファイト終了時の大きな表示 */
  private updateBanner(): void {
    const e = this.game.ending;
    if (!e || e === this.bannerShown) return;
    this.bannerShown = e;
    const el = this.els['banner'];
    const title = this.els['banner-title'];
    const sub = this.els['banner-sub'];
    const kg = Math.round(e.weightKg);
    const reason: Record<string, string> = {
      shock: 'ドラグが強すぎた',
      chafe: '限界近くで擦れた',
      jumpBreak: '着水で切られた',
      jumpShake: 'ジャンプで外された',
      slack: 'テンションが抜けた',
      chargeSlack: '糸ふけで外れた',
      boatside: '船際で口切れ',
      spooled: '止められなかった',
    };
    switch (e.result) {
      case 'landed':
        title.textContent = 'キャッチ！';
        sub.textContent = `${e.species.nameJa} ${kg}kg`;
        break;
      case 'break':
        title.textContent = 'ラインブレイク！';
        sub.textContent = `${e.species.nameJa} 約${kg}kg ― ${e.reason ? reason[e.reason] : ''}`;
        break;
      case 'pulled':
        title.textContent = 'フックアウト！';
        sub.textContent = `${e.species.nameJa} 約${kg}kg ― ${e.reason ? reason[e.reason] : ''}`;
        break;
      case 'spooled':
        title.textContent = 'スプールが空…';
        sub.textContent = `${e.species.nameJa} 約${kg}kg に全部出された`;
        break;
    }
    el.className = `banner show ${e.result}`;
    el.hidden = false;
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => {
      el.className = 'banner';
      setTimeout(() => (el.hidden = true), 400);
    }, e.duration * 1000 - 400);
  }

  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private toast(l: LogEntry): void {
    if (l.kind === 'info' && l.text.includes('出港')) return;
    const el = this.els['toast'];
    el.textContent = l.text;
    el.className = `toast show ${l.kind}`;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (el.className = 'toast'), 3500);
  }

  private updateFight(): void {
    const f = this.game.fight;
    const e = this.els;
    const panel = e['fight'];
    e['touch-nav'].hidden = !!f;
    if (!f) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    e['f-name'].textContent = f.species.nameJa;
    e['f-weight'].textContent = `推定 ${Math.round(f.weightKg / 10) * 10}kg級`;
    const runLabel: Record<string, string> = {
      first: '猛烈に走る！！',
      second: 'セカンドラン！',
      boatShy: '船を見て走った！',
      charge: '船に向かって走る！巻け！',
      dive: '深く突っ込む…',
      normal: '走っている…',
    };
    e['f-state'].textContent =
      f.jumpTimer > 0 ? 'ジャンプ！' : f.running ? runLabel[f.runKind] : f.depth > 0.55 ? '深く潜っている…' : f.stamina < 0.3 ? '弱ってきた' : '止まった';
    e['f-state'].className = `f-state ${f.running ? (f.runKind === 'charge' ? 'charge' : 'run') : 'rest'}`;

    const strength = f.lineStrength;
    const tr = f.effTension / strength;
    e['f-tension'].textContent = `${f.effTension.toFixed(1)} / ${strength}kg`;
    const tb = e['f-tension-bar'];
    tb.style.width = `${Math.min(100, tr * 100)}%`;
    tb.className = tr > 0.85 ? 'danger' : tr > 0.6 ? 'warn' : f.tension < f.weightKg * 0.06 ? 'slack' : '';
    e['f-drag-mark'].style.left = `${Math.min(100, (f.dragKg / strength) * 100)}%`;

    const maxDrag = this.game.tackle.reel.maxDragKg;
    e['f-drag'].textContent = `${f.dragKg.toFixed(1)}kg（最大${maxDrag}kg）`;
    const db = e['f-drag-bar'];
    db.style.width = `${(f.dragKg / maxDrag) * 100}%`;
    db.className = f.dragKg > f.safeDrag ? 'danger' : '';
    e['f-safe-mark'].style.left = `${Math.min(100, (f.safeDrag / maxDrag) * 100)}%`;

    e['f-line'].textContent = `${Math.round(f.lineOut)} / ${f.capacity}m`;
    const lb = e['f-line-bar'];
    lb.style.width = `${Math.min(100, (f.lineOut / f.capacity) * 100)}%`;
    lb.className = f.lineOut / f.capacity > 0.8 ? 'danger' : '';

    e['f-stamina'].textContent = `${Math.round(f.stamina * 100)}%`;
    e['f-stamina-bar'].style.width = `${f.stamina * 100}%`;
  }

  showResults(): void {
    const g = this.game;
    const el = this.els['results'];
    const best = g.catches.reduce<typeof g.catches[number] | null>((b, c) => (!b || c.weightKg > b.weightKg ? c : b), null);
    el.innerHTML = `
      <div class="results-card">
        <h2>本日の釣果</h2>
        <p class="big">${g.catches.length}本 / スコア ${g.score}</p>
        ${best ? `<p>最大: ${best.species.nameJa} ${Math.round(best.weightKg)}kg</p>` : '<p>今日は釣れなかった…潮目や鳥山を探してみよう。</p>'}
        <p class="stats">ヒット ${g.strikes}回 / 乗らず ${g.misses}回 / 逃した ${g.lost}本</p>
        <ul>${g.catches
          .map((c) => `<li><span class="dot" style="background:${c.species.color}"></span>${c.species.nameJa} ${Math.round(c.weightKg)}kg（${fmtTime(c.time)}, ${Math.round(c.fightSec)}秒）</li>`)
          .join('')}</ul>
        <button class="primary" id="restart">もう一度</button>
      </div>`;
    el.hidden = false;
    el.querySelector<HTMLButtonElement>('#restart')!.onclick = this.onRestart;
  }
}
