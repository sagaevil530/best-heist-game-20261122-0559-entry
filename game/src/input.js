// Keyboard + mouse, normalised into the plain input object game.js reads.
// Edge flags (pressed this frame) are cleared by endFrame() after each update.
import { VIEW_W, VIEW_H } from './config.js';

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  KeyC: 'sneak', ControlLeft: 'sneak', ControlRight: 'sneak',
  KeyE: 'interact',
  KeyQ: 'smoke',
  KeyF: 'emp',
  KeyP: 'pause', Escape: 'pause',
  Enter: 'confirm', Space: 'confirm',
  KeyR: 'restart',
  KeyM: 'mute',
  KeyT: 'title',
  Digit1: 'diff1', Digit2: 'diff2', Digit3: 'diff3',
};

export function createInput(canvas, onFirstGesture) {
  const held = new Set();
  const input = {
    up: false, down: false, left: false, right: false,
    sprint: false, sneak: false, interact: false,
    smokePressed: false, empPressed: false,
    pausePressed: false, confirmPressed: false,
    restartPressed: false, mutePressed: false, titlePressed: false,
    diffKey: null,
    mouseX: 0, mouseY: 0, mouseClicked: false,
    clickMoveX: null, clickMoveY: null,
  };

  function edge(name) {
    if (name === 'smoke') input.smokePressed = true;
    else if (name === 'emp') input.empPressed = true;
    else if (name === 'pause') input.pausePressed = true;
    else if (name === 'confirm') input.confirmPressed = true;
    else if (name === 'restart') input.restartPressed = true;
    else if (name === 'mute') input.mutePressed = true;
    else if (name === 'title') input.titlePressed = true;
    else if (name === 'diff1') input.diffKey = 'easy';
    else if (name === 'diff2') input.diffKey = 'normal';
    else if (name === 'diff3') input.diffKey = 'hard';
  }

  function refreshHeld() {
    input.up = held.has('up');
    input.down = held.has('down');
    input.left = held.has('left');
    input.right = held.has('right');
    input.sprint = held.has('sprint');
    input.sneak = held.has('sneak');
    input.interact = held.has('interact');
  }

  window.addEventListener('keydown', (e) => {
    const name = KEYMAP[e.code];
    if (!name) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (onFirstGesture) onFirstGesture();
    if (!e.repeat) edge(name);
    held.add(name);
    refreshHeld();
  });
  window.addEventListener('keyup', (e) => {
    const name = KEYMAP[e.code];
    if (!name) return;
    held.delete(name);
    refreshHeld();
  });
  window.addEventListener('blur', () => {
    held.clear();
    refreshHeld();
  });

  function canvasPos(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * VIEW_W,
      y: ((e.clientY - r.top) / r.height) * VIEW_H,
    };
  }

  canvas.addEventListener('mousedown', (e) => {
    if (onFirstGesture) onFirstGesture();
    const p = canvasPos(e);
    input.mouseX = p.x;
    input.mouseY = p.y;
    input.mouseClicked = true;
    input.clickMoveX = p.x;
    input.clickMoveY = p.y;
  });
  canvas.addEventListener('mousemove', (e) => {
    const p = canvasPos(e);
    input.mouseX = p.x;
    input.mouseY = p.y;
  });

  input.endFrame = () => {
    input.smokePressed = false;
    input.empPressed = false;
    input.pausePressed = false;
    input.confirmPressed = false;
    input.restartPressed = false;
    input.mutePressed = false;
    input.titlePressed = false;
    input.diffKey = null;
    input.mouseClicked = false;
  };

  // The game reads click-to-move from the player; main.js copies these in.
  input.consumeClickMove = () => {
    const c = input.clickMoveX === null ? null : { x: input.clickMoveX, y: input.clickMoveY };
    input.clickMoveX = null;
    input.clickMoveY = null;
    return c;
  };

  return input;
}
