// Guards and cameras: patrols, vision, suspicion, chase, and the alarm they
// feed. Guards never see through walls, smoke, or a closed door.
import {
  GUARD, CAMERA, TILE, tileCenter, clamp, angleLerp, angleDiff, dist,
} from './config.js';
import { moveCircle, hasLineOfSight, inCone } from './world.js';

export function makeGuard(def, world, index) {
  const start = tileCenter(def.path[0][0], def.path[0][1]);
  const next = def.path[1] || def.path[0];
  const n = tileCenter(next[0], next[1]);
  return {
    kind: 'guard',
    index,
    x: start.x,
    y: start.y,
    angle: Math.atan2(n.y - start.y, n.x - start.x),
    path: def.path.map(([tx, ty]) => tileCenter(tx, ty)),
    wp: 1 % def.path.length,
    pause: 0,
    state: 'patrol', // patrol | suspicious | alert | search
    awareness: 0,
    speedMul: def.speed || 1,
    viewRange: GUARD.viewRange * world.viewRangeMul,
    fov: GUARD.fov,
    spotGrace: 0,
    lastSeen: null,
    searchTime: 0,
    stuckTime: 0,
    lastX: start.x,
    lastY: start.y,
    bob: index * 1.7,
  };
}

export function makeCamera(def, world, rng) {
  return {
    kind: 'camera',
    x: def.x * TILE + TILE / 2,
    y: def.y * TILE + TILE / 2,
    baseAngle: def.angle,
    sweep: def.sweep || 0.6,
    phase: rng ? rng() * Math.PI * 2 : Math.random() * Math.PI * 2,
    angle: def.angle,
    range: CAMERA.range,
    fov: CAMERA.fov,
    disabled: 0,
    seesPlayer: false,
  };
}

// Can this watcher see the player right now? Stance matters: a sneaking
// thief is spotted later, a sprinting one sooner.
export function watcherSees(world, watcher, player, smokeClouds) {
  const range = watcher.viewRange || watcher.range;
  const stanceMul = player.stance === 'sneak' ? 0.62 : player.stance === 'sprint' ? 1.15 : 1;
  const d = dist(watcher.x, watcher.y, player.x, player.y);
  if (d > range * stanceMul) return false;
  for (const s of smokeClouds) {
    if (dist(player.x, player.y, s.x, s.y) < s.radius) return false;
  }
  return inCone(world, watcher.x, watcher.y, watcher.angle, watcher.fov, range * stanceMul, player.x, player.y);
}

function guardTargetAngle(g) {
  const t = g.path[g.wp];
  return Math.atan2(t.y - g.y, t.x - g.x);
}

