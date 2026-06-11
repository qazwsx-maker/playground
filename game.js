'use strict';

/* ============================================================
   HASHBORN — every soul is forged from a hash.
   Deterministic hero generation: same seed → same hero, forever.
   ============================================================ */

/* ---------------- hash & deterministic RNG ---------------- */

async function sha256Hex(str) {
  if (globalThis.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return sha256Fallback(str);
}

/* Compact pure-JS SHA-256 (only used when crypto.subtle is unavailable, e.g. file://) */
function sha256Fallback(ascii) {
  const rrot = (v, n) => (v >>> n) | (v << (32 - n));
  const words = [], asciiBytes = new TextEncoder().encode(ascii);
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const k = [];
  for (let c = 2, i = 0; i < 64; c++) {
    if (k.length > i) continue;
    let prime = true;
    for (let f = 2; f * f <= c; f++) if (c % f === 0) { prime = false; break; }
    if (prime) { k[i++] = (Math.cbrt(c) % 1) * 0x100000000 | 0; }
  }
  const len = asciiBytes.length;
  const withOne = new Uint8Array(((len + 9 + 63) >> 6) << 6);
  withOne.set(asciiBytes); withOne[len] = 0x80;
  const dv = new DataView(withOne.buffer);
  dv.setUint32(withOne.length - 4, len * 8);
  for (let j = 0; j < withOne.length; j += 64) {
    for (let i = 0; i < 16; i++) words[i] = dv.getUint32(j + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rrot(words[i - 15], 7) ^ rrot(words[i - 15], 18) ^ (words[i - 15] >>> 3);
      const s1 = rrot(words[i - 2], 17) ^ rrot(words[i - 2], 19) ^ (words[i - 2] >>> 10);
      words[i] = (words[i - 16] + s0 + words[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rrot(e, 6) ^ rrot(e, 11) ^ rrot(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + k[i] + words[i]) | 0;
      const S0 = rrot(a, 2) ^ rrot(a, 13) ^ rrot(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }
  return h.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hexToBytes = hex => { const out = []; for (let i = 0; i < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16)); return out; };
const u32 = (bytes, o) => ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const randomUUID = () => (globalThis.crypto && crypto.randomUUID)
  ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });

/* ---------------- game data ---------------- */

const RARITIES = [
  { key: 'common',    name: 'COMMON',    color: '#a8b0c2', weight: 45.0, mult: 1.00 },
  { key: 'uncommon',  name: 'UNCOMMON',  color: '#51d88a', weight: 27.5, mult: 1.14 },
  { key: 'rare',      name: 'RARE',      color: '#4f9df7', weight: 15.0, mult: 1.30 },
  { key: 'epic',      name: 'EPIC',      color: '#b35cf0', weight: 8.0,  mult: 1.52 },
  { key: 'legendary', name: 'LEGENDARY', color: '#ffa726', weight: 3.5,  mult: 1.82 },
  { key: 'mythic',    name: 'MYTHIC',    color: '#ff4d6d', weight: 1.0,  mult: 2.25 },
];

const CLASSES = [
  { key: 'knight',    name: 'Knight',    icon: '🛡', hp: 1.25, w: { atk: 0.95, def: 1.55, spd: 0.70, crt: 0.70, lck: 1.00 },
    skill: { name: 'Shield Bash', desc: '1.3× dmg, 45% chance to stun' } },
  { key: 'mage',      name: 'Mage',      icon: '✦', hp: 0.85, w: { atk: 1.60, def: 0.65, spd: 0.95, crt: 1.00, lck: 1.10 },
    skill: { name: 'Fireball', desc: '1.9× dmg, ignores half DEF' } },
  { key: 'rogue',     name: 'Rogue',     icon: '🗡', hp: 0.90, w: { atk: 1.20, def: 0.75, spd: 1.55, crt: 1.55, lck: 1.10 },
    skill: { name: 'Shadowstrike', desc: 'two hits, each can crit' } },
  { key: 'ranger',    name: 'Ranger',    icon: '➶', hp: 1.00, w: { atk: 1.25, def: 0.85, spd: 1.25, crt: 1.15, lck: 1.00 },
    skill: { name: 'Piercing Arrow', desc: '1.5× dmg, ignores all DEF' } },
  { key: 'cleric',    name: 'Cleric',    icon: '✚', hp: 1.10, w: { atk: 0.95, def: 1.15, spd: 0.85, crt: 0.80, lck: 1.25 },
    skill: { name: 'Smite & Mend', desc: '1.2× dmg, heal 22% max HP' } },
  { key: 'berserker', name: 'Berserker', icon: '⚔', hp: 1.10, w: { atk: 1.65, def: 0.70, spd: 1.00, crt: 1.05, lck: 0.80 },
    skill: { name: 'Rampage', desc: '2.3× dmg, 10% recoil to self' } },
];

const ELEMENTS = [
  { key: 'ember', name: 'Ember', color: '#ff7043', beats: 'bloom' },
  { key: 'tide',  name: 'Tide',  color: '#42a5f5', beats: 'ember' },
  { key: 'gale',  name: 'Gale',  color: '#9ccc65', beats: 'tide' },
  { key: 'stone', name: 'Stone', color: '#bcaaa4', beats: 'gale' },
  { key: 'bloom', name: 'Bloom', color: '#66bb6a', beats: 'stone' },
  { key: 'umbra', name: 'Umbra', color: '#9575cd', beats: 'umbra-none' }, // wildcard: +12% dealt & taken
];

const TRAITS = [
  { key: 'vampiric',  name: 'Vampiric',       desc: 'Heal 10% of damage you deal' },
  { key: 'stalwart',  name: 'Stalwart',       desc: '+20% DEF in battle' },
  { key: 'swift',     name: 'Swift Soul',     desc: 'Always strikes first' },
  { key: 'lucky',     name: 'Lucky Star',     desc: '+8% crit & +8% dodge' },
  { key: 'berserk',   name: 'Berserk Heart',  desc: '+25% ATK below 30% HP' },
  { key: 'thorns',    name: 'Thorns',         desc: 'Reflect 12% of damage taken' },
  { key: 'sturdy',    name: 'Undying Will',   desc: 'Survive a fatal blow once per run' },
  { key: 'focused',   name: 'Focused Mind',   desc: 'Skill cooldown −1 turn' },
  { key: 'herbalist', name: "Healer's Blood", desc: 'Potions heal 55% instead of 40%' },
  { key: 'giantbane', name: 'Giantbane',      desc: '+20% damage to floor bosses' },
  { key: 'echo',      name: 'Arcane Echo',    desc: '18% chance skills trigger no cooldown' },
  { key: 'wind2',     name: 'Second Wind',    desc: 'Heal 20% (not 8%) after each victory' },
];

const TITLES = {
  common:    ['the Wanderer', 'of the Gray Road', 'the Unproven', 'of Humble Bits', 'the Footsore'],
  uncommon:  ['the Keen', 'of the Green Vale', 'the Restless', 'of Quiet Renown', 'the Steady'],
  rare:      ['the Stormtouched', 'of the Deep Vault', 'the Unbroken', 'of Singing Steel', 'the Farseer'],
  epic:      ['the Voidwalker', 'of the Violet Crown', 'the Doombringer', 'of Shattered Stars', 'the Riftborn'],
  legendary: ['the Sunforged', 'of the Golden Hash', 'the Worldshaker', 'of Endless Dawn', 'the Flamebound'],
  mythic:    ['the Worldender', 'of the First Hash', 'the Inevitable', 'who Walks Between Bits', 'the Unrepeatable'],
};

const NAME_A = ['Ka', 'Ver', 'Tho', 'Ael', 'Bryn', 'Dro', 'Fen', 'Gar', 'Hal', 'Isk', 'Jor', 'Kel', 'Lun', 'Mor', 'Nyx', 'Or', 'Pyr', 'Quil', 'Rav', 'Syl', 'Tar', 'Ul', 'Vael', 'Wren', 'Xan', 'Yor', 'Zar', 'Eld', 'Cas', 'Ash'];
const NAME_B = ['ra', 'en', 'dor', 'iel', 'wyn', 'gar', 'mir', 'thas', 'ric', 'la', 'von', 'dra', 'ka', 'lis', 'mond', 'rin', 'sha', 'tov', 'una', 'vex', 'or', 'ix', 'ana', 'eth', 'ulf'];
const NAME_C = ['', '', '', 'is', 'on', 'ar', 'eth', 'us', 'ia', 'or', 'an', 'el'];

const MON_A = ['Grim', 'Hollow', 'Vile', 'Dread', 'Murk', 'Sallow', 'Bleak', 'Rot', 'Cinder', 'Frost', 'Gloom', 'Rust', 'Bone', 'Mire', 'Static'];
const MON_B = ['fang', 'maw', 'wisp', 'shank', 'gloom', 'spawn', 'hide', 'claw', 'husk', 'lurk', 'wing', 'creep', 'shade', 'snout', 'gnash'];
const BOSS_TITLES = ['Devourer', 'Warden', 'Tyrant', 'Colossus', 'Herald', 'Overfiend', 'Monarch'];

const SKIN_TONES = [
  ['#f2c9a0', '#d9a071'], ['#e8b48a', '#c98f5e'], ['#cf9468', '#a96f47'],
  ['#a96f47', '#85522f'], ['#7d4a26', '#5e3519'], ['#b8c4d6', '#8d9ab0'], // last: spectral
];
const HAIR_COLORS = ['#3b2a1d', '#191510', '#7a4a21', '#b8860b', '#cfd2da', '#8c2d2d', '#3f5f9e', '#3f7a4a'];

/* ---------------- color helpers (hue-shifted ramps) ---------------- */

function hsl(h, s, l) { return `hsl(${((h % 360) + 360) % 360} ${Math.max(0, Math.min(100, s))}% ${Math.max(0, Math.min(100, l))}%)`; }
function lerpHue(h, target, t) {
  let d = ((target - h + 540) % 360) - 180;
  return h + d * t;
}
/* Shadows shift toward blue-violet (250°), highlights toward warm yellow (50°). */
function makeRamp(h, s, l) {
  return {
    dark:  hsl(lerpHue(h, 250, 0.22), s + 6, l - 16),
    mid:   hsl(h, s, l),
    light: hsl(lerpHue(h, 50, 0.20), s - 4, l + 14),
  };
}

/* ---------------- hero generation ---------------- */

function rollRarity(bytes) {
  const roll = (u32(bytes, 0) / 4294967296) * 100; // first 4 bytes of the hash seal your fate
  let acc = 0;
  for (let i = RARITIES.length - 1; i >= 0; i--) {
    acc += RARITIES[i].weight;
    if (roll < acc) return i;
  }
  return 0;
}

async function generateHero(seed) {
  const hash = await sha256Hex(seed);
  const bytes = hexToBytes(hash);
  const rng = mulberry32(u32(bytes, 4));

  const rarityIdx = rollRarity(bytes);
  const rarity = RARITIES[rarityIdx];
  const cls = CLASSES[u32(bytes, 8) % CLASSES.length];
  const element = ELEMENTS[u32(bytes, 12) % ELEMENTS.length];
  const trait = TRAITS[u32(bytes, 16) % TRAITS.length];

  const name = pick(rng, NAME_A) + pick(rng, NAME_B) + pick(rng, NAME_C);
  const title = pick(rng, TITLES[rarity.key]);

  const jitter = () => 0.9 + rng() * 0.2;
  const base = { hp: 92, atk: 14, def: 9, spd: 9, crt: 6, lck: 6 };
  const stats = {
    hp:  Math.round(base.hp * cls.hp * rarity.mult * jitter()),
    atk: Math.round(base.atk * cls.w.atk * rarity.mult * jitter()),
    def: Math.round(base.def * cls.w.def * rarity.mult * jitter()),
    spd: Math.round(base.spd * cls.w.spd * rarity.mult * jitter()),
    crt: Math.round(base.crt * cls.w.crt * rarity.mult * jitter()),
    lck: Math.round(base.lck * cls.w.lck * rarity.mult * jitter()),
  };

  /* visual DNA */
  const armorHue = Math.floor(rng() * 360);
  const accentHue = (armorHue + 120 + Math.floor(rng() * 120)) % 360;
  const look = {
    skin: SKIN_TONES[Math.floor(rng() * (rarityIdx >= 4 ? SKIN_TONES.length : SKIN_TONES.length - 1))],
    hair: pick(rng, HAIR_COLORS),
    armor: makeRamp(armorHue, 46, 46),
    accent: hsl(accentHue, 78, 60),
    eye: rarityIdx >= 3 ? rarity.color : '#1c2030',
    emblem: Math.floor(rng() * 5),
    pads: rng() < 0.55,
    trim: rng() < 0.5,
    variant: Math.floor(rng() * 3),
    cape: rarityIdx >= 4,
  };

  return { seed, hash, rarity, rarityIdx, cls, element, trait, name, title, stats, look };
}

/* ---------------- monster generation ---------------- */

async function generateMonster(heroSeed, floor, runNonce) {
  const hash = await sha256Hex(`${heroSeed}::floor::${floor}::${runNonce}`);
  const bytes = hexToBytes(hash);
  const rng = mulberry32(u32(bytes, 0));
  const isBoss = floor % 5 === 0;
  const element = ELEMENTS[u32(bytes, 4) % ELEMENTS.length];

  const g = Math.pow(1.125, floor - 1);
  const stats = {
    hp:  Math.round(48 * g * (isBoss ? 2.0 : 1) * (0.9 + rng() * 0.2)),
    atk: Math.round(9 * Math.pow(1.10, floor - 1) * (isBoss ? 1.3 : 1) * (0.9 + rng() * 0.2)),
    def: Math.round(5 * Math.pow(1.085, floor - 1) * (0.9 + rng() * 0.2)),
    spd: Math.round(7 + floor * 0.55 + rng() * 4),
    crt: Math.round(4 + floor * 0.3),
  };
  let name = pick(rng, MON_A) + pick(rng, MON_B);
  if (isBoss) name = `${name} the ${pick(rng, BOSS_TITLES)}`;
  return { hash, rng: mulberry32(u32(bytes, 8)), name, element, stats, isBoss, floor };
}

/* ---------------- pixel sprite engine ---------------- */

const SPR = 28; // sprite grid is SPR × SPR
const OUTLINE = '#10121f';

function makeGrid(W, H) {
  const cells = new Array(W * H).fill(null);
  return {
    W, H, cells,
    set(x, y, c) { if (x >= 0 && x < W && y >= 0 && y < H) cells[y * W + x] = c; },
    get(x, y) { return (x >= 0 && x < W && y >= 0 && y < H) ? cells[y * W + x] : null; },
  };
}

function rect(g, x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) g.set(x + i, y + j, c); }
/* mirrored set/rect around the vertical centre of a 28-wide grid */
function mset(g, x, y, c) { g.set(x, y, c); g.set(g.W - 1 - x, y, c); }
function mrect(g, x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) mset(g, x + i, y + j, c); }

function applyOutline(g) {
  const o = makeGrid(g.W, g.H);
  o.cells.splice(0, o.cells.length, ...g.cells);
  for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++) {
    if (g.get(x, y)) continue;
    if (g.get(x + 1, y) || g.get(x - 1, y) || g.get(x, y + 1) || g.get(x, y - 1)) o.set(x, y, OUTLINE);
  }
  return o;
}

