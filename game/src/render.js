// Everything the player sees: the pre-rendered room, vision cones, the thief,
// the guards, loot, the HUD and every menu screen. Canvas 2D only.
import {
  TILE, COLS, ROWS, VIEW_W, VIEW_H, COLORS, tileCenter, clamp,
} from './config.js';
import { conePolygon, isWall, isDoor } from './world.js';
import { layoutButtons } from './game.js';

let staticCache = { world: null, canvas: null };
let vignetteCache = null;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function text(ctx, str, x, y, size, color, align = 'center', weight = 700) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px 'Segoe UI', system-ui, -apple-system, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function button(ctx, r, label, sub, active, disabled) {
  ctx.fillStyle = disabled ? '#2a3049' : active ? '#ffd34d' : '#232a45';
  roundRect(ctx, r.x, r.y, r.w, r.h, 10);
  ctx.fill();
  ctx.strokeStyle = active ? '#ffe9a8' : '#4a5478';
  ctx.lineWidth = 2;
  ctx.stroke();
  text(ctx, label, r.x + r.w / 2, r.y + r.h / 2 - (sub ? 8 : 0), 20,
    active ? '#1a1405' : disabled ? '#6a7190' : COLORS.hudText);
  if (sub) text(ctx, sub, r.x + r.w / 2, r.y + r.h / 2 + 14, 12, active ? '#4a3a10' : COLORS.hudDim, 'center', 500);
}

function themeCarpets(theme) {
  // Decorative rugs per heist, in tile rects.
  if (theme === 'gallery') {
    return [
      { x: 2, y: 2, w: 9, h: 20 }, { x: 29, y: 2, w: 8, h: 20 },
    ];
  }
  if (theme === 'bank') {
    return [{ x: 2, y: 13, w: 24, h: 9 }, { x: 29, y: 2, w: 8, h: 7 }];
  }
  return [
    { x: 2, y: 2, w: 11, h: 9 }, { x: 28, y: 14, w: 9, h: 8 },
  ];
}

function renderStatic(world) {
  const c = makeCanvas(VIEW_W, VIEW_H);
  const ctx = c.getContext('2d');
  // Floor checker.
  for (let ty = 0; ty < ROWS; ty += 1) {
    for (let tx = 0; tx < COLS; tx += 1) {
      ctx.fillStyle = (tx + ty) % 2 === 0 ? COLORS.floorA : COLORS.floorB;
      ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
    }
  }
  // Carpets.
  for (const r of themeCarpets(world.theme)) {
    ctx.fillStyle = COLORS.carpet;
    ctx.fillRect(r.x * TILE, r.y * TILE, r.w * TILE, r.h * TILE);
    ctx.strokeStyle = 'rgba(255, 211, 77, 0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x * TILE + 4, r.y * TILE + 4, r.w * TILE - 8, r.h * TILE - 8);
  }
  // Walls with a lit top edge.
  for (let ty = 0; ty < ROWS; ty += 1) {
    for (let tx = 0; tx < COLS; tx += 1) {
      if (!isWall(world, tx, ty)) continue;
      ctx.fillStyle = COLORS.wall;
      ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
      ctx.fillStyle = COLORS.wallTop;
      ctx.fillRect(tx * TILE, ty * TILE, TILE, 6);
      ctx.strokeStyle = COLORS.wallEdge;
      ctx.lineWidth = 1;
      ctx.strokeRect(tx * TILE + 0.5, ty * TILE + 0.5, TILE - 1, TILE - 1);
    }
  }
  return c;
}

function getStatic(world) {
  if (staticCache.world !== world) {
    staticCache = { world, canvas: renderStatic(world) };
  }
  return staticCache.canvas;
}

function getVignette() {
  if (vignetteCache) return vignetteCache;
  const c = makeCanvas(VIEW_W, VIEW_H);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(
    VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.42, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.78,
  );
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  vignetteCache = c;
  return c;
}

