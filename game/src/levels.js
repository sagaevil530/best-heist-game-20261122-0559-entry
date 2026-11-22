// The three heists. Walls are rectangles of tiles; doors sit in wall tiles and
// are passable once picked (or from the start when unlocked). Guard patrols
// are loops of tile waypoints in open floor. Angles: 0 = east, PI/2 = south.
export const LEVELS = [
  {
    id: 'gallery',
    name: 'The Meridian Gallery',
    brief: 'Lift the Azure Duchess from the east wing and slip out the south door.',
    seed: 1101,
    theme: 'gallery',
    target: { kind: 'painting', name: 'The Azure Duchess', value: 5000, x: 36, y: 4 },
    loot: [
      { kind: 'painting', value: 800, x: 6, y: 5 },
      { kind: 'jewel', value: 1200, x: 15, y: 3 },
      { kind: 'cash', value: 600, x: 24, y: 21 },
      { kind: 'painting', value: 900, x: 33, y: 20 },
    ],
    guards: [
      { path: [[15, 5], [24, 5], [24, 8], [15, 8]], speed: 1.0 },
      { path: [[30, 5], [36, 5], [36, 12], [30, 12]], speed: 1.0 },
      { path: [[15, 20], [24, 20], [24, 22], [15, 22]], speed: 0.95 },
    ],
    cameras: [
      { x: 33, y: 8, angle: Math.PI, sweep: 0.7 },
      { x: 20, y: 13, angle: 0, sweep: 0.6 },
    ],
    doors: [
      { x: 12, y: 12, locked: false },
      { x: 27, y: 6, locked: false },
      { x: 27, y: 18, locked: true, pickTime: 2.5 },
      { x: 20, y: 10, locked: true, pickTime: 2.5 },
      { x: 16, y: 17, locked: false },
    ],
    walls: [
      { x: 12, y: 3, w: 1, h: 19 },
      { x: 27, y: 3, w: 1, h: 19 },
      { x: 13, y: 10, w: 14, h: 1 },
      { x: 13, y: 17, w: 14, h: 1 },
      // Pillars in the lower hall: cover to break a patrol's line of sight.
      { x: 20, y: 19, w: 1, h: 1 },
      { x: 23, y: 21, w: 1, h: 1 },
      { x: 17, y: 21, w: 1, h: 1 },
    ],
    player: [5, 22],
    exit: [2, 22],
  },
  {
    id: 'bank',
    name: 'Halcyon Bank',
    brief: 'Crack the vault in the north-east corner. The gold reserve is yours.',
    seed: 2202,
    theme: 'bank',
    target: { kind: 'gold', name: 'Halcyon Gold Reserve', value: 8000, x: 36, y: 4 },
    loot: [
      { kind: 'cash', value: 700, x: 5, y: 6 },
      { kind: 'jewel', value: 1000, x: 14, y: 5 },
      { kind: 'cash', value: 800, x: 22, y: 18 },
      { kind: 'gold', value: 1500, x: 30, y: 3 },
      { kind: 'gold', value: 1500, x: 34, y: 8 },
    ],
    guards: [
      { path: [[22, 5], [26, 5], [26, 9], [22, 9]], speed: 1.05 },
      { path: [[12, 15], [24, 15], [24, 20], [12, 20]], speed: 1.0 },
      { path: [[3, 15], [8, 15], [8, 22], [3, 22]], speed: 1.0 },
    ],
    cameras: [
      { x: 26, y: 4, angle: 0, sweep: 0.5 },
      { x: 25, y: 4, angle: 0.785, sweep: 0.5 },
    ],
    doors: [
      { x: 27, y: 6, locked: true, pickTime: 4.0, vault: true },
      { x: 12, y: 12, locked: false },
      { x: 20, y: 12, locked: false },
      { x: 10, y: 18, locked: true, pickTime: 2.5 },
    ],
    walls: [
      { x: 27, y: 2, w: 1, h: 9 },
      { x: 27, y: 10, w: 12, h: 1 },
      { x: 8, y: 12, w: 16, h: 1 },
      { x: 10, y: 14, w: 1, h: 8 },
      // Pillars in the main hall: cover to break a patrol's line of sight.
      { x: 17, y: 16, w: 1, h: 1 },
      { x: 21, y: 19, w: 1, h: 1 },
      { x: 6, y: 18, w: 1, h: 1 },
    ],
    player: [5, 22],
    exit: [2, 22],
  },
  {
    id: 'penthouse',
    name: 'The Skyline Penthouse',
    brief: 'The Halcyon Star diamond sits in a glass case at the top. Four guards, three cameras, no mercy.',
    seed: 3303,
    theme: 'penthouse',
    target: { kind: 'diamond', name: 'The Halcyon Star', value: 12000, x: 20, y: 4 },
    loot: [
      { kind: 'painting', value: 1000, x: 5, y: 4 },
      { kind: 'jewel', value: 1200, x: 12, y: 20 },
      { kind: 'cash', value: 900, x: 30, y: 20 },
      { kind: 'jewel', value: 1400, x: 36, y: 4 },
      { kind: 'painting', value: 1100, x: 12, y: 9 },
    ],
    guards: [
      { path: [[18, 9], [22, 9], [22, 11], [18, 11]], speed: 1.1 },
      { path: [[4, 6], [11, 6], [11, 12], [4, 12]], speed: 1.05 },
      { path: [[28, 6], [36, 6], [36, 12], [28, 12]], speed: 1.05 },
      { path: [[6, 18], [24, 18], [24, 21], [6, 21]], speed: 1.0 },
    ],
    cameras: [
      { x: 20, y: 8, angle: -Math.PI / 2, sweep: 0.5 },
      { x: 32, y: 10, angle: Math.PI, sweep: 0.6 },
      { x: 8, y: 16, angle: 0, sweep: 0.5 },
    ],
    doors: [
      { x: 14, y: 6, locked: true, pickTime: 2.5 },
      { x: 26, y: 18, locked: false },
      { x: 20, y: 13, locked: true, pickTime: 2.5 },
      { x: 20, y: 7, locked: true, pickTime: 3.5, vault: true },
    ],
    walls: [
      { x: 14, y: 2, w: 1, h: 9 },
      { x: 26, y: 13, w: 1, h: 10 },
      { x: 15, y: 13, w: 11, h: 1 },
      { x: 16, y: 2, w: 1, h: 6 },
      { x: 24, y: 2, w: 1, h: 6 },
      { x: 17, y: 7, w: 7, h: 1 },
      // North wall: the display room is sealed except for its locked door.
      { x: 16, y: 1, w: 9, h: 1 },
      // Pillars in the open plan: cover to break a patrol's line of sight.
      { x: 8, y: 9, w: 1, h: 1 },
      { x: 32, y: 9, w: 1, h: 1 },
      { x: 12, y: 19, w: 1, h: 1 },
      { x: 30, y: 19, w: 1, h: 1 },
    ],
    player: [20, 22],
    exit: [2, 22],
  },
];
