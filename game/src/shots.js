// Staged screenshot scenes and the self-test autopilot. Every scene is the
// real game stepped forward with real rules — the autopilot only presses the
// same keys a player would — so each screenshot is a genuine render.
import { TILE, COLS, ROWS, STEP, tileCenter, dist } from './config.js';
import { isWall, isDoor, inCone, hasLineOfSight } from './world.js';

// Cost-aware path over tiles (Dijkstra). Locked doors count as passable: the
// pilot picks them when it reaches one. Tiles near a guard's patrol cost
// extra, so the route prefers quiet corridors over a patrol's beat.
function findPath(world, guards, fromTx, fromTy, toTx, toTy) {
  const key = (x, y) => y * COLS + x;
  const nearPatrol = new Set();
  for (const g of guards) {
    for (const pt of g.path) {
      const px = Math.floor(pt.x / TILE);
      const py = Math.floor(pt.y / TILE);
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          nearPatrol.add(key(px + dx, py + dy));
        }
      }
    }
  }
  const cost = new Map([[key(fromTx, fromTy), 0]]);
  const prev = new Map([[key(fromTx, fromTy), null]]);
  const open = [[0, fromTx, fromTy]];
  while (open.length > 0) {
    let bi = 0;
    for (let i = 1; i < open.length; i += 1) if (open[i][0] < open[bi][0]) bi = i;
    const [c, x, y] = open.splice(bi, 1)[0];
    if (c > (cost.get(key(x, y)) ?? Infinity)) continue;
    if (x === toTx && y === toTy) {
      const path = [];
      let cur = [x, y];
      while (cur) {
        path.unshift(cur);
        cur = prev.get(key(cur[0], cur[1]));
      }
      return path;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      if (isWall(world, nx, ny)) continue;
      const door = isDoor(world, nx, ny);
      if (door && !door.open && !door.locked) continue;
      const stepCost = (door && door.locked && !door.open ? 6 : 1)
        + (nearPatrol.has(key(nx, ny)) ? 2.5 : 0);
      const nc = c + stepCost;
      if (nc < (cost.get(key(nx, ny)) ?? Infinity)) {
        cost.set(key(nx, ny), nc);
        prev.set(key(nx, ny), [x, y]);
        open.push([nc, nx, ny]);
      }
    }
  }
  return null;
}

function pointInAnyCone(game, x, y) {
  const world = game.world;
  for (const g of game.guards) {
    if (inCone(world, g.x, g.y, g.angle, g.fov, g.viewRange, x, y)) return true;
  }
  for (const c of game.cameras) {
    if (c.disabled > 0) continue;
    if (inCone(world, c.x, c.y, c.angle, c.fov, c.range, x, y)) return true;
  }
  return false;
}

function watcherSeesTile(game, tx, ty) {
  const p = tileCenter(tx, ty);
  return pointInAnyCone(game, p.x, p.y);
}

