// The game itself: run state, the thief, tools, loot, the alarm meter and
// scoring. Rendering lives in render.js; input is a plain object from input.js.
import {
  TILE, COLS, ROWS, VIEW_W, VIEW_H, PLAYER, GUARD, ALARM, NOISE, TOOLS,
  DIFFICULTY, tileCenter, clamp, dist,
} from './config.js';
import { LEVELS } from './levels.js';
import { buildWorld, moveCircle, isDoor } from './world.js';
import { makeGuard, makeCamera, updateGuard, updateCamera, guardHears } from './guards.js';
import { makeRng } from './random.js';

const PAR_SECONDS = [150, 180, 210];
const TARGET_CHANNEL = 1.5;

export function layoutButtons() {
  // Every clickable rect on the menu screens, in canvas pixels.
  const cx = VIEW_W / 2;
  return {
    start: { x: cx - 130, y: 560, w: 260, h: 58 },
    howto: { x: cx - 130, y: 632, w: 260, h: 44 },
    back: { x: cx - 110, y: 668, w: 220, h: 48 },
    next: { x: cx - 140, y: 580, w: 280, h: 56 },
    retry: { x: cx - 140, y: 560, w: 280, h: 56 },
    again: { x: cx - 140, y: 620, w: 280, h: 56 },
    diff: ['easy', 'normal', 'hard'].map((k, i) => ({
      key: k, x: cx - 210 + i * 150, y: 452, w: 130, h: 46,
    })),
  };
}