function buildHeroGrid(hero) {
  const g = makeGrid(SPR, SPR);
  const { look, cls } = hero;
  const [skin, skinSh] = look.skin;
  const A = look.armor, AC = look.accent;
  const metal = '#c8cdd8', metalD = '#868da0', wood = '#8a5a33';

  /* cape (legendary+) behind everything */
  if (look.cape) {
    mrect(g, 8, 12, 2, 8, AC);
    mrect(g, 9, 20, 1, 2, AC);
  }

  /* head */
  mrect(g, 11, 5, 3, 1, skin);
  mrect(g, 10, 6, 4, 4, skin);
  mrect(g, 11, 10, 3, 1, skin);
  mset(g, 10, 9, skinSh); // jaw shading
  /* eyes */
  g.set(12, 8, look.eye); g.set(15, 8, look.eye);

  /* torso */
  mrect(g, 10, 12, 4, 5, A.mid);
  mrect(g, 10, 12, 4, 1, look.trim ? A.light : A.mid);
  mset(g, 10, 13, A.dark); mset(g, 10, 14, A.dark); mset(g, 10, 15, A.dark);
  /* shoulders + arms */
  if (look.pads) { mrect(g, 8, 12, 2, 2, A.light); }
  mrect(g, 9, 13, 1, 3, A.dark);
  mset(g, 9, 16, skin); // hands
  /* belt */
  mrect(g, 10, 17, 4, 1, A.dark);
  mset(g, 13, 17, AC); // buckle (centre 2px via mirror)

  /* chest emblem variants */
  const cy = 14;
  if (look.emblem === 1) { mset(g, 13, cy, AC); }
  else if (look.emblem === 2) { mset(g, 13, 13, AC); mset(g, 13, 14, AC); mset(g, 13, 15, AC); }
  else if (look.emblem === 3) { mset(g, 13, 13, AC); mset(g, 12, 14, AC); mset(g, 13, 15, AC); }
  else if (look.emblem === 4) { mset(g, 13, 13, AC); mrect(g, 12, 14, 2, 1, AC); mset(g, 13, 15, AC); }

  const robed = cls.key === 'mage' || cls.key === 'cleric';
  if (robed) {
    /* robe skirt */
    mrect(g, 10, 18, 4, 4, A.mid);
    mrect(g, 9, 22, 5, 1, A.dark);
    mset(g, 13, 19, AC); mset(g, 13, 21, AC);
  } else {
    /* legs + boots */
    mrect(g, 10, 18, 2, 4, A.dark);
    mset(g, 12, 18, A.dark);
    mrect(g, 9, 22, 3, 1, '#3a3326');
    mset(g, 11, 21, '#3a3326');
  }

  /* ---- class headgear & weapons (asymmetric, drawn directly) ---- */
  switch (cls.key) {
    case 'knight': {
      mrect(g, 11, 3, 3, 1, A.light);
      mrect(g, 10, 4, 4, 2, A.mid);
      mrect(g, 10, 6, 1, 3, A.mid);
      mrect(g, 10, 7, 4, 1, A.dark); // visor brow
      if (look.variant > 0) { g.set(13, 2, AC); g.set(14, 2, AC); g.set(13, 1, AC); } // plume
      /* sword (right) */
      g.set(22, 7, metal);
      rect(g, 21, 8, 2, 8, metal); g.set(21, 8, '#eef2f8');
      rect(g, 19, 16, 5, 1, A.dark);
      rect(g, 21, 17, 1, 2, wood);
      /* shield (left) */
      rect(g, 4, 12, 3, 5, A.mid); rect(g, 4, 12, 3, 1, A.light);
      g.set(5, 14, AC); rect(g, 4, 17, 3, 1, A.dark);
      break;
    }
    case 'mage': {
      /* pointed hat */
      mrect(g, 9, 6, 5, 1, A.dark);
      mrect(g, 10, 5, 4, 1, A.mid);
      mrect(g, 11, 4, 3, 1, A.mid);
      mrect(g, 12, 3, 2, 1, A.mid);
      mset(g, 13, 2, A.light);
      g.set(14, 1, AC);
      /* staff with orb (right) */
      rect(g, 22, 7, 1, 12, wood);
      rect(g, 21, 4, 3, 3, AC); g.set(22, 5, '#ffffff');
      break;
    }
    case 'rogue': {
      /* hood */
      mrect(g, 10, 3, 4, 2, A.dark);
      mrect(g, 9, 5, 2, 4, A.dark);
      mrect(g, 11, 3, 3, 1, A.mid);
      g.set(12, 8, AC); g.set(15, 8, AC); // glowing eyes under hood
      mrect(g, 10, 11, 4, 1, AC); // scarf
      /* twin daggers */
      rect(g, 6, 11, 1, 4, metal); g.set(6, 10, '#eef2f8'); g.set(6, 15, wood);
      rect(g, 21, 11, 1, 4, metal); g.set(21, 10, '#eef2f8'); g.set(21, 15, wood);
      break;
    }
    case 'ranger': {
      /* cap + feather */
      mrect(g, 10, 4, 4, 2, A.mid);
      mrect(g, 9, 5, 1, 1, A.dark);
      g.set(16, 3, AC); g.set(17, 2, AC); g.set(17, 1, AC);
      /* bow (right) */
      rect(g, 23, 9, 1, 9, wood);
      g.set(22, 8, wood); g.set(21, 7, wood);
      g.set(22, 18, wood); g.set(21, 19, wood);
      for (let y = 7; y <= 19; y++) g.set(20, y, '#e8e4d0');
      break;
    }
    case 'cleric': {
      /* circlet + hair */
      mrect(g, 10, 4, 4, 2, look.hair);
      mrect(g, 10, 5, 4, 1, AC);
      /* staff with cross (right) */
      rect(g, 22, 7, 1, 12, wood);
      rect(g, 22, 3, 1, 3, '#ffd166'); rect(g, 21, 4, 3, 1, '#ffd166');
      break;
    }
    case 'berserker': {
      /* wild hair + horns */
      mrect(g, 10, 3, 4, 2, look.hair);
      mrect(g, 9, 4, 1, 2, look.hair);
      g.set(8, 3, metal); g.set(8, 2, metal); g.set(9, 1, '#eef2f8');
      g.set(19, 3, metal); g.set(19, 2, metal); g.set(18, 1, '#eef2f8');
      /* war axe (right) */
      rect(g, 22, 6, 1, 13, wood);
      rect(g, 19, 6, 3, 4, metal); rect(g, 19, 6, 1, 4, metalD);
      rect(g, 24, 6, 3, 4, metal); rect(g, 26, 6, 1, 4, metalD);
      break;
    }
  }

  return applyOutline(g);
}