// The autopilot: follows a BFS path to the target, then the exit, waiting
// out vision cones, fleeing when a guard gives chase, and spending smoke
// when it must be seen.
export function makeAutopilot(game) {
  const pilot = {
    path: null,
    pathIndex: 0,
    objective: null,
    waitTime: 0,
    fleeTime: 0,
    channelWait: 0,
    pickWait: 0,
    anchor: null,
    repath() {
      const p = game.player;
      const fromTx = Math.floor(p.x / TILE);
      const fromTy = Math.floor(p.y / TILE);
      let to;
      if (!game.target.taken) to = { tx: Math.floor(game.target.x / TILE), ty: Math.floor(game.target.y / TILE) };
      else to = { tx: game.exit.tx, ty: game.exit.ty };
      const key = `${to.tx},${to.ty}`;
      if (pilot.objective === key && pilot.path) return;
      pilot.objective = key;
      pilot.path = findPath(game.world, game.guards, fromTx, fromTy, to.tx, to.ty);
      pilot.pathIndex = 0;
    },
    // Nearest guard that is actively hunting the thief — an alert guard, a
    // suspicious one, or a searching one that is already close.
    hunter() {
      const p = game.player;
      let best = null;
      let bestD = Infinity;
      for (const g of game.guards) {
        if (g.state === 'patrol') continue;
        if (g.state === 'search') {
          const d = dist(g.x, g.y, p.x, p.y);
          if (d > 160) continue;
        }
        const d = dist(g.x, g.y, p.x, p.y);
        if (d < bestD) { bestD = d; best = g; }
      }
      return best ? { guard: best, dist: bestD } : null;
    },
    // Which watcher currently has the thief inside its cone? None, while the
    // thief is hidden in a smoke cloud — the watcher cannot see it at all.
    watcherOnMe() {
      const p = game.player;
      if (game.smoke.some((s) => dist(p.x, p.y, s.x, s.y) < s.radius)) return null;
      const world = game.world;
      for (const g of game.guards) {
        if (inCone(world, g.x, g.y, g.angle, g.fov, g.viewRange, p.x, p.y)) return g;
      }
      for (const c of game.cameras) {
        if (c.disabled > 0) continue;
        if (inCone(world, c.x, c.y, c.angle, c.fov, c.range, p.x, p.y)) return c;
      }
      return null;
    },
    moveToward(input, tx, ty, sprint) {
      const p = game.player;
      const dx = tx - p.x;
      const dy = ty - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 4) return;
      if (Math.abs(dx) > 2) input[dx > 0 ? 'right' : 'left'] = true;
      if (Math.abs(dy) > 2) input[dy > 0 ? 'down' : 'up'] = true;
      if (sprint) { input.sprint = true; input.sneak = false; }
    },
    step() {
      const input = {
        up: false, down: false, left: false, right: false,
        sprint: false, sneak: true, interact: false,
        smokePressed: false, empPressed: false,
        pausePressed: false, confirmPressed: false,
        restartPressed: false, mutePressed: false, titlePressed: false,
        diffKey: null, mouseX: 0, mouseY: 0, mouseClicked: false,
      };
      const p = game.player;
      if (!p || game.screen !== 'playing') return input;
      pilot.repath();
      if (!pilot.path || pilot.path.length === 0) return input;

      // A hunter is closing in: drop smoke if it is close, then run. Never
      // stand still while being chased, and never flee into a wall: score
      // eight escape directions and take the best one. But if the thief is
      // already hidden inside a smoke cloud, the hunter is only guessing:
      // stay put and keep working instead of running out into the open.
      const inSmoke = game.smoke.some((s) => dist(p.x, p.y, s.x, s.y) < s.radius);
      const hunt = inSmoke ? null : pilot.hunter();
      if (inSmoke) pilot.fleeTime = 0;
      if (hunt && hunt.dist < 260) {
        pilot.fleeTime = 1.2;
        if (hunt.dist < 130 && game.smokeCharges > 0 && game.smoke.length === 0) {
          input.smokePressed = true;
        }
      }
      if (pilot.fleeTime > 0) {
        pilot.fleeTime -= STEP;
        const h = hunt ? hunt.guard : (pilot.hunter() || {}).guard;
        if (h) {
          let bestScore = -Infinity;
          let bestDir = null;
          for (let k = 0; k < 8; k += 1) {
            const a = (k / 8) * Math.PI * 2;
            const tx = p.x + Math.cos(a) * 70;
            const ty = p.y + Math.sin(a) * 70;
            if (tx < 40 || ty < 60 || tx > 1240 || ty > 760) continue;
            if (isWall(game.world, Math.floor(tx / TILE), Math.floor(ty / TILE))) continue;
            // A way out must actually be walkable: fleeing through a locked
            // door or a wall pins the thief in place while the guard closes in.
            if (!hasLineOfSight(game.world, p.x, p.y, tx, ty)) continue;
            const away = dist(tx, ty, h.x, h.y) - dist(p.x, p.y, h.x, h.y);
            const towardGoal = game.target.taken
              ? -dist(tx, ty, game.exit.x, game.exit.y) / 10
              : -dist(tx, ty, game.target.x, game.target.y) / 10;
            // Score the whole escape step, not just its end: a direction
            // that runs through a cone is no escape at all.
            const midX = p.x + Math.cos(a) * 35;
            const midY = p.y + Math.sin(a) * 35;
            const inConePenalty = (pointInAnyCone(game, tx, ty) || pointInAnyCone(game, midX, midY)) ? -60 : 0;
            const score = away + towardGoal + inConePenalty;
            if (score > bestScore) { bestScore = score; bestDir = { tx, ty }; }
          }
          if (bestDir) pilot.moveToward(input, bestDir.tx, bestDir.ty, true);
        }
        return input;
      }

      // At the target: smoke first if a watcher covers it, so the thief is
      // hidden while waiting for a quiet window — cutting is noisy and any
      // guard within earshot will come looking. Then hold E to cut it free.
      // This runs before the cone-escape below: a thief standing on the
      // target should smoke and cut, not step away from it.
      const t = game.target;
      if (!t.taken && dist(p.x, p.y, t.x, t.y) < 34) {
        const watched = watcherSeesTile(game, Math.floor(t.x / TILE), Math.floor(t.y / TILE));
        if (watched && game.smokeCharges > 0 && game.smoke.length === 0) {
          input.smokePressed = true;
          return input;
        }
        const nearGuard = game.guards.some((g) => dist(g.x, g.y, t.x, t.y) < 160);
        if (nearGuard && pilot.channelWait < 12) {
          pilot.channelWait += STEP;
          return input;
        }
        pilot.channelWait = 0;
        input.interact = true;
        return input;
      }

      // Standing inside a cone right now: step out of it, away from the watcher.
      const watcher = pilot.watcherOnMe();
      if (watcher) {
        pilot.moveToward(input, p.x + (p.x - watcher.x), p.y + (p.y - watcher.y), watcher.state === 'alert');
        return input;
      }

      // Next path node.
      while (pilot.pathIndex < pilot.path.length) {
        const [tx, ty] = pilot.path[pilot.pathIndex];
        const c = tileCenter(tx, ty);
        if (dist(p.x, p.y, c.x, c.y) < 10) pilot.pathIndex += 1;
        else break;
      }
      if (pilot.pathIndex >= pilot.path.length) return input;
      const [tx, ty] = pilot.path[pilot.pathIndex];
      const c = tileCenter(tx, ty);

      // Locked door ahead: stand at it and pick. If a camera watches the
      // door, burn the EMP first — a 4-second pick under a live camera is a
      // lockdown waiting to happen. A long vault pick with a guard in
      // earshot gets a smoke screen first: the guard hears the pick, comes
      // to look, and finds only smoke — so the guard's nearness never blocks
      // a pick that starts inside smoke.
      const door = isDoor(game.world, tx, ty);
      if (door && door.locked && !door.open) {
        if (dist(p.x, p.y, door.x, door.y) < 32) {
          const inSmoke = game.smoke.some((s) => dist(p.x, p.y, s.x, s.y) < 70);
          const guardEarshot = game.guards.some((g) => dist(g.x, g.y, door.x, door.y) < 220);
          if (door.vault && guardEarshot && game.smokeCharges > 0 && !inSmoke) {
            input.smokePressed = true;
            return input;
          }
          const guardNear = game.guards.some((g) => dist(g.x, g.y, door.x, door.y) < 100);
          if (guardNear && !inSmoke && pilot.pickWait < 10) {
            pilot.pickWait += STEP;
            return input;
          }
          pilot.pickWait = 0;
          const doorTile = tileCenter(tx, ty);
          const camOnDoor = game.cameras.some((c) => c.disabled <= 0
            && inCone(game.world, c.x, c.y, c.angle, c.fov, c.range, doorTile.x, doorTile.y));
          if (camOnDoor && game.empCharges > 0 && game.empTime <= 0) {
            input.empPressed = true;
            return input;
          }
          input.interact = true;
          return input;
        }
      }

      // Cone check: don't step into a watched spot; wait for the patrol.
      // Never wait in the open where a patrol or a sweeping camera can find
      // you: after a second, fall back to the last safe anchor and wait there.
      // A step that stays inside the smoke cloud is hidden, whatever cone
      // covers it.
      const stepX = p.x + Math.sign(c.x - p.x) * 16;
      const stepY = p.y + Math.sign(c.y - p.y) * 16;
      const stepInSmoke = game.smoke.some((s) => dist(stepX, stepY, s.x, s.y) < s.radius);
      const watched = !stepInSmoke
        && (pointInAnyCone(game, stepX, stepY) || pointInAnyCone(game, c.x, c.y));
      if (watched) {
        pilot.waitTime += STEP;
        if (pilot.waitTime > 1 && pilot.anchor && dist(p.x, p.y, pilot.anchor.x, pilot.anchor.y) > 40) {
          pilot.moveToward(input, pilot.anchor.x, pilot.anchor.y, false);
          return input;
        }
        // Waiting forever means the patrol never opens a window: after 4s,
        // sprint through it — better loud than stuck.
        if (pilot.waitTime < 4) return input;
        input.sprint = true;
        input.sneak = false;
      } else {
        pilot.waitTime = 0;
        // Remember the last genuinely safe spot: no cone on the thief, no
        // guard close by. The wait logic falls back to it.
        const nearestGuard = Math.min(...game.guards.map((g) => dist(g.x, g.y, p.x, p.y)));
        if (!pointInAnyCone(game, p.x, p.y) && nearestGuard > 220) {
          pilot.anchor = { x: p.x, y: p.y };
        }
      }

      pilot.moveToward(input, c.x, c.y, input.sprint);
      return input;
    },
  };
  return pilot;
}

