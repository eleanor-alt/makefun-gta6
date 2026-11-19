// Palmira Heat — shared tuning and names. Everything original: the city, the people and the
// cars were invented for this game. One place for the numbers every other module reads, so
// the feel of the game can be tuned without hunting through the code.

export const WORLD = {
  width: 5120,
  height: 3840,
  blockPitch: 640, // distance between road centrelines, both axes
  roadWidth: 124, // asphalt width; sidewalks and verges fill the rest of the pitch
  laneOffset: 30, // right-hand traffic: how far from the centreline a lane sits
  waterX: 4830, // east of this line is the bay
  beachX: 4680, // sand between the last road and the water
};

export const CITY_NAME = 'Palmira Bay';
export const GAME_TITLE = 'PALMIRA HEAT';

export const PLAYER = {
  radius: 11,
  walkSpeed: 172,
  sprintSpeed: 258,
  health: 100,
  name: 'Marlo Reyes',
};

export const WANTED = {
  maxStars: 5,
  heatPerStar: 100,
  decayDelay: 4, // seconds unseen before heat starts to cool
  decayRate: 7, // heat per second while hidden
  bustRange: 104, // a police car this close to an on-foot player starts the bust meter
  bustRate: 30, // bust meter per second from the nearest crew
  bustDecay: 12,
};

// Vehicle archetypes: the names are this game's own brands. topSpeed in px/s, accel in px/s^2.
export const CAR_TYPES = {
  sedan: { label: 'Vantek Meridian', w: 46, h: 22, topSpeed: 392, accel: 250, grip: 5.2, colors: ['#c94f42', '#4a7fb5', '#d9d4c5', '#5d8a66', '#7a6fa0', '#b5893c'] },
  taxi: { label: 'Vantek Meridian Cab', w: 46, h: 22, topSpeed: 380, accel: 245, grip: 5.2, colors: ['#e8b73a'] },
  hatch: { label: 'Poco Lento', w: 40, h: 20, topSpeed: 330, accel: 225, grip: 5.6, colors: ['#9db4c0', '#c7a3b8', '#8fae94', '#d0c08a'] },
  van: { label: 'Hauler Brumby', w: 54, h: 24, topSpeed: 320, accel: 195, grip: 4.4, colors: ['#cfd4d8', '#8b9bb0', '#a05c4a'] },
  truck: { label: 'Hauler Brumby XL', w: 62, h: 25, topSpeed: 295, accel: 170, grip: 4.0, colors: ['#b0b6ba', '#7d8aa0'] },
  sports: { label: 'Vantek Solstice', w: 48, h: 21, topSpeed: 486, accel: 330, grip: 5.9, colors: ['#e2543e', '#f2c230', '#39b5a8'] },
  police: { label: 'Palmira PD Interceptor', w: 48, h: 22, topSpeed: 452, accel: 305, grip: 5.8, colors: ['#20242c'] },
};

export const WEAPON = {
  name: 'Kestrel 9mm',
  damage: 34,
  fireRate: 0.21, // seconds between shots
  bulletSpeed: 940,
  bulletLife: 0.55,
  spread: 0.035,
  magSize: 12,
  reloadTime: 0.9,
};

export const SAVE_KEY = 'palmira-heat-save-v1';

// Sun-soaked palette: warm asphalt, pale sidewalks, pastel roofs, teal bay.
export const PALETTE = {
  grass: '#79a85b',
  grassDark: '#6d9c52',
  sand: '#ecd9a0',
  water: '#2e8fa3',
  waterDeep: '#227488',
  road: '#4b4a4e',
  roadEdge: '#e8e2d0',
  lane: '#d8c95e',
  sidewalk: '#cfc8b4',
  plaza: '#ddd5bd',
  roofShadow: 'rgba(46, 38, 20, 0.25)',
};
