// Shared tuning for The Halcyon Heist. Everything that shapes how the game
// feels lives here so the other modules stay small and single-purpose.
export const TILE = 32;
export const COLS = 40;
export const ROWS = 25;
export const VIEW_W = COLS * TILE; // 1280
export const VIEW_H = ROWS * TILE; // 800
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 11,
  walkSpeed: 132,
  sprintSpeed: 205,
  sneakSpeed: 78,
  // How far a guard can spot a walking thief, in pixels, before stance mods.
  spotRange: 250,
};

export const GUARD = {
  radius: 12,
  patrolSpeed: 62,
  chaseSpeed: 148,
  investigateSpeed: 96,
  // Vision cone half-angle in radians (about 38 degrees each side).
  fov: 0.66,
  viewRange: 235,
  // Awareness 0..1: 0.35 turns a guard suspicious, 1.0 turns it alert.
  awareRateNear: 1.6,
  awareRateFar: 0.55,
  awareDecay: 0.25,
  suspiciousTime: 4.5,
  waypointPause: 1.1,
  // First-spot grace: the "!" moment before the chase starts.
  spotGrace: 0.65,
  catchRange: 19,
};

export const CAMERA = {
  range: 225,
  fov: 0.44,
  sweepSpeed: 0.55,
  alarmRate: 26,
};

export const ALARM = {
  riseAlert: 30,
  riseSuspicious: 9,
  decay: 5.5,
  lockdownSeconds: 12,
  lockdownDropTo: 55,
};

export const NOISE = {
  sprintRadius: 110,
  sprintEvery: 0.45,
  pickRadius: 60,
  pickupRadius: 40,
};

export const TOOLS = {
  smokeStart: 2,
  empStart: 2,
  smokeSeconds: 6,
  empSeconds: 8,
  smokeRadius: 95,
};

export const DIFFICULTY = {
  easy: { label: 'EASY', guardSpeed: 0.85, viewRange: 0.85, alarm: 0.7, aware: 0.75 },
  normal: { label: 'NORMAL', guardSpeed: 1.0, viewRange: 1.0, alarm: 1.0, aware: 1.0 },
  hard: { label: 'HARD', guardSpeed: 1.16, viewRange: 1.12, alarm: 1.35, aware: 1.3 },
};

export const COLORS = {
  ink: '#0b0e1a',
  floorA: '#1a2036',
  floorB: '#171c30',
  floorTrim: '#232a45',
  wall: '#3a4368',
  wallTop: '#565f8c',
  wallEdge: '#141828',
  carpet: '#3d2b4d',
  vaultFloor: '#2a2f45',
  coneCalm: 'rgba(255, 214, 90, 0.20)',
  coneCalmEdge: 'rgba(255, 214, 90, 0.55)',
  coneSuspect: 'rgba(255, 150, 50, 0.30)',
  coneAlert: 'rgba(255, 64, 64, 0.34)',
  camCone: 'rgba(90, 200, 255, 0.20)',
  camConeEdge: 'rgba(90, 200, 255, 0.5)',
  loot: '#ffd34d',
  target: '#ff5d8f',
  exit: '#39d98a',
  player: '#e8ecff',
  guard: '#ff8a5c',
  smoke: 'rgba(200, 205, 220, 0.35)',
  hud: 'rgba(8, 10, 22, 0.82)',
  hudText: '#e8ecff',
  hudDim: '#9aa3c0',
  alarmLow: '#39d98a',
  alarmMid: '#ffb020',
  alarmHigh: '#ff4040',
};

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

export function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function tileCenter(tx, ty) {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
}
