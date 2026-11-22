// Boot: wire canvas, audio, input and the game together, run the fixed-step
// loop, and honour ?shot= / ?selftest= for staged scenes and verification.
import { VIEW_W, VIEW_H, STEP } from './config.js';
import { createAudio } from './audio.js';
import { createGame } from './game.js';
import { createInput } from './input.js';
import { render } from './render.js';
import { stageShot, selfTest } from './shots.js';

window.__errors = [];
window.addEventListener('error', (e) => {
  window.__errors.push(String(e.message || e.error || 'unknown error'));
});

const params = new URLSearchParams(window.location.search);
const shotKind = params.get('shot');
const doSelfTest = params.get('selftest') === '1';

const canvas = document.getElementById('game');
canvas.width = VIEW_W;
canvas.height = VIEW_H;
const ctx = canvas.getContext('2d');

const audio = createAudio();
const game = createGame(audio);
window.__game = game;

const input = createInput(canvas, () => audio.ensure());

// A live gallery scene behind the title screen.
game.loadLevel(0);

let time = 0;

function draw() {
  render(ctx, game, time);
}

if (shotKind) {
  // Staged scene: simulate synchronously, render once, freeze. The
  // screenshot tool then captures a settled, deterministic frame.
  stageShot(game, shotKind);
  time = game.time;
  draw();
  document.title = `shot:${shotKind}:${game.screen}`;
} else if (doSelfTest) {
  const result = selfTest(game);
  const div = document.getElementById('selftest');
  div.textContent = JSON.stringify(result);
  document.title = `selftest:${result.results.every((r) => r.won) ? 'PASS' : 'FAIL'}`;
  draw();
} else {
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 5) {
      // Click-to-move only while actually playing.
      if (game.screen === 'playing' && game.player) {
        const click = input.consumeClickMove();
        if (click) {
          game.player.clickX = click.x;
          game.player.clickY = click.y;
        }
      }
      game.update(input);
      input.endFrame();
      acc -= STEP;
      time += STEP;
      n += 1;
    }
    if (n === 5) acc = 0;
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