function drawCone(ctx, world, ox, oy, angle, fov, range, fill, edge) {
  const poly = conePolygon(world, ox, oy, angle, fov, range);
  ctx.beginPath();
  ctx.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i += 1) ctx.lineTo(poly[i].x, poly[i].y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawDoor(ctx, world, d) {
  const cx = d.x;
  const cy = d.y;
  if (d.open) {
    ctx.fillStyle = '#10142a';
    ctx.fillRect(cx - 14, cy - 14, 28, 28);
    ctx.strokeStyle = '#565f8c';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - 15, cy - 15, 30, 30);
    return;
  }
  // Locked: heavy slab, gold lock, red light.
  ctx.fillStyle = d.vault ? '#4d5468' : '#2c3352';
  ctx.fillRect(cx - 15, cy - 15, 30, 30);
  ctx.strokeStyle = '#0e1120';
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - 15, cy - 15, 30, 30);
  ctx.fillStyle = '#ffd34d';
  ctx.beginPath();
  ctx.arc(cx, cy - 2, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(cx - 2, cy + 2, 4, 7);
  if (d.vault) {
    ctx.strokeStyle = '#8b93b5';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 11, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#ff4040';
  ctx.beginPath();
  ctx.arc(cx + 11, cy - 11, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawLoot(ctx, item, time) {
  const { x, y } = item;
  const pulse = 0.75 + Math.sin(time * 3 + x) * 0.25;
  ctx.save();
  ctx.globalAlpha = 0.35 * pulse;
  ctx.fillStyle = COLORS.loot;
  ctx.beginPath();
  ctx.arc(x, y, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (item.kind === 'painting') {
    ctx.fillStyle = '#7a5c2e';
    ctx.fillRect(x - 11, y - 8, 22, 16);
    ctx.fillStyle = '#3f7fb5';
    ctx.fillRect(x - 8, y - 5, 16, 10);
    ctx.strokeStyle = '#ffd34d';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 11, y - 8, 22, 16);
  } else if (item.kind === 'jewel') {
    ctx.fillStyle = '#7fe7ff';
    ctx.beginPath();
    ctx.moveTo(x, y - 9);
    ctx.lineTo(x + 8, y);
    ctx.lineTo(x, y + 9);
    ctx.lineTo(x - 8, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x - 2, y - 3, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (item.kind === 'cash') {
    ctx.fillStyle = '#39d98a';
    ctx.fillRect(x - 10, y - 6, 20, 12);
    ctx.fillStyle = '#0f7a44';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (item.kind === 'gold') {
    ctx.fillStyle = '#ffd34d';
    for (let i = -1; i <= 1; i += 1) {
      ctx.beginPath();
      ctx.moveTo(x + i * 7 - 5, y + 5);
      ctx.lineTo(x + i * 7 - 3, y - 4);
      ctx.lineTo(x + i * 7 + 3, y - 4);
      ctx.lineTo(x + i * 7 + 5, y + 5);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawTarget(ctx, t, time) {
  const { x, y } = t;
  const pulse = 1 + Math.sin(time * 4) * 0.12;
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = COLORS.target;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, 26 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = COLORS.target;
  ctx.beginPath();
  ctx.arc(x, y, 24 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (t.kind === 'painting') {
    ctx.fillStyle = '#8a6a35';
    ctx.fillRect(x - 13, y - 10, 26, 20);
    ctx.fillStyle = '#5db4e6';
    ctx.fillRect(x - 10, y - 7, 20, 14);
    ctx.fillStyle = '#e8ecff';
    ctx.fillRect(x - 4, y - 7, 8, 14);
    ctx.strokeStyle = '#ffd34d';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 13, y - 10, 26, 20);
  } else if (t.kind === 'gold') {
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.moveTo(x - 12, y + 8);
    ctx.lineTo(x - 8, y - 8);
    ctx.lineTo(x + 8, y - 8);
    ctx.lineTo(x + 12, y + 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff3c4';
    ctx.fillRect(x - 6, y - 5, 12, 3);
  } else {
    // diamond
    ctx.fillStyle = '#ff8fb8';
    ctx.beginPath();
    ctx.moveTo(x, y - 13);
    ctx.lineTo(x + 12, y - 2);
    ctx.lineTo(x, y + 13);
    ctx.lineTo(x - 12, y - 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 12, y - 2);
    ctx.lineTo(x + 12, y - 2);
    ctx.moveTo(x, y - 13);
    ctx.lineTo(x, y + 13);
    ctx.stroke();
  }
  text(ctx, '★', x, y - 34, 16, COLORS.target);
}

function drawGuard(ctx, g, time) {
  const bob = Math.sin(time * 6 + g.bob) * 1.5;
  // Body: uniform circle, cap, facing tick.
  ctx.fillStyle = '#1d2340';
  ctx.beginPath();
  ctx.arc(g.x, g.y + 2, GUARD_RADIUS + 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = g.state === 'alert' ? '#ff4040' : COLORS.guard;
  ctx.beginPath();
  ctx.arc(g.x, g.y + bob * 0.3, GUARD_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2b3358';
  ctx.beginPath();
  ctx.arc(g.x, g.y + bob * 0.3 - 3, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e8ecff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(g.x, g.y + bob * 0.3);
  ctx.lineTo(g.x + Math.cos(g.angle) * 15, g.y + bob * 0.3 + Math.sin(g.angle) * 15);
  ctx.stroke();
  // Awareness arc + state mark.
  if (g.state === 'alert') {
    text(ctx, '!', g.x, g.y - 26, 22, '#ff4040');
  } else if (g.state === 'suspicious' || g.state === 'search') {
    text(ctx, '?', g.x, g.y - 26, 20, '#ffb020');
  }
  if (g.awareness > 0.05 && g.state !== 'alert') {
    ctx.strokeStyle = '#ffb020';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(g.x, g.y + bob * 0.3, GUARD_RADIUS + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * g.awareness);
    ctx.stroke();
  }
}

const GUARD_RADIUS = 12;

function drawCamera(ctx, cam, time) {
  const disabled = cam.disabled > 0;
  ctx.fillStyle = disabled ? '#3a415c' : '#20263f';
  ctx.beginPath();
  ctx.arc(cam.x, cam.y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = disabled ? '#565f8c' : '#5ac8ff';
  ctx.lineWidth = 2;
  ctx.stroke();
  const lx = cam.x + Math.cos(cam.angle) * 12;
  const ly = cam.y + Math.sin(cam.angle) * 12;
  ctx.fillStyle = disabled ? '#565f8c' : (cam.seesPlayer ? '#ff4040' : '#5ac8ff');
  ctx.beginPath();
  ctx.arc(lx, ly, 4, 0, Math.PI * 2);
  ctx.fill();
  if (cam.seesPlayer && !disabled) {
    text(ctx, '!', cam.x, cam.y - 22, 18, '#ff4040');
  }
}

function drawPlayer(ctx, p, time) {
  const bob = p.moving ? Math.sin(time * 10) * 1.5 : 0;
  // Soft light around the thief.
  const glow = ctx.createRadialGradient(p.x, p.y, 6, p.x, p.y, 70);
  glow.addColorStop(0, 'rgba(255, 240, 200, 0.10)');
  glow.addColorStop(1, 'rgba(255, 240, 200, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 70, 0, Math.PI * 2);
  ctx.fill();
  // Cloak + hood + mask.
  ctx.fillStyle = '#12172e';
  ctx.beginPath();
  ctx.arc(p.x, p.y + 2 + bob * 0.3, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#232a45';
  ctx.beginPath();
  ctx.arc(p.x, p.y + bob * 0.3, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.player;
  ctx.beginPath();
  ctx.arc(p.x + Math.cos(p.angle) * 4, p.y + Math.sin(p.angle) * 4 + bob * 0.3, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#12172e';
  ctx.fillRect(p.x + Math.cos(p.angle) * 4 - 4, p.y + Math.sin(p.angle) * 4 - 2 + bob * 0.3, 8, 4);
  // Sneak = crouched ring; sprint = motion ticks.
  if (p.stance === 'sneak') {
    ctx.strokeStyle = 'rgba(232, 236, 255, 0.5)';
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 17, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawExit(ctx, exit, time) {
  const pulse = 0.7 + Math.sin(time * 3) * 0.3;
  ctx.save();
  ctx.globalAlpha = 0.3 * pulse;
  ctx.fillStyle = COLORS.exit;
  ctx.fillRect(exit.x - 16, exit.y - 16, 32, 32);
  ctx.restore();
  ctx.strokeStyle = COLORS.exit;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(exit.x - 15, exit.y - 15, 30, 30);
  text(ctx, 'EXIT', exit.x, exit.y - 24, 11, COLORS.exit);
}

function drawSmoke(ctx, clouds) {
  for (const s of clouds) {
    const g = ctx.createRadialGradient(s.x, s.y, 4, s.x, s.y, s.radius);
    g.addColorStop(0, 'rgba(205, 210, 228, 0.55)');
    g.addColorStop(1, 'rgba(205, 210, 228, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function alarmColor(alarm) {
  if (alarm < 35) return COLORS.alarmLow;
  if (alarm < 70) return COLORS.alarmMid;
  return COLORS.alarmHigh;
}

function drawHUD(ctx, game) {
  ctx.fillStyle = COLORS.hud;
  ctx.fillRect(0, 0, VIEW_W, 46);
  ctx.fillStyle = '#2a3049';
  ctx.fillRect(0, 46, VIEW_W, 2);
  text(ctx, `${game.levelDef.name}  ·  Heist ${game.levelIndex + 1}/3`, 16, 24, 15, COLORS.hudText, 'left');
  text(ctx, `LOOT  $${game.levelLoot.toLocaleString()}`, 330, 24, 15, COLORS.loot, 'left');
  // Alarm meter.
  const ax = 560;
  text(ctx, 'ALARM', ax, 24, 13, game.alarm > 55 ? '#ff8080' : COLORS.hudDim, 'left');
  ctx.fillStyle = '#1a1f38';
  roundRect(ctx, ax + 62, 14, 220, 20, 6);
  ctx.fill();
  ctx.fillStyle = alarmColor(game.alarm);
  const w = Math.max(0, Math.min(1, game.alarm / 100)) * 216;
  if (w > 2) {
    roundRect(ctx, ax + 64, 16, w, 16, 5);
    ctx.fill();
  }
  ctx.strokeStyle = '#4a5478';
  ctx.lineWidth = 1;
  roundRect(ctx, ax + 62, 14, 220, 20, 6);
  ctx.stroke();
  if (game.lockdown > 0) {
    text(ctx, `LOCKDOWN ${Math.ceil(game.lockdown)}s`, ax + 300, 24, 14, '#ff4040', 'left');
  }
  // Tools + timer + score, right side.
  const tools = `◉ Smoke ×${game.smokeCharges}    ⚡ EMP ×${game.empCharges}`;
  text(ctx, tools, VIEW_W - 330, 24, 14, COLORS.hudText, 'left');
  const mm = Math.floor(game.time / 60);
  const ss = Math.floor(game.time % 60).toString().padStart(2, '0');
  text(ctx, `${mm}:${ss}   SCORE $${game.runScore.toLocaleString()}`, VIEW_W - 16, 24, 14, COLORS.hudText, 'right');

  // Bottom hint bar.
  ctx.fillStyle = 'rgba(8, 10, 22, 0.72)';
  ctx.fillRect(0, VIEW_H - 34, VIEW_W, 34);
  let hint = 'WASD / arrows — move   ·   Shift — sprint (loud)   ·   C — sneak   ·   Hold E — grab / pick locks   ·   Q — smoke   ·   F — EMP   ·   P — pause   ·   M — mute';
  if (game.hint) hint = game.hint;
  else if (game.target && !game.target.taken) hint = `Objective: steal the ${game.target.name} — then reach the green EXIT.`;
  else if (game.target && game.target.taken) hint = 'Got it! Reach the green EXIT before the alarm peaks.';
  text(ctx, hint, VIEW_W / 2, VIEW_H - 17, 14, COLORS.hudDim);

  // Toast message.
  if (game.messageTime > 0 && game.message) {
    ctx.fillStyle = 'rgba(8, 10, 22, 0.85)';
    const mw = ctx.measureText(game.message).width + 36;
    roundRect(ctx, VIEW_W / 2 - mw / 2, 58, mw, 34, 8);
    ctx.fill();
    text(ctx, game.message, VIEW_W / 2, 76, 15, COLORS.hudText);
  }

  // Channel / pick progress ring over the thief.
  const p = game.player;
  if (p && (p.targetProgress > 0 || p.pickProgress > 0)) {
    const prog = Math.max(p.targetProgress, p.pickProgress);
    ctx.strokeStyle = '#ffd34d';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog);
    ctx.stroke();
    text(ctx, p.targetProgress > 0 ? 'CUTTING…' : 'PICKING…', p.x, p.y - 32, 12, '#ffd34d');
  }
}

function dim(ctx, alpha) {
  ctx.fillStyle = `rgba(5, 7, 16, ${alpha})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(10, 13, 28, 0.94)';
  roundRect(ctx, x, y, w, h, 16);
  ctx.fill();
  ctx.strokeStyle = '#4a5478';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawTitle(ctx, game) {
  dim(ctx, 0.62);
  text(ctx, 'THE HALCYON HEIST', VIEW_W / 2, 150, 58, '#ffd34d');
  text(ctx, 'Three jobs. One thief. No alarms — if you play it right.', VIEW_W / 2, 205, 19, COLORS.hudText, 'center', 500);
  text(ctx, 'A stealth heist in three acts: the gallery, the bank, the penthouse.', VIEW_W / 2, 234, 15, COLORS.hudDim, 'center', 500);
  text(ctx, 'Read the cones. Spend your tools. Take the prize and vanish.', VIEW_W / 2, 262, 15, COLORS.hudDim, 'center', 500);
  text(ctx, 'DIFFICULTY', VIEW_W / 2, 420, 14, COLORS.hudDim);
  const b = layoutButtons();
  for (const d of b.diff) {
    button(ctx, d, d.key.toUpperCase(), null, game.difficultyKey === d.key, false);
  }
  button(ctx, b.start, 'START THE HEIST', 'Enter ↵', false, false);
  button(ctx, b.howto, 'HOW TO PLAY', null, false, false);
  text(ctx, 'Best played with keyboard + mouse · sound on for the full tension', VIEW_W / 2, 716, 13, COLORS.hudDim, 'center', 500);
  text(ctx, 'An original game built for make.fun — no borrowed art, music or levels.', VIEW_W / 2, 742, 13, COLORS.hudDim, 'center', 500);
}

function drawHowto(ctx, game) {
  dim(ctx, 0.7);
  panel(ctx, VIEW_W / 2 - 340, 90, 680, 560);
  text(ctx, 'HOW TO PLAY', VIEW_W / 2, 130, 30, '#ffd34d');
  const lines = [
    ['MOVE', 'WASD or arrow keys — or click anywhere to walk there.'],
    ['SPRINT', 'Hold Shift to run. Fast, but guards hear you.'],
    ['SNEAK', 'Hold C to creep. Slow, silent, spotted much later.'],
    ['GRAB LOOT', 'Walk over small loot to pocket it.'],
    ['THE PRIZE', 'Hold E beside the ★ target to cut it free (1.5s).'],
    ['LOCKS', 'Hold E at a locked door to pick it. Picking is noisy.'],
    ['SMOKE  [Q]', 'A cloud that blinds every guard for 6s. 2 per heist.'],
    ['EMP  [F]', 'Kills every camera for 8s. 2 per heist.'],
    ['ALARM', 'Seen by a guard or camera, the meter climbs. At 100%'],
    ['', 'LOCKDOWN starts: every guard hunts you for 12 seconds.'],
    ['CAUGHT', 'A chasing guard that touches you ends the heist.'],
    ['WIN', 'Take the prize, reach the green EXIT. GHOST rank if'],
    ['', 'the alarm never passes 25% and nobody spots you.'],
  ];
  let y = 176;
  for (const [k, v] of lines) {
    if (k) text(ctx, k, VIEW_W / 2 - 310, y, 15, '#ffd34d', 'left');
    text(ctx, v, VIEW_W / 2 - 180, y, 15, COLORS.hudText, 'left', 500);
    y += 30;
  }
  button(ctx, layoutButtons().back, 'BACK', null, false, false);
}

function drawPaused(ctx) {
  dim(ctx, 0.6);
  text(ctx, 'PAUSED', VIEW_W / 2, 330, 48, COLORS.hudText);
  text(ctx, 'P / Enter — resume      R — restart heist      T — title', VIEW_W / 2, 400, 16, COLORS.hudDim, 'center', 500);
}

function drawCaught(ctx, game) {
  dim(ctx, 0.55);
  ctx.fillStyle = 'rgba(120, 10, 10, 0.35)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  text(ctx, 'BUSTED!', VIEW_W / 2, 300, 64, '#ff4040');
  text(ctx, `A guard caught you in the ${game.levelDef.name}. The crew is already gone.`, VIEW_W / 2, 370, 18, COLORS.hudText, 'center', 500);
  text(ctx, `Loot kept: $${game.levelLoot.toLocaleString()}  ·  Alarm peaked at ${Math.round(game.maxAlarm)}%`, VIEW_W / 2, 404, 15, COLORS.hudDim, 'center', 500);
  button(ctx, layoutButtons().retry, 'TRY AGAIN', 'Enter ↵', false, false);
  text(ctx, 'T — back to title', VIEW_W / 2, 650, 14, COLORS.hudDim, 'center', 500);
}

function drawLevelClear(ctx, game) {
  dim(ctx, 0.6);
  panel(ctx, VIEW_W / 2 - 300, 180, 600, 380);
  const r = game.levelResult;
  text(ctx, `${r.name} — CLEAN GETAWAY`, VIEW_W / 2, 226, 26, COLORS.exit);
  text(ctx, `RANK  ${r.rank}`, VIEW_W / 2, 272, 22, r.rank === 'GHOST' ? '#7fe7ff' : r.rank === 'SHADOW' ? '#ffd34d' : '#ff8a5c');
  const rows = [
    ['Loot lifted', `$${r.loot.toLocaleString()}`],
    ['Time bonus', `+$${r.timeBonus.toLocaleString()}`],
    ['Ghost bonus', r.ghostBonus > 0 ? `+$${r.ghostBonus.toLocaleString()}` : '—'],
    ['Heist total', `$${r.total.toLocaleString()}`],
    ['Time', `${Math.floor(r.time / 60)}:${Math.floor(r.time % 60).toString().padStart(2, '0')}  ·  alarm peaked ${r.maxAlarm}%`],
    ['Run score', `$${game.runScore.toLocaleString()}`],
  ];
  let y = 318;
  for (const [k, v] of rows) {
    text(ctx, k, VIEW_W / 2 - 260, y, 16, COLORS.hudDim, 'left', 500);
    text(ctx, v, VIEW_W / 2 + 260, y, 16, COLORS.hudText, 'right');
    y += 34;
  }
  button(ctx, layoutButtons().next, game.levelIndex + 1 < 3 ? 'NEXT HEIST' : 'SEE THE SCORE', 'Enter ↵', false, false);
}

function drawWin(ctx, game) {
  dim(ctx, 0.65);
  panel(ctx, VIEW_W / 2 - 320, 170, 640, 420);
  const r = game.finalResult;
  text(ctx, 'THE HALCYON STAR IS YOURS', VIEW_W / 2, 220, 30, '#ffd34d');
  text(ctx, `FINAL RANK  ${r.rank}`, VIEW_W / 2, 268, 24, r.rank === 'GHOST' ? '#7fe7ff' : r.rank === 'SHADOW' ? '#ffd34d' : '#ff8a5c');
  text(ctx, `TOTAL SCORE  $${r.score.toLocaleString()}`, VIEW_W / 2, 320, 22, COLORS.hudText);
  const mm = Math.floor(r.time / 60);
  const ss = Math.floor(r.time % 60).toString().padStart(2, '0');
  text(ctx, `Three heists in ${mm}:${ss}  ·  spotted ${r.spotted} time${r.spotted === 1 ? '' : 's'}`, VIEW_W / 2, 360, 16, COLORS.hudDim, 'center', 500);
  text(ctx, 'Every guard outplayed. Every camera blind. Every prize lifted.', VIEW_W / 2, 396, 15, COLORS.hudText, 'center', 500);
  text(ctx, 'Rook retires tonight — rich, and never seen.', VIEW_W / 2, 424, 15, COLORS.hudDim, 'center', 500);
  button(ctx, layoutButtons().again, 'RUN IT AGAIN', 'Enter ↵', false, false);
  text(ctx, 'T — back to title', VIEW_W / 2, 700, 14, COLORS.hudDim, 'center', 500);
}

export function render(ctx, game, time) {
  const world = game.world;
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  ctx.drawImage(getStatic(world), 0, 0);

  // Exit + doors under the cones.
  drawExit(ctx, game.exit, time);
  for (const d of world.doors) drawDoor(ctx, world, d);

  // Vision cones: cameras first (cyan), then guards by state.
  for (const cam of game.cameras) {
    if (cam.disabled > 0) continue;
    drawCone(ctx, world, cam.x, cam.y, cam.angle, cam.fov, cam.range, COLORS.camCone, COLORS.camConeEdge);
  }
  for (const g of game.guards) {
    const fill = g.state === 'alert' ? COLORS.coneAlert : g.state === 'patrol' ? COLORS.coneCalm : COLORS.coneSuspect;
    const edge = g.state === 'alert' ? 'rgba(255,64,64,0.6)' : g.state === 'patrol' ? COLORS.coneCalmEdge : 'rgba(255,150,50,0.6)';
    drawCone(ctx, world, g.x, g.y, g.angle, g.fov, g.viewRange, fill, edge);
  }

  // Loot, target, smoke, actors.
  for (const item of game.loot) if (!item.taken) drawLoot(ctx, item, time);
  if (!game.target.taken) drawTarget(ctx, game.target, time);
  drawSmoke(ctx, game.smoke);
  for (const cam of game.cameras) drawCamera(ctx, cam, time);
  for (const g of game.guards) drawGuard(ctx, g, time);
  if (game.screen !== 'title' && game.screen !== 'howto') drawPlayer(ctx, game.player, time);

  ctx.drawImage(getVignette(), 0, 0);

  // Red flash when spotted.
  if (game.flash > 0) {
    ctx.fillStyle = `rgba(255, 40, 40, ${Math.min(0.25, game.flash * 0.4)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  // Lockdown strobe border.
  if (game.lockdown > 0 && Math.floor(time * 4) % 2 === 0) {
    ctx.strokeStyle = 'rgba(255, 64, 64, 0.8)';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, VIEW_W - 6, VIEW_H - 6);
  }

  if (game.screen === 'playing' || game.screen === 'paused') drawHUD(ctx, game);
  if (game.screen === 'title') drawTitle(ctx, game);
  else if (game.screen === 'howto') drawHowto(ctx, game);
  else if (game.screen === 'paused') drawPaused(ctx);
  else if (game.screen === 'caught') drawCaught(ctx, game);
  else if (game.screen === 'levelClear') drawLevelClear(ctx, game);
  else if (game.screen === 'win') drawWin(ctx, game);
}