function buildMonsterGrid(mon) {
  const size = mon.isBoss ? 18 : 14;
  const g = makeGrid(size + 4, size + 4);
  const rng = mulberry32(hexToBytes(mon.hash).slice(0, 4).reduce((a, b) => (a << 8) + b, 0) >>> 0);
  const baseHue = { ember: 14, tide: 210, gale: 90, stone: 28, bloom: 130, umbra: 268 }[mon.element.key];
  const ramp = makeRamp(baseHue + Math.floor(rng() * 24) - 12, 52, mon.isBoss ? 42 : 48);
  const half = Math.ceil(size / 2);
  const ox = 2, oy = 2;
  /* mirrored noise body with a denser core — the classic "no two alike" silhouette */
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < half; x++) {
      const cx = half - x, cyd = Math.abs(y - size / 2) / (size / 2);
      const density = 0.78 - (cx / half) * 0.45 - cyd * 0.28;
      if (rng() < density) {
        const c = rng() < 0.22 ? ramp.dark : (rng() < 0.18 ? ramp.light : ramp.mid);
        g.set(ox + x, oy + y, c);
        g.set(ox + size - 1 - x, oy + y, c);
      }
    }
  }
  /* eyes — always visible, element-tinted */
  const ey = oy + Math.floor(size * 0.32) + Math.floor(rng() * 2);
  const exo = 2 + Math.floor(rng() * 2);
  const eyeC = mon.isBoss ? '#ff4d6d' : '#ffe14d';
  for (const ex of [ox + half - exo, ox + size - 1 - half + exo]) {
    g.set(ex, ey, eyeC); g.set(ex, ey - 1, eyeC);
    g.set(ex, ey + 1, '#10121f');
  }
  return applyOutline(g);
}