function blankInput() {
  return {
    up: false, down: false, left: false, right: false, sprint: false, sneak: false,
    interact: false, smokePressed: false, empPressed: false, pausePressed: false,
    confirmPressed: false, restartPressed: false, mutePressed: false, titlePressed: false,
    diffKey: null, mouseX: 0, mouseY: 0, mouseClicked: false,
  };
}

function runSteps(game, pilot, seconds, stopWhen) {
  const steps = Math.ceil(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    game.update(pilot ? pilot.step() : blankInput());
    if (stopWhen && stopWhen(game)) return true;
  }
  return false;
}

// Stage one screenshot scene on a fresh game. Returns the game, ready to render.
export function stageShot(game, kind) {
  if (kind === 'start') {
    game.loadLevel(0);
    game.screen = 'title';
    runSteps(game, null, 4);
    game.screen = 'title';
    return game;
  }
  if (kind === 'play') {
    game.debugStart(0, 'normal');
    const pilot = makeAutopilot(game);
    runSteps(game, pilot, 24, (g) => g.screen !== 'playing');
    return game;
  }
  if (kind === 'alert') {
    game.debugStart(0, 'normal');
    const pilot = makeAutopilot(game);
    runSteps(game, pilot, 10, (g) => g.screen !== 'playing');
    // Drop the thief into the first guard's cone at spotting range, then let
    // the autopilot flee: the frame catches the chase mid-stride — red cone,
    // "!" over the guard, alarm climbing — with the thief still on its feet.
    if (game.screen === 'playing') {
      const g = game.guards[0];
      game.player.x = g.x + Math.cos(g.angle) * 130;
      game.player.y = g.y + Math.sin(g.angle) * 130;
      runSteps(game, pilot, 1.8, (gg) => gg.screen !== 'playing');
    }
    return game;
  }
  if (kind === 'win') {
    game.debugStart(0, 'normal');
    const pilot = makeAutopilot(game);
    runSteps(game, pilot, 240, (g) => g.screen === 'levelClear');
    return game;
  }
  return game;
}

