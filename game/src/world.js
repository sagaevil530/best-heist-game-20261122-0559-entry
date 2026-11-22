// The level world: a tile grid built from a level definition, plus the
// collision, line-of-sight and vision-cone geometry the game runs on.
import { TILE, COLS, ROWS, tileCenter, clamp } from './config.js';

// Cell kinds: 0 floor, 1 wall, 2 door (passable when open).
export function buildWorld(level, difficulty, levelIndex) {
  const grid = new Uint8Array(COLS * ROWS);
  const at = (x, y) => grid[y * COLS + x];

  // Border walls.
  for (let x = 0; x < COLS; x += 1) { grid[x] = 1; grid[(ROWS - 1) * COLS + x] = 1; }
  for (let y = 0; y < ROWS; y += 1) { grid[y * COLS] = 1; grid[y * COLS + COLS - 1] = 1; }

  for (const w of level.walls) {
    for (let y = w.y; y < w.y + w.h; y += 1) {
      for (let x = w.x; x < w.x + w.w; x += 1) grid[y * COLS + x] = 1;
    }
  }

  const doors = level.doors.map((d) => ({
    tx: d.x, ty: d.y,
    x: d.x * TILE + TILE / 2, y: d.y * TILE + TILE / 2,
    locked: !!d.locked, open: !d.locked, vault: !!d.vault,
    pickTime: d.pickTime || 2.5, pick: 0,
  }));
  for (const d of doors) grid[d.ty * COLS + d.tx] = 2;

  const world = {
    level, levelIndex, grid, doors,
    theme: level.theme,
    // Difficulty + level scaling, applied once here.
    guardSpeedMul: difficulty.guardSpeed * (1 + 0.06 * levelIndex),
    viewRangeMul: difficulty.viewRange * (1 + 0.04 * levelIndex),
    alarmMul: difficulty.alarm,
    awareMul: difficulty.aware,
  };
  return world;
}

export function isWall(world, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return true;
  return world.grid[ty * COLS + tx] === 1;
}

export function isDoor(world, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return null;
  if (world.grid[ty * COLS + tx] !== 2) return null;
  return world.doors.find((d) => d.tx === tx && d.ty === ty) || null;
}

// True when the tile at pixel (x, y) blocks movement for a circle of radius r.
export function circleHitsWall(world, x, y, r) {
  const minTx = Math.floor((x - r) / TILE);
  const maxTx = Math.floor((x + r) / TILE);
  const minTy = Math.floor((y - r) / TILE);
  const maxTy = Math.floor((y + r) / TILE);
  for (let ty = minTy; ty <= maxTy; ty += 1) {
    for (let tx = minTx; tx <= maxTx; tx += 1) {
      let blocked = isWall(world, tx, ty);
      if (!blocked) {
        const door = isDoor(world, tx, ty);
        if (door && !door.open) blocked = true;
      }
      if (!blocked) continue;
      const cx = clamp(x, tx * TILE, tx * TILE + TILE);
      const cy = clamp(y, ty * TILE, ty * TILE + TILE);
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy < r * r) return true;
    }
  }
  return false;
}

// Move a circle, sliding along walls. When a step is blocked, try a small
// perpendicular nudge first: without it a thief hugging a wall snags on
// every corner and cannot turn away from it.
export function moveCircle(world, x, y, r, dx, dy) {
  let nx = x;
  let ny = y;
  if (dx !== 0) {
    if (!circleHitsWall(world, x + dx, y, r)) {
      nx = x + dx;
    } else {
      for (let n = 1; n <= r; n += 1) {
        if (!circleHitsWall(world, x + dx, y - n, r)) { nx = x + dx; ny = y - n; break; }
        if (!circleHitsWall(world, x + dx, y + n, r)) { nx = x + dx; ny = y + n; break; }
      }
    }
  }
  if (dy !== 0) {
    if (!circleHitsWall(world, nx, ny + dy, r)) {
      ny = ny + dy;
    } else {
      for (let n = 1; n <= r; n += 1) {
        if (!circleHitsWall(world, nx - n, ny + dy, r)) { nx -= n; ny = ny + dy; break; }
        if (!circleHitsWall(world, nx + n, ny + dy, r)) { nx += n; ny = ny + dy; break; }
      }
    }
  }
  return { x: nx, y: ny };
}

// Line of sight: sample the segment; blocked by any wall or closed door.
export function hasLineOfSight(world, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(d / 4));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const x = ax + dx * t;
    const y = ay + dy * t;
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (isWall(world, tx, ty)) return false;
    const door = isDoor(world, tx, ty);
    if (door && !door.open) return false;
  }
  return true;
}

// Distance from (ox, oy) along angle until a wall, a closed door or range.
export function castRay(world, ox, oy, angle, range) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const step = 4;
  let d = step;
  while (d < range) {
    const x = ox + dx * d;
    const y = oy + dy * d;
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (isWall(world, tx, ty)) return d;
    const door = isDoor(world, tx, ty);
    if (door && !door.open) return d;
    d += step;
  }
  return range;
}

// Vision cone polygon: origin plus the ray endpoints across the field.
export function conePolygon(world, ox, oy, angle, fov, range) {
  const rays = 26;
  const pts = [{ x: ox, y: oy }];
  for (let i = 0; i <= rays; i += 1) {
    const a = angle - fov + (2 * fov * i) / rays;
    const d = castRay(world, ox, oy, a, range);
    pts.push({ x: ox + Math.cos(a) * d, y: oy + Math.sin(a) * d });
  }
  return pts;
}

// Is pixel (x, y) inside the watcher's cone (range, angle, walls)?
export function inCone(world, ox, oy, angle, fov, range, x, y) {
  const dx = x - ox;
  const dy = y - oy;
  const d = Math.hypot(dx, dy);
  if (d > range || d < 1) return false;
  let diff = Math.atan2(dy, dx) - angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) > fov) return false;
  return hasLineOfSight(world, ox, oy, x, y);
}

export { tileCenter };