function paintGrid(canvas, grid) {
  canvas.width = grid.W; canvas.height = grid.H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, grid.W, grid.H);
  for (let y = 0; y < grid.H; y++) for (let x = 0; x < grid.W; x++) {
    const c = grid.get(x, y);
    if (c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }
  }
}

/* ---------------- battle engine ---------------- */

const battle = {
  hero: null, mon: null, floor: 1, runNonce: 0,
  hp: 0, maxHp: 0, mhp: 0, cd: 0, potions: 3, stunned: 0,
  usedSturdy: false, over: false, busy: false,
};

function heroAtk(h, hpFrac) {
  let a = h.stats.atk;
  if (h.trait.key === 'berserk' && hpFrac < 0.3) a *= 1.25;
  return a;
}
function heroDef(h) { return h.stats.def * (h.trait.key === 'stalwart' ? 1.2 : 1); }

function elementMod(att, def) {
  if (att.key === 'umbra' || def.key === 'umbra') return 1.12;
  if (att.beats === def.key) return 1.2;
  if (def.beats === att.key) return 0.88;
  return 1;
}

function damage(atk, def, mult, critPct, rng) {
  const variance = 0.85 + rng() * 0.3;
  let dmg = atk * mult * variance * (100 / (100 + def));
  const crit = rng() * 100 < critPct;
  if (crit) dmg *= 1.6;
  return { dmg: Math.max(1, Math.round(dmg)), crit };
}