// Full self-test: play all three heists with the autopilot and report.
export function selfTest(game) {
  const results = [];
  const errors = window.__errors || [];
  for (let level = 0; level < 3; level += 1) {
    game.debugStart(level, 'normal');
    const pilot = makeAutopilot(game);
    const start = performance.now();
    let won = false;
    let caught = false;
    const steps = Math.ceil(300 / STEP);
    const trace = [];
    const spots = [];
    let prevAware = game.guards.map(() => 0);
    for (let i = 0; i < steps; i += 1) {
      game.update(pilot.step());
      game.guards.forEach((g, gi) => {
        if (prevAware[gi] < 0.35 && g.awareness >= 0.35) {
          spots.push({
            t: +game.time.toFixed(2), guard: gi, state: g.state,
            gx: Math.round(g.x), gy: Math.round(g.y),
            angle: +g.angle.toFixed(2),
            px: Math.round(game.player.x), py: Math.round(game.player.y),
            stance: game.player.stance,
          });
        }
        prevAware[gi] = g.awareness;
      });
      if (i % 60 === 0) {
        const next = pilot.path && pilot.path[pilot.pathIndex];
        trace.push({
          t: +game.time.toFixed(1),
          px: Math.round(game.player.x), py: Math.round(game.player.y),
          alarm: Math.round(game.alarm),
          pathLen: pilot.path ? pilot.path.length : null,
          pathIdx: pilot.pathIndex,
          next: next ? next.join(',') : null,
          wait: +pilot.waitTime.toFixed(1),
          flee: +pilot.fleeTime.toFixed(1),
          guards: game.guards.map((g) => ({
            s: g.state, x: Math.round(g.x), y: Math.round(g.y),
            a: +g.awareness.toFixed(2),
          })),
        });
      }
      if (game.screen === 'levelClear') { won = true; break; }
      if (game.screen === 'caught') { caught = true; break; }
    }
    results.push({
      level: level + 1,
      name: game.levelDef.name,
      won, caught,
      time: +game.time.toFixed(1),
      loot: game.levelLoot,
      maxAlarm: Math.round(game.maxAlarm),
      spotted: game.levelSpotted,
      simMs: Math.round(performance.now() - start),
      trace,
      spots,
    });
    if (!won) break;
  }
  return { results, errors: errors.slice(0, 10) };
}