function inRect(r, x, y) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function createGame(audio) {
  const game = {
    audio,
    screen: 'title', // title | howto | playing | paused | caught | levelClear | win
    difficultyKey: 'normal',
    levelIndex: 0,
    world: null,
    guards: [],
    cameras: [],
    loot: [],
    target: null,
    player: null,
    alarm: 0,
    lockdown: 0,
    time: 0,
    runTime: 0,
    runScore: 0,
    levelLoot: 0,
    maxAlarm: 0,
    levelSpotted: 0,
    runSpotted: 0,
    smoke: [],
    empTime: 0,
    smokeCharges: TOOLS.smokeStart,
    empCharges: TOOLS.empStart,
    message: '',
    messageTime: 0,
    levelResult: null,
    finalResult: null,
    rng: makeRng(1),
    flash: 0, // red flash on being spotted
    hint: '',
  };

  function showMessage(text, seconds = 2.5) {
    game.message = text;
    game.messageTime = seconds;
  }

  function loadLevel(index) {
    const def = LEVELS[index];
    const diff = DIFFICULTY[game.difficultyKey];
    const world = buildWorld(def, diff, index);
    world.smokeClouds = game.smoke;
    game.world = world;
    game.rng = makeRng(def.seed);
    game.guards = def.guards.map((d, i) => makeGuard(d, world, i));
    game.cameras = def.cameras.map((d) => makeCamera(d, world, game.rng));
    game.loot = def.loot.map((l) => ({
      ...l, x: l.x * TILE + TILE / 2, y: l.y * TILE + TILE / 2, taken: false,
    }));
    game.target = {
      ...def.target,
      x: def.target.x * TILE + TILE / 2,
      y: def.target.y * TILE + TILE / 2,
      taken: false,
    };
    const start = tileCenter(def.player[0], def.player[1]);
    game.player = {
      x: start.x, y: start.y, angle: -Math.PI / 2,
      stance: 'walk', moving: false, speed: 0,
      stepTimer: 0, noiseTimer: 0,
      pickDoor: null, pickProgress: 0, pickNoise: 0,
      targetProgress: 0, targetNoise: 0,
      clickX: null, clickY: null,
    };
    const exit = tileCenter(def.exit[0], def.exit[1]);
    game.exit = { x: exit.x, y: exit.y, tx: def.exit[0], ty: def.exit[1] };
    game.alarm = 0;
    game.lockdown = 0;
    game.time = 0;
    game.levelLoot = 0;
    game.maxAlarm = 0;
    game.levelSpotted = 0;
    game.smoke = [];
    game.world.smokeClouds = game.smoke;
    game.empTime = 0;
    game.smokeCharges = TOOLS.smokeStart;
    game.empCharges = TOOLS.empStart;
    game.rng = makeRng(def.seed);
    game.flash = 0;
    game.hint = '';
    showMessage(`${def.name} — ${def.brief}`, 4);
  }

  function startRun() {
    game.runScore = 0;
    game.runTime = 0;
    game.runSpotted = 0;
    game.levelIndex = 0;
    loadLevel(0);
    game.screen = 'playing';
  }

  function rankFor(maxAlarm, spotted) {
    if (maxAlarm < 25 && spotted === 0) return 'GHOST';
    if (maxAlarm < 70) return 'SHADOW';
    return 'LOUD';
  }

  function levelClear() {
    const timeBonus = Math.max(0, Math.round((PAR_SECONDS[game.levelIndex] - game.time) * 10));
    const ghostBonus = game.maxAlarm < 25 && game.levelSpotted === 0
      ? Math.round(game.levelLoot * 0.25) : 0;
    const total = game.levelLoot + timeBonus + ghostBonus;
    game.runScore += total;
    game.runTime += game.time;
    const rank = rankFor(game.maxAlarm, game.levelSpotted);
    game.levelResult = {
      name: LEVELS[game.levelIndex].name,
      loot: game.levelLoot,
      timeBonus, ghostBonus, total, rank,
      time: game.time, maxAlarm: Math.round(game.maxAlarm),
    };
    audio.win();
    game.screen = 'levelClear';
  }

  function nextLevel() {
    game.levelIndex += 1;
    if (game.levelIndex >= LEVELS.length) {
      const rank = rankFor(game.maxAlarm, game.runSpotted);
      game.finalResult = {
        score: game.runScore,
        time: game.runTime,
        rank,
        spotted: game.runSpotted,
      };
      game.screen = 'win';
    } else {
      loadLevel(game.levelIndex);
      game.screen = 'playing';
    }
  }

  function caught() {
    audio.caught();
    audio.alarmTick(false);
    game.screen = 'caught';
  }

  function updatePlaying(dt, input) {
    const p = game.player;
    const world = game.world;
    game.time += dt;

    // --- Movement (keyboard, or click-to-move) ---
    let mx = 0;
    let my = 0;
    if (input.up) my -= 1;
    if (input.down) my += 1;
    if (input.left) mx -= 1;
    if (input.right) mx += 1;
    if (mx !== 0 || my !== 0) {
      p.clickX = null;
      p.clickY = null;
    } else if (p.clickX !== null) {
      const dx = p.clickX - p.x;
      const dy = p.clickY - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 8) {
        p.clickX = null;
        p.clickY = null;
      } else {
        mx = dx / d;
        my = dy / d;
      }
    }
    const mag = Math.hypot(mx, my);
    if (mag > 0) {
      mx /= mag;
      my /= mag;
    }
    const sprinting = input.sprint && mag > 0;
    const sneaking = input.sneak && mag > 0;
    // Crouched and working a lock or cutting a painting counts as sneaking:
    // the thief is low, quiet and harder to spot.
    const working = p.targetProgress > 0 || p.pickProgress > 0;
    p.stance = working || sneaking ? 'sneak' : sprinting ? 'sprint' : 'walk';
    const speed = sneaking ? PLAYER.sneakSpeed : sprinting ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    p.speed = mag > 0 ? speed : 0;
    p.moving = mag > 0;
    if (mag > 0) {
      const moved = moveCircle(world, p.x, p.y, PLAYER.radius, mx * speed * dt, my * speed * dt);
      p.x = moved.x;
      p.y = moved.y;
      p.angle = Math.atan2(my, mx);
      p.stepTimer -= dt;
      if (p.stepTimer <= 0) {
        audio.step(sneaking);
        p.stepTimer = sneaking ? 0.55 : sprinting ? 0.3 : 0.42;
      }
      if (sprinting) {
        p.noiseTimer -= dt;
        if (p.noiseTimer <= 0) {
          guardHears(world, game.guards, p.x, p.y, NOISE.sprintRadius);
          p.noiseTimer = NOISE.sprintEvery;
        }
      }
    }

    // --- Tools ---
    if (input.smokePressed && game.smokeCharges > 0) {
      game.smokeCharges -= 1;
      game.smoke.push({ x: p.x, y: p.y, radius: TOOLS.smokeRadius, ttl: TOOLS.smokeSeconds });
      audio.smoke();
      showMessage('Smoke out — their eyes are useless for a while.');
    }
    if (input.empPressed && game.empCharges > 0) {
      game.empCharges -= 1;
      game.empTime = TOOLS.empSeconds;
      for (const c of game.cameras) c.disabled = TOOLS.empSeconds;
      audio.emp();
      showMessage('EMP burst — cameras down for 8 seconds.');
    }
    for (let i = game.smoke.length - 1; i >= 0; i -= 1) {
      game.smoke[i].ttl -= dt;
      if (game.smoke[i].ttl <= 0) game.smoke.splice(i, 1);
    }
    if (game.empTime > 0) game.empTime -= dt;

    // --- Loot: small loot is pocketed by walking over it ---
    for (const item of game.loot) {
      if (item.taken) continue;
      if (dist(p.x, p.y, item.x, item.y) < 24) {
        item.taken = true;
        game.levelLoot += item.value;
        audio.pickup();
        showMessage(`Pocketed ${item.kind} — $${item.value.toLocaleString()}.`);
      }
    }

    // --- The main target: hold E to cut it free ---
    const t = game.target;
    const nearTarget = !t.taken && dist(p.x, p.y, t.x, t.y) < 34;
    if (nearTarget && input.interact) {
      p.targetProgress += dt / TARGET_CHANNEL;
      p.targetNoise -= dt;
      if (p.targetNoise <= 0) {
        guardHears(world, game.guards, p.x, p.y, NOISE.pickupRadius);
        p.targetNoise = 0.5;
      }
      if (Math.floor(p.targetProgress * 8) !== Math.floor((p.targetProgress - dt / TARGET_CHANNEL) * 8)) {
        audio.lockTick();
      }
      if (p.targetProgress >= 1) {
        t.taken = true;
        game.levelLoot += t.value;
        audio.target();
        showMessage(`${t.name} is yours — $${t.value.toLocaleString()}. Get to the exit!`, 3.5);
      }
    } else {
      p.targetProgress = Math.max(0, p.targetProgress - dt * 2);
    }

    // --- Lockpicking: hold E at a locked door ---
    let nearDoor = null;
    for (const d of world.doors) {
      if (!d.locked || d.open) continue;
      if (dist(p.x, p.y, d.x, d.y) < 34) { nearDoor = d; break; }
    }
    if (nearDoor && input.interact && !nearTarget) {
      p.pickDoor = nearDoor;
      p.pickProgress += dt / nearDoor.pickTime;
      p.pickNoise -= dt;
      if (p.pickNoise <= 0) {
        guardHears(world, game.guards, p.x, p.y, NOISE.pickRadius);
        audio.lockTick();
        p.pickNoise = 0.45;
      }
      if (p.pickProgress >= 1) {
        nearDoor.open = true;
        nearDoor.pick = 0;
        p.pickDoor = null;
        p.pickProgress = 0;
        audio.lockDone();
        audio.doorOpen();
        showMessage(nearDoor.vault ? 'Vault open. Beautiful.' : 'Lock picked — door open.');
      }
    } else {
      if (p.pickDoor) p.pickDoor.pick = p.pickProgress;
      p.pickDoor = null;
      p.pickProgress = Math.max(0, p.pickProgress - dt * 2);
    }

    // --- Guards, cameras, alarm ---
    const events = {
      spotted(g) {
        game.levelSpotted += 1;
        game.runSpotted += 1;
        game.flash = 0.5;
        audio.spotted();
        showMessage('SPOTTED! Break line of sight!', 2);
      },
    };
    for (const g of game.guards) updateGuard(world, g, p, dt, game.time, events);
    for (const c of game.cameras) updateCamera(world, c, p, dt, game.time);

    const anyAlert = game.guards.some((g) => g.state === 'alert');
    const anySus = game.guards.some((g) => g.state === 'suspicious');
    const anyCam = game.cameras.some((c) => c.seesPlayer);
    let rise = 0;
    if (anyAlert) rise += ALARM.riseAlert;
    if (anySus) rise += ALARM.riseSuspicious;
    if (anyCam) rise += 26;
    rise *= world.alarmMul;
    if (game.lockdown > 0) {
      game.lockdown -= dt;
      game.alarm = 100;
      // Lockdown: every guard hunts the thief's real position.
      for (const g of game.guards) {
        g.lastSeen = { x: p.x, y: p.y };
        g.awareness = Math.max(g.awareness, 0.9);
        if (g.state !== 'alert') g.state = 'alert';
        g.spotGrace = 0;
      }
      if (game.lockdown <= 0) game.alarm = ALARM.lockdownDropTo;
    } else if (rise > 0) {
      game.alarm += rise * dt;
    } else {
      game.alarm -= ALARM.decay * dt;
    }
    game.alarm = clamp(game.alarm, 0, 100);
    game.maxAlarm = Math.max(game.maxAlarm, game.alarm);
    if (game.alarm >= 100 && game.lockdown <= 0) {
      game.lockdown = ALARM.lockdownSeconds;
      showMessage('LOCKDOWN! Every guard is coming for you — run!', 3.5);
    }
    audio.alarmTick(game.alarm > 55);
    if (game.flash > 0) game.flash -= dt;

    // --- Caught? ---
    for (const g of game.guards) {
      if (g.state === 'alert' && dist(g.x, g.y, p.x, p.y) < GUARD.catchRange) {
        caught();
        return;
      }
    }

    // --- Exit: only with the target in hand ---
    if (dist(p.x, p.y, game.exit.x, game.exit.y) < 26) {
      if (game.target.taken) {
        levelClear();
        return;
      }
      game.hint = `Grab the ${game.target.name} first!`;
    } else {
      game.hint = '';
    }

    if (game.messageTime > 0) game.messageTime -= dt;
    if (input.pausePressed) game.screen = 'paused';
    if (input.restartPressed) loadLevel(game.levelIndex);
  }

  // Title-screen backdrop: the guards patrol against a dummy thief far away.
  function attract(dt) {
    const dummy = { x: -1000, y: -1000, stance: 'walk' };
    game.time += dt;
    const events = { spotted() {} };
    for (const g of game.guards) updateGuard(game.world, g, dummy, dt, game.time, events);
    for (const c of game.cameras) updateCamera(game.world, c, dummy, dt, game.time);
  }

  function update(input) {
    if (input.mutePressed) {
      audio.ensure();
      audio.setMuted(!audio.muted);
    }
    if (game.screen === 'title') {
      attract(1 / 60);
      if (input.mouseClicked) {
        const b = layoutButtons();
        for (const d of b.diff) {
          if (inRect(d, input.mouseX, input.mouseY)) game.difficultyKey = d.key;
        }
        if (inRect(b.start, input.mouseX, input.mouseY)) { audio.ensure(); startRun(); }
        else if (inRect(b.howto, input.mouseX, input.mouseY)) game.screen = 'howto';
      }
      if (input.diffKey) game.difficultyKey = input.diffKey;
      if (input.confirmPressed) { audio.ensure(); startRun(); }
      return;
    }
    if (game.screen === 'howto') {
      attract(1 / 60);
      if (input.mouseClicked && inRect(layoutButtons().back, input.mouseX, input.mouseY)) game.screen = 'title';
      if (input.confirmPressed || input.pausePressed) game.screen = 'title';
      return;
    }
    if (game.screen === 'paused') {
      if (input.pausePressed || input.confirmPressed) game.screen = 'playing';
      if (input.restartPressed) { loadLevel(game.levelIndex); game.screen = 'playing'; }
      if (input.titlePressed) game.screen = 'title';
      return;
    }
    if (game.screen === 'playing') {
      updatePlaying(1 / 60, input);
      return;
    }
    if (game.screen === 'levelClear') {
      if (input.confirmPressed) nextLevel();
      if (input.mouseClicked && inRect(layoutButtons().next, input.mouseX, input.mouseY)) nextLevel();
      return;
    }
    if (game.screen === 'caught') {
      if (input.confirmPressed || input.restartPressed) { loadLevel(game.levelIndex); game.screen = 'playing'; }
      if (input.mouseClicked && inRect(layoutButtons().retry, input.mouseX, input.mouseY)) {
        loadLevel(game.levelIndex); game.screen = 'playing';
      }
      if (input.titlePressed) game.screen = 'title';
      return;
    }
    if (game.screen === 'win') {
      if (input.confirmPressed || input.restartPressed) startRun();
      if (input.mouseClicked && inRect(layoutButtons().again, input.mouseX, input.mouseY)) startRun();
      if (input.titlePressed) game.screen = 'title';
    }
  }

  // Used by the screenshot scenes and the self-test: jump straight into a
  // level with a chosen difficulty, no title screen.
  function debugStart(levelIndex, difficultyKey) {
    game.difficultyKey = difficultyKey || 'normal';
    game.runScore = 0;
    game.runTime = 0;
    game.runSpotted = 0;
    game.levelIndex = levelIndex;
    loadLevel(levelIndex);
    game.screen = 'playing';
  }

  game.loadLevel = loadLevel;
  game.startRun = startRun;
  game.nextLevel = nextLevel;
  game.update = update;
  game.debugStart = debugStart;
  game.attract = attract;
  Object.defineProperty(game, 'levelDef', { get() { return LEVELS[game.levelIndex]; } });
  Object.defineProperty(game, 'difficulty', { get() { return DIFFICULTY[game.difficultyKey]; } });
  return game;
}
