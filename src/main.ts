import type { TackleConfig } from './data/equipment';
import { Game, type Input } from './game/sim';
import { Renderer } from './render/renderer';
import { Sound } from './audio/sound';
import { Hud } from './ui/hud';
import { showSetup } from './ui/setup';
import './style.css';

const app = document.getElementById('app')!;

function startGame(tackle: TackleConfig): void {
  const game = new Game(tackle);
  (window as unknown as { __game: Game }).__game = game; // デバッグ用
  const hud = new Hud(app, game, () => showSetup(app, startGame));
  const renderer = new Renderer(hud.canvas);
  // 出港ボタンのクリック（ユーザー操作）の中で生成するので自動再生制限にかからない
  const sound = new Sound();
  sound.resume();
  (window as unknown as { __sound: Sound }).__sound = sound; // デバッグ用
  hud.setMuteButton(sound.available, () => sound.toggleMute());

  const keys = new Set<string>();
  const captured = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  const onKeyDown = (e: KeyboardEvent) => {
    if (captured.has(e.code)) e.preventDefault();
    if (e.code === 'KeyM' && !e.repeat) hud.toggleMuteFromKey();
    sound.resume();
    keys.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => keys.clear());

  hud.canvas.addEventListener('click', (e) => {
    if (game.fight || game.ended) return;
    const rect = hud.canvas.getBoundingClientRect();
    game.setWaypoint(renderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top));
  });

  const axis = (neg: string[], pos: string[]) =>
    (neg.some((k) => keys.has(k)) ? -1 : 0) + (pos.some((k) => keys.has(k)) ? 1 : 0);

  let last = performance.now();
  let finished = false;
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const vert = axis(['ArrowDown', 'KeyS'], ['ArrowUp', 'KeyW']);
    const input: Input = {
      turn: Math.max(-1, Math.min(1, axis(['ArrowLeft', 'KeyA'], ['ArrowRight', 'KeyD']) + hud.touch.turn)),
      throttleDelta: game.fight ? 0 : Math.max(-1, Math.min(1, vert + hud.touch.throttle)),
      reel: keys.has('Space') || hud.touch.reel,
      dragDelta: game.fight ? Math.max(-1, Math.min(1, vert + hud.touch.drag)) : 0,
    };
    game.update(dt, input);
    sound.update(game);
    renderer.render(game, dt);
    hud.update();
    if (game.ended && !finished) {
      finished = true;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      hud.showResults();
      return;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

showSetup(app, startGame);