export function updateGuard(world, g, player, dt, time, events) {
  const speed = GUARD.patrolSpeed * world.guardSpeedMul * g.speedMul;
  const sees = watcherSees(world, g, player, world.smokeClouds);
  const dPlayer = dist(g.x, g.y, player.x, player.y);

  // Awareness rises only while the guard can actually see the thief.
  if (sees) {
    const near = dPlayer < g.viewRange * 0.45;
    g.awareness += (near ? GUARD.awareRateNear : GUARD.awareRateFar) * world.awareMul * dt;
    g.lastSeen = { x: player.x, y: player.y };
  } else {
    g.awareness -= GUARD.awareDecay * dt;
  }
  g.awareness = clamp(g.awareness, 0, 1);

  if (g.state === 'patrol') {
    if (g.awareness >= 1) {
      g.state = 'alert';
      g.spotGrace = GUARD.spotGrace;
      events.spotted(g);
    } else if (g.awareness >= 0.35) {
      g.state = 'suspicious';
      g.searchTime = GUARD.suspiciousTime;
    }
  } else if (g.state === 'suspicious') {
    if (g.awareness >= 1) {
      g.state = 'alert';
      g.spotGrace = GUARD.spotGrace;
      events.spotted(g);
    } else if (g.awareness < 0.12) {
      g.state = 'patrol';
    }
  } else if (g.state === 'alert') {
    if (!sees && g.awareness < 0.5) {
      g.state = 'search';
      g.searchTime = 5;
    }
  } else if (g.state === 'search') {
    if (g.awareness >= 1) {
      g.state = 'alert';
      g.spotGrace = GUARD.spotGrace;
      events.spotted(g);
    } else if (g.searchTime <= 0) {
      g.state = 'patrol';
    }
  }

  // Movement per state.
  let targetSpeed = 0;
  let faceAngle = g.angle;
  if (g.state === 'patrol') {
    if (g.pause > 0) {
      g.pause -= dt;
    } else {
      const t = g.path[g.wp];
      const d = dist(g.x, g.y, t.x, t.y);
      if (d < 6) {
        g.wp = (g.wp + 1) % g.path.length;
        g.pause = GUARD.waypointPause;
      } else {
        targetSpeed = speed;
        faceAngle = guardTargetAngle(g);
      }
    }
  } else if (g.state === 'suspicious' || g.state === 'search') {
    if (g.lastSeen) {
      const d = dist(g.x, g.y, g.lastSeen.x, g.lastSeen.y);
      if (d > 26) {
        targetSpeed = GUARD.investigateSpeed * world.guardSpeedMul;
        faceAngle = Math.atan2(g.lastSeen.y - g.y, g.lastSeen.x - g.x);
      } else {
        // Arrived: look around, then give up.
        faceAngle = g.angle + Math.sin(time * 1.4 + g.bob) * 0.9;
        g.searchTime -= dt;
      }
    }
    if (g.state === 'suspicious') g.searchTime -= dt * 0.4;
  } else if (g.state === 'alert') {
    if (g.spotGrace > 0) {
      // The fair "!" beat: the guard freezes a moment before giving chase.
      g.spotGrace -= dt;
      faceAngle = Math.atan2(player.y - g.y, player.x - g.x);
    } else {
      targetSpeed = GUARD.chaseSpeed * world.guardSpeedMul;
      faceAngle = Math.atan2(player.y - g.y, player.x - g.x);
    }
  }

  const beforeX = g.x;
  const beforeY = g.y;
  if (targetSpeed > 0) {
    const moved = moveCircle(
      world, g.x, g.y, GUARD.radius,
      Math.cos(faceAngle) * targetSpeed * dt,
      Math.sin(faceAngle) * targetSpeed * dt,
    );
    g.x = moved.x;
    g.y = moved.y;
  }
  g.angle = angleLerp(g.angle, faceAngle, Math.min(1, dt * 8));

  // Stuck against a wall (bad waypoint): skip to the next one.
  if (targetSpeed > 0 && dist(g.x, g.y, beforeX, beforeY) < targetSpeed * dt * 0.25) {
    g.stuckTime += dt;
    if (g.stuckTime > 1.2) {
      g.wp = (g.wp + 1) % g.path.length;
      g.stuckTime = 0;
      if (g.state === 'search' || g.state === 'suspicious') g.state = 'patrol';
    }
  } else {
    g.stuckTime = 0;
  }
  g.lastX = g.x;
  g.lastY = g.y;
  return g;
}

// A guard hears a noise: turn suspicious and go look.
export function guardHears(world, guards, x, y, radius) {
  for (const g of guards) {
    if (g.state === 'alert') continue;
    if (dist(g.x, g.y, x, y) < radius + 40) {
      g.lastSeen = { x, y };
      g.awareness = Math.max(g.awareness, 0.5);
      if (g.state === 'patrol') {
        g.state = 'suspicious';
        g.searchTime = GUARD.suspiciousTime;
      }
    }
  }
}

export function updateCamera(world, cam, player, dt, time) {
  if (cam.disabled > 0) {
    cam.disabled -= dt;
    cam.seesPlayer = false;
    return cam;
  }
  cam.angle = cam.baseAngle + Math.sin(time * CAMERA.sweepSpeed + cam.phase) * cam.sweep;
  cam.seesPlayer = watcherSees(world, cam, player, world.smokeClouds);
  return cam;
}

// True when a camera's cone covers the player (used by the HUD warning).
export function cameraSeesPlayer(world, cam, player) {
  if (cam.disabled > 0) return false;
  return inCone(world, cam.x, cam.y, cam.angle, cam.fov, cam.range, player.x, player.y);
}

export { hasLineOfSight };