/* ---------------- DOM / UI ---------------- */

if (typeof document !== 'undefined') (function () {

  const $ = id => document.getElementById(id);
  const els = {};
  ['seedInput', 'btnSummon', 'btnRandom', 'btnDaily', 'reveal', 'beam', 'heroCard', 'heroCanvas',
   'heroName', 'heroTitle', 'rarityBadge', 'heroMeta', 'heroTrait', 'heroHash', 'statBars',
   'btnSpire', 'btnShare', 'btnAgain', 'shareNote',
   'spireLocked', 'spireArena', 'floorLabel', 'bhName', 'bhMeta', 'bhCanvas', 'bhHpBar', 'bhHpText',
   'bmName', 'bmMeta', 'bmCanvas', 'bmHpBar', 'bmHpText', 'log',
   'btnAttack', 'btnSkill', 'btnGuard', 'btnPotion', 'battleEnd', 'endTitle', 'endDesc', 'btnRetry', 'btnEndSummon',
   'hallGrid', 'hallEmpty', 'oddsTable',
  ].forEach(id => els[id] = $(id));

  let currentHero = null;

  /* ----- screens ----- */
  const screens = ['summon', 'spire', 'hall'];
  function show(name) {
    screens.forEach(s => {
      $(`screen-${s}`).classList.toggle('active', s === name);
      $(`tab-${s}`).classList.toggle('active', s === name);
    });
    if (name === 'hall') renderHall();
  }
  screens.forEach(s => $(`tab-${s}`).addEventListener('click', () => show(s)));

  /* ----- hall persistence ----- */
  const STORE = 'hashborn.hall.v1';
  const loadHall = () => { try { return JSON.parse(localStorage.getItem(STORE)) || []; } catch { return []; } };
  const saveHall = h => localStorage.setItem(STORE, JSON.stringify(h.slice(0, 200)));

  function recordHero(hero) {
    const hall = loadHall();
    const i = hall.findIndex(e => e.seed === hero.seed);
    const entry = { seed: hero.seed, name: hero.name, rarity: hero.rarity.key, cls: hero.cls.key, best: i >= 0 ? hall[i].best : 0, ts: Date.now() };
    if (i >= 0) entry.best = hall[i].best, hall.splice(i, 1);
    hall.unshift(entry);
    saveHall(hall);
  }
  function recordBest(seed, floor) {
    const hall = loadHall();
    const e = hall.find(x => x.seed === seed);
    if (e && floor > (e.best || 0)) { e.best = floor; saveHall(hall); }
  }

  /* ----- odds table ----- */
  els.oddsTable.innerHTML = RARITIES.map(r =>
    `<div class="odds-row"><span class="odds-name" style="color:${r.color}">${r.name}</span>
     <span class="odds-bar"><i style="width:${Math.max(2, r.weight)}%;background:${r.color}"></i></span>
     <span class="odds-pct">${r.weight}%</span></div>`).join('');

  /* ----- stat bars ----- */
  const STAT_MAX = { hp: 320, atk: 60, def: 40, spd: 35, crt: 25, lck: 22 };
  const STAT_LABEL = { hp: 'HP', atk: 'ATK', def: 'DEF', spd: 'SPD', crt: 'CRIT', lck: 'LUCK' };
  function renderStats(hero) {
    els.statBars.innerHTML = Object.keys(STAT_LABEL).map(k => {
      const v = hero.stats[k];
      const pct = Math.min(100, Math.round(v / STAT_MAX[k] * 100));
      return `<div class="stat"><span class="stat-k">${STAT_LABEL[k]}</span>
        <span class="stat-bar"><i style="width:${pct}%"></i></span>
        <span class="stat-v">${v}</span></div>`;
    }).join('');
  }

  /* ----- summon flow ----- */
  async function summon(seed, opts = {}) {
    seed = (seed || '').trim();
    if (!seed) return;
    els.btnSummon.disabled = true;
    const hero = await generateHero(seed);
    currentHero = hero;
    recordHero(hero);

    els.heroCard.classList.remove('shown', ...RARITIES.map(r => `r-${r.key}`));
    els.reveal.classList.remove('hidden');

    const showCard = () => {
      const r = hero.rarity;
      document.documentElement.style.setProperty('--rarity', r.color);
      els.heroCard.classList.add('shown', `r-${r.key}`);
      els.heroName.textContent = hero.name;
      els.heroTitle.textContent = hero.title;
      els.rarityBadge.textContent = r.name;
      els.rarityBadge.style.background = r.color;
      els.heroMeta.innerHTML =
        `<span class="chip">${hero.cls.icon} ${hero.cls.name}</span>` +
        `<span class="chip" style="color:${hero.element.color}">◆ ${hero.element.name}</span>`;
      els.heroTrait.innerHTML = `<b>${hero.trait.name}</b> — ${hero.trait.desc}<br><span class="skill-line">${hero.cls.skill.name}: ${hero.cls.skill.desc}</span>`;
      els.heroHash.textContent = hero.hash.slice(0, 16) + '…' + hero.hash.slice(-8);
      els.heroHash.title = hero.hash;
      renderStats(hero);
      paintGrid(els.heroCanvas, buildHeroGrid(hero));
      els.btnSpire.disabled = false;
      if (hero.rarityIdx >= 4) document.body.classList.add('shake');
      setTimeout(() => document.body.classList.remove('shake'), 500);
      els.btnSummon.disabled = false;
      els.shareNote.textContent = '';
    };

    if (opts.instant) {
      els.beam.classList.remove('animate');
      showCard();
    } else {
      /* gacha-style reveal: white beam → flashes rarity colour → card slams in */
      els.beam.style.setProperty('--beam', hero.rarity.color);
      els.beam.classList.remove('animate');
      void els.beam.offsetWidth; // restart animation
      els.beam.classList.add('animate');
      setTimeout(showCard, 1250);
    }
  }

  els.btnSummon.addEventListener('click', () => summon(els.seedInput.value));
  els.seedInput.addEventListener('keydown', e => { if (e.key === 'Enter') summon(els.seedInput.value); });
  els.btnRandom.addEventListener('click', () => { els.seedInput.value = randomUUID(); summon(els.seedInput.value); });
  els.btnDaily.addEventListener('click', () => {
    const d = new Date().toISOString().slice(0, 10);
    els.seedInput.value = `HASHBORN-DAILY-${d}`;
    summon(els.seedInput.value);
  });
  els.btnAgain.addEventListener('click', () => { els.seedInput.value = randomUUID(); summon(els.seedInput.value); });

  els.btnShare.addEventListener('click', async () => {
    if (!currentHero) return;
    const url = `${location.origin}${location.pathname}?s=${encodeURIComponent(currentHero.seed)}`;
    try { await navigator.clipboard.writeText(url); els.shareNote.textContent = 'Link copied! Anyone who opens it meets the exact same soul.'; }
    catch { els.shareNote.textContent = url; }
  });

  /* ----- battle ----- */
  function log(msg, cls = '') {
    const div = document.createElement('div');
    div.className = `log-line ${cls}`;
    div.innerHTML = msg;
    els.log.prepend(div);
    while (els.log.children.length > 40) els.log.lastChild.remove();
  }

  function setBars() {
    const hPct = Math.max(0, battle.hp / battle.maxHp * 100);
    const mPct = Math.max(0, battle.mhp / battle.mon.stats.hp * 100);
    els.bhHpBar.style.width = hPct + '%';
    els.bhHpBar.style.background = hPct > 50 ? '#51d88a' : hPct > 25 ? '#ffa726' : '#ff4d6d';
    els.bhHpText.textContent = `${Math.max(0, battle.hp)} / ${battle.maxHp}`;
    els.bmHpBar.style.width = mPct + '%';
    els.bmHpText.textContent = `${Math.max(0, battle.mhp)} / ${battle.mon.stats.hp}`;
    els.btnPotion.textContent = `POTION ×${battle.potions}`;
    els.btnSkill.textContent = battle.cd > 0 ? `SKILL (${battle.cd})` : 'SKILL';
    els.btnSkill.disabled = battle.cd > 0 || battle.over || battle.busy;
    els.btnPotion.disabled = battle.potions <= 0 || battle.over || battle.busy;
    els.btnAttack.disabled = els.btnGuard.disabled = battle.over || battle.busy;
  }

  async function newFloor() {
    battle.mon = await generateMonster(battle.hero.seed, battle.floor, battle.runNonce);
    battle.mhp = battle.mon.stats.hp;
    battle.cd = 0; battle.stunned = 0;
    els.floorLabel.textContent = `FLOOR ${battle.floor}`;
    els.floorLabel.classList.toggle('boss', battle.mon.isBoss);
    els.bmName.textContent = battle.mon.name;
    els.bmMeta.innerHTML = `<span style="color:${battle.mon.element.color}">◆ ${battle.mon.element.name}</span>${battle.mon.isBoss ? ' · <b class="boss-tag">BOSS</b>' : ''}`;
    paintGrid(els.bmCanvas, buildMonsterGrid(battle.mon));
    els.bmCanvas.parentElement.classList.toggle('is-boss', battle.mon.isBoss);
    log(`${battle.mon.isBoss ? '⟐ A floor boss blocks the way: ' : 'A wild '}<b>${battle.mon.name}</b> appears on floor ${battle.floor}.`, battle.mon.isBoss ? 'l-boss' : 'l-sys');
    setBars();
  }

  async function startRun() {
    const h = currentHero;
    battle.hero = h;
    battle.maxHp = h.stats.hp; battle.hp = h.stats.hp;
    battle.floor = 1; battle.potions = 3; battle.over = false; battle.busy = false;
    battle.usedSturdy = false;
    battle.runNonce = Date.now().toString(36);
    els.battleEnd.classList.add('hidden');
    els.spireLocked.classList.add('hidden');
    els.spireArena.classList.remove('hidden');
    els.bhName.textContent = h.name;
    els.bhMeta.innerHTML = `<span>${h.cls.icon} ${h.cls.name}</span> · <span style="color:${h.rarity.color}">${h.rarity.name}</span>`;
    paintGrid(els.bhCanvas, buildHeroGrid(h));
    els.log.innerHTML = '';
    log(`<b>${h.name} ${h.title}</b> enters the Spire. Rarity: <b style="color:${h.rarity.color}">${h.rarity.name}</b>.`, 'l-sys');
    await newFloor();
    show('spire');
  }

  els.btnSpire.addEventListener('click', startRun);
  els.btnRetry.addEventListener('click', startRun);
  els.btnEndSummon.addEventListener('click', () => show('summon'));

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rng = Math.random;

  function heroHit(mult, ignoreDefFrac, bonusCrit = 0) {
    const h = battle.hero;
    const elM = elementMod(h.element, battle.mon.element);
    const giant = (h.trait.key === 'giantbane' && battle.mon.isBoss) ? 1.2 : 1;
    const critPct = h.stats.crt + (h.trait.key === 'lucky' ? 8 : 0) + bonusCrit;
    const def = battle.mon.stats.def * (1 - ignoreDefFrac);
    return damage(heroAtk(h, battle.hp / battle.maxHp), def, mult * elM * giant, critPct, rng);
  }

  function dealToMonster(r, label) {
    battle.mhp -= r.dmg;
    flash(els.bmCanvas);
    log(`${label} hits <b>${battle.mon.name}</b> for <b>${r.dmg}</b>${r.crit ? ' <span class="l-crit">CRIT!</span>' : ''}`, 'l-hero');
    if (battle.hero.trait.key === 'vampiric') {
      const heal = Math.max(1, Math.round(r.dmg * 0.10));
      battle.hp = Math.min(battle.maxHp, battle.hp + heal);
    }
  }

  function flash(canvas) {
    canvas.classList.remove('hit'); void canvas.offsetWidth; canvas.classList.add('hit');
  }

  async function monsterTurn(guarding) {
    if (battle.mhp <= 0 || battle.over) return;
    if (battle.stunned > 0) {
      battle.stunned--;
      log(`<b>${battle.mon.name}</b> is stunned and loses its turn!`, 'l-sys');
      return;
    }
    await sleep(420);
    const m = battle.mon, h = battle.hero;
    const dodgePct = Math.max(0, (h.stats.spd - m.stats.spd) * 0.8) + h.stats.lck * 0.5 + (h.trait.key === 'lucky' ? 8 : 0);
    if (rng() * 100 < Math.min(35, dodgePct)) {
      log(`<b>${h.name}</b> dodges the attack!`, 'l-hero');
      return;
    }
    const elM = elementMod(m.element, h.element);
    const r = damage(m.stats.atk, heroDef(h), elM * (guarding ? 0.4 : 1), m.stats.crt, rng);
    battle.hp -= r.dmg;
    flash(els.bhCanvas);
    log(`<b>${m.name}</b> strikes for <b>${r.dmg}</b>${r.crit ? ' <span class="l-crit">CRIT!</span>' : ''}${guarding ? ' (guarded)' : ''}`, 'l-mon');
    if (h.trait.key === 'thorns') {
      const ref = Math.max(1, Math.round(r.dmg * 0.12));
      battle.mhp -= ref;
      log(`Thorns reflect <b>${ref}</b> damage.`, 'l-hero');
    }
    if (battle.hp <= 0 && h.trait.key === 'sturdy' && !battle.usedSturdy) {
      battle.usedSturdy = true;
      battle.hp = 1;
      log(`<b>Undying Will!</b> ${h.name} refuses to fall — 1 HP remains.`, 'l-crit');
    }
  }

  async function resolveRound(actionFn, guarding = false, tickCd = true) {
    if (battle.over || battle.busy) return;
    battle.busy = true; setBars();
    if (tickCd && battle.cd > 0) battle.cd--;
    const h = battle.hero, m = battle.mon;
    const heroFirst = h.trait.key === 'swift' || h.stats.spd >= m.stats.spd || guarding;
    if (heroFirst) { await actionFn(); await checkMonsterDown(); await monsterTurn(guarding); }
    else { await monsterTurn(guarding); if (battle.hp > 0) { await sleep(380); await actionFn(); } }
    if (battle.hp <= 0 && !battle.over) return defeat();
    await checkMonsterDown(); // covers thorns kills and monster-first rounds
    battle.busy = false;
    setBars();
  }

  async function checkMonsterDown() {
    if (battle.mhp > 0 || battle.over) return;
    setBars();
    const h = battle.hero;
    const healFrac = h.trait.key === 'wind2' ? 0.20 : 0.08;
    const heal = Math.round(battle.maxHp * healFrac);
    battle.hp = Math.min(battle.maxHp, battle.hp + heal);
    log(`<b>${battle.mon.name}</b> is defeated! ${h.name} recovers <b>${heal}</b> HP.`, 'l-sys');
    recordBest(h.seed, battle.floor);
    battle.floor++;
    await sleep(650);
    await newFloor();
    battle.busy = false;
    setBars();
    throw { handled: true }; // unwind the round; new floor begins fresh
  }

  function defeat() {
    battle.over = true; battle.busy = false;
    recordBest(battle.hero.seed, battle.floor - 1);
    setBars();
    log(`<b>${battle.hero.name}</b> has fallen on floor ${battle.floor}…`, 'l-boss');
    els.endTitle.textContent = `FALLEN ON FLOOR ${battle.floor}`;
    const best = (loadHall().find(e => e.seed === battle.hero.seed) || {}).best || 0;
    els.endDesc.textContent = `${battle.hero.name} ${battle.hero.title} cleared ${battle.floor - 1} floor${battle.floor - 1 === 1 ? '' : 's'}. Best: ${best}.`;
    els.battleEnd.classList.remove('hidden');
  }

  const swallow = e => { if (!(e && e.handled)) console.error(e); };

  els.btnAttack.addEventListener('click', () =>
    resolveRound(async () => {
      const r = heroHit(1.0, 0);
      dealToMonster(r, `<b>${battle.hero.name}</b>`);
    }).catch(swallow));

  els.btnSkill.addEventListener('click', () =>
    resolveRound(async () => {
      const h = battle.hero;
      const baseCd = h.trait.key === 'focused' ? 2 : 3;
      battle.cd = (h.trait.key === 'echo' && rng() < 0.18) ? 0 : baseCd;
      const s = h.cls.skill.name;
      switch (h.cls.key) {
        case 'knight': {
          const r = heroHit(1.3, 0); dealToMonster(r, `<b>${s}</b>`);
          if (rng() < 0.45) { battle.stunned = 1; log(`<b>${battle.mon.name}</b> is stunned!`, 'l-hero'); }
          break;
        }
        case 'mage': dealToMonster(heroHit(1.9, 0.5), `<b>${s}</b>`); break;
        case 'rogue': {
          dealToMonster(heroHit(0.85, 0, 10), `<b>${s}</b> (1st)`);
          if (battle.mhp > 0) { await sleep(260); dealToMonster(heroHit(0.85, 0, 10), `<b>${s}</b> (2nd)`); }
          break;
        }
        case 'ranger': dealToMonster(heroHit(1.5, 1), `<b>${s}</b>`); break;
        case 'cleric': {
          dealToMonster(heroHit(1.2, 0), `<b>${s}</b>`);
          const heal = Math.round(battle.maxHp * 0.22);
          battle.hp = Math.min(battle.maxHp, battle.hp + heal);
          log(`${battle.hero.name} mends <b>${heal}</b> HP.`, 'l-hero');
          break;
        }
        case 'berserker': {
          dealToMonster(heroHit(2.3, 0), `<b>${s}</b>`);
          const recoil = Math.round(battle.maxHp * 0.10);
          battle.hp -= recoil;
          log(`Rampage recoil: <b>${recoil}</b> damage to self.`, 'l-mon');
          break;
        }
      }
    }).catch(swallow));

  els.btnGuard.addEventListener('click', () =>
    resolveRound(async () => {
      const heal = Math.round(battle.maxHp * 0.05);
      battle.hp = Math.min(battle.maxHp, battle.hp + heal);
      log(`<b>${battle.hero.name}</b> raises guard (+${heal} HP, −60% damage this turn).`, 'l-hero');
    }, true).catch(swallow));

  els.btnPotion.addEventListener('click', () =>
    resolveRound(async () => {
      battle.potions--;
      const frac = battle.hero.trait.key === 'herbalist' ? 0.55 : 0.40;
      const heal = Math.round(battle.maxHp * frac);
      battle.hp = Math.min(battle.maxHp, battle.hp + heal);
      log(`<b>${battle.hero.name}</b> drinks a potion and restores <b>${heal}</b> HP.`, 'l-hero');
    }).catch(swallow));

  /* tick cooldown at the end of each player action round */
  ['btnAttack', 'btnGuard', 'btnPotion'].forEach(id =>
    els[id].addEventListener('click', () => { if (battle.cd > 0) battle.cd--; }));

  /* ----- hall ----- */
  async function renderHall() {
    const hall = loadHall();
    els.hallEmpty.classList.toggle('hidden', hall.length > 0);
    els.hallGrid.innerHTML = '';
    for (const e of hall) {
      const r = RARITIES.find(x => x.key === e.rarity);
      const card = document.createElement('button');
      card.className = `hall-card r-${e.rarity}`;
      card.innerHTML = `<canvas width="28" height="28"></canvas>
        <span class="hc-name">${e.name}</span>
        <span class="hc-rarity" style="color:${r.color}">${r.name}</span>
        <span class="hc-best">⛩ ${e.best || 0}</span>`;
      card.title = `seed: ${e.seed}`;
      card.addEventListener('click', async () => {
        els.seedInput.value = e.seed;
        show('summon');
        await summon(e.seed, { instant: true });
      });
      els.hallGrid.appendChild(card);
      const hero = await generateHero(e.seed);
      paintGrid(card.querySelector('canvas'), buildHeroGrid(hero));
    }
  }

  /* ----- boot: shared link or fresh start ----- */
  const params = new URLSearchParams(location.search);
  const shared = params.get('s');
  if (shared) {
    els.seedInput.value = shared;
    summon(shared);
  }
})();

/* headless test hook (node) */
if (typeof module !== 'undefined') {
  module.exports = { sha256Hex, sha256Fallback, generateHero, generateMonster, buildHeroGrid, buildMonsterGrid, RARITIES, CLASSES, damage, elementMod, heroAtk, heroDef };
}
