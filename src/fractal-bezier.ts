// Fractal Bézier: curves drawn by replacing a triangle with smaller triangles, again and again.
// Pure functions with no DOM access: the same code runs in Node (tests, a static site build)
// and in the browser (the tool at bsulkowski.pl/fractal-bezier).
//
// A triangle (start, control, end) is the control polygon of a quadratic Bézier curve.
// A rule lists smaller triangles in the coordinates of the big one. Splitting the curve
// in half (de Casteljau) gives a rule of two triangles whose limit is the smooth curve
// itself; any other rule gives a fractal. Each finished triangle is drawn as its chord,
// from start to end.
//
// Successor of a Groovy script from 2011, most of its shapes from 2014 (iterate_shape,
// apply_shape). Kept from it:
// the affine coordinates of the rule, the bases, the shapes and their names.
// New: a detail limit instead of a fixed depth for every piece, a budget, the link.

export type Lang = 'en' | 'pl';

// Shown discreetly under the drawing. The link parameters (see parseSettings) are the promise:
// an old link keeps meaning the same rule; the drawing details may improve.
export const TOOL_VERSION = '1.2';

/** A point: [x, y]. In a rule, [a, b]: affine coordinates of the parent triangle. */
export type Point = [number, number];
/** A triangle: start, control point, end — the control polygon of a quadratic Bézier curve. */
export type Piece = [Point, Point, Point];
/** Smaller triangles in the coordinates of the parent: [1, 0] its start, [0, 0] its control, [0, 1] its end. */
export type Rule = Piece[];
export type BaseId = 'arch' | 'loop' | 'pair';
export type LineId = 'thin' | 'medium' | 'thick';
export type InkId = 'blue' | 'grey' | 'green' | 'sepia';
/** A preset colour, or one's own as six hex digits (1f3a7a). */
export type Ink = InkId | string;

export interface Settings {
  rule: Rule;
  base: BaseId;
  depth: number;          // levels of replacement, 0 = the base itself
  line: LineId;
  construction: boolean;  // draw the control triangles of the finished pieces too
  ink: Ink;               // colour of the line
}

export const MAX_DEPTH = 12;
export const MAX_PIECES = 12;
/** Points dragged in the editor land on multiples of this, in affine coordinates. */
export const SNAP = 1 / 24;

const H = Math.sqrt(3);

// Bases, in plane coordinates (y down): the arch spans x from −1 to 1 under an equilateral apex.
export const BASES: Record<BaseId, Piece[]> = {
  // One arch: the reference triangle every rule is drawn on in the editor.
  arch: [[[-1, 0], [0, -H], [1, 0]]],
  // Three arches around a triangle, bulging outwards: the Koch rule makes the snowflake.
  loop: [
    [[-1, 0], [0, -H], [1, 0]],
    [[1, 0], [2, H], [0, H]],
    [[0, H], [-2, H], [-1, 0]],
  ],
  // Two arches from the bottom corners up to a common top, mirror images of each other.
  pair: [
    [[-1, 0], [-2, -H], [0, -H]],
    [[1, 0], [2, -H], [0, -H]],
  ],
};
export const BASE_IDS: BaseId[] = ['arch', 'loop', 'pair'];
export const REFERENCE: Piece = BASES.arch[0];

/** Line widths in thousandths of the drawing's side. */
export const LINES: Record<LineId, number> = { thin: 0.8, medium: 1.6, thick: 3.2 };
export const LINE_IDS: LineId[] = ['thin', 'medium', 'thick'];
export const INK = '#1f3a7a';
export const CONSTRUCTION_INK = '#aab3cc';

/** Line colours, as in Graph Paper (bsulkowski/graph-paper), with the site's ink for blue. */
export const INKS: Record<InkId, string> = {
  blue: INK,
  grey: '#666666',
  green: '#4f8c5d',
  sepia: '#8b5e3c',
};
export const INK_IDS: InkId[] = ['blue', 'grey', 'green', 'sepia'];

/** The line colour and the paler one of the construction triangles, two thirds of the way to white. */
export function inkColors(ink: Ink): { line: string; construction: string } {
  const hex = ink in INKS ? INKS[ink as InkId].slice(1) : /^[0-9a-f]{6}$/i.test(ink) ? ink.toLowerCase() : INK.slice(1);
  const pale = [0, 2, 4].map((i) => Math.round((parseInt(hex.slice(i, i + 2), 16) + 2 * 255) / 3).toString(16).padStart(2, '0')).join('');
  return { line: `#${hex}`, construction: `#${pale}` };
}

// ---- Presets: the shapes of the old script, with thirds written exactly ----

export interface Preset {
  id: string;
  name: Record<Lang, string>;
  base: BaseId;
  rule: Rule;
}

const t = 1 / 3, u = 2 / 3;

export const PRESETS: Preset[] = [
  { id: 'koch', name: { en: 'Koch snowflake', pl: 'Płatek Kocha' }, base: 'loop', rule: [
    [[1, 0], [u, 0], [u, t]],
    [[u, t], [u, 0], [t, t]],
    [[t, t], [0, u], [t, u]],
    [[t, u], [0, u], [0, 1]],
  ] },
  { id: 'bezier', name: { en: 'Bézier curve', pl: 'Krzywa Béziera' }, base: 'arch', rule: [
    [[1, 0], [0.5, 0], [0.25, 0.25]],
    [[0.25, 0.25], [0, 0.5], [0, 1]],
  ] },
  // Found by hand in 2026, on the loop base: 1.4% from a circle, but a fractal up close. An exact
  // circle cannot come out of this method: an affine map turns a circle into an ellipse.
  { id: 'wheel', name: { en: 'Wheel', pl: 'Koło' }, base: 'loop', rule: [
    [[1, 0], [0.5867, -0.0036], [0.3393, 0.3353]],
    [[0.3393, 0.3353], [0.0056, 0.5959], [0, 1]],
  ] },
  { id: 'loops', name: { en: 'Loops', pl: 'Pętelki' }, base: 'arch', rule: [
    [[1, 0], [0.5, 0], [0.25, 0.25]],
    [[0.25, 0.25], [0.5, 0], [0.25, 0]],
    [[0.25, 0], [0, 0], [0, 0.25]],
    [[0, 0.25], [0, 0.5], [0.25, 0.25]],
    [[0.25, 0.25], [0, 0.5], [0, 1]],
  ] },
  { id: 'vine', name: { en: 'Vine', pl: 'Pnącze' }, base: 'arch', rule: [
    [[1, 0], [0.5, 0], [0.25, 0.25]],
    [[0.25, 0.25], [0.25, 0], [0, 0.25]],
    [[0.25, 0.25], [0.25, 0.75], [0.75, 0.25]],
    [[0.25, 0.25], [0, 0.5], [0, 1]],
  ] },
  { id: 'sail', name: { en: 'Sail', pl: 'Żagiel' }, base: 'arch', rule: [
    [[1, 0], [0.5, 0], [t, t]],
    [[t, t], [0.5, 0], [0, 0]],
    [[0, 0], [t, t], [0, 1]],
  ] },
  { id: 'mountains', name: { en: 'Mountains', pl: 'Góry' }, base: 'arch', rule: [
    [[1, 0], [0.5, 0], [0, 0.5]],
    [[0, 0.5], [0.5, 0.5], [0, 1]],
  ] },
  { id: 'hay', name: { en: 'Hay', pl: 'Siano' }, base: 'arch', rule: [
    [[1, 0], [0.5, 0.5], [0, 0.5]],
    [[0, 0.5], [0.125, 0.125], [0.5, 0]],
    [[0.5, 0], [0, 0.5], [0, 1]],
  ] },
  { id: 'fly', name: { en: 'Fly', pl: 'Mucha' }, base: 'arch', rule: [
    [[1, 0], [0.5, 0], [0, 0.5]],
    [[0, 0.5], [0.5, 0.5], [0.5, 0]],
    [[0.5, 0], [0, 0.5], [0, 1]],
  ] },
  { id: 'sierpinski', name: { en: 'Sierpiński arrowhead', pl: 'Grot Sierpińskiego' }, base: 'arch', rule: [
    [[1, 0], [0.5, 0.5], [0.5, 0]],
    [[0.5, 0], [0, 0], [0, 0.5]],
    [[0, 0.5], [0.5, 0.5], [0, 1]],
  ] },
  { id: 'star', name: { en: 'Little star', pl: 'Gwiazdka' }, base: 'arch', rule: [
    [[1, 0], [u, 0], [u, t]],
    [[u, t], [u, 0], [t, t]],
    [[t, t], [u, 0], [t, 0]],
    [[t, 0], [0, 0], [0, t]],
    [[0, t], [0, u], [t, t]],
    [[t, t], [0, u], [t, u]],
    [[t, u], [0, u], [0, 1]],
  ] },
  { id: 'lace', name: { en: 'Lace', pl: 'Koronka' }, base: 'arch', rule: [
    [[1, 0], [u, 0], [u, t]],
    [[u, t], [t, t], [u, 0]],
    [[u, 0], [t, t], [t, 0]],
    [[t, 0], [t, t], [0, t]],
    [[0, t], [t, t], [0, u]],
    [[0, u], [t, t], [t, u]],
    [[t, u], [0, u], [0, 1]],
  ] },
  { id: 'dragon', name: { en: 'Dragon', pl: 'Smok' }, base: 'arch', rule: [
    [[1, 0], [0.75, 0], [0.75, 0.25]],
    [[0.75, 0.25], [0.25, 0.5], [0.5, 0]],
    [[0.5, 0], [0, 0], [0, 0.5]],
    [[0, 0.5], [-0.25, 1], [0.25, 0.75]],
    [[0.25, 0.75], [0.25, 1], [0, 1]],
  ] },
  { id: 'cathedral', name: { en: 'Cathedral', pl: 'Katedra' }, base: 'arch', rule: [
    [[1, 0], [u, 0], [u, t]],
    [[u, t], [t, 0], [0, 0]],
    [[0, 0], [0, t], [t, u]],
    [[t, u], [0, u], [0, 1]],
  ] },
  { id: 'tree', name: { en: 'Christmas tree', pl: 'Choinka' }, base: 'pair', rule: [
    [[1, 0], [0.6, 0.4], [0.6, 0.6]],
    [[0.6, 0.6], [0.5, 0.6], [0.6, 0.4]],
    [[0.6, 0.4], [0.1, 0.5], [0, 1]],
  ] },
  { id: 'heart', name: { en: 'Heart', pl: 'Serce' }, base: 'arch', rule: [
    [[1, 0], [0.5, 0], [0.25, 0.25]],
    [[0.25, 0.25], [t, 0], [0.25, 0]],
    [[0.25, 0], [0.125, 0], [0.125, 0.125]],
    [[0.125, 0.125], [0, 0.125], [0, 0.25]],
    [[0, 0.25], [0, t], [0.25, 0.25]],
    [[0.25, 0.25], [0, 0.5], [0, 1]],
  ] },
];

/**
 * Shapes no longer in the gallery, and the Vine as it was: read from links made before 1.2
 * (shape=<name>), so that such a link still opens the same drawing.
 */
const RETIRED_SHAPES: Preset[] = [
  { id: 'vine', name: { en: 'Vine', pl: 'Pnącze' }, base: 'arch', rule: [
    [[1, 0], [0.5, 0], [0.25, 0.25]],
    [[0.25, 0.25], [0.25, 0], [0, 0]],
    [[0.25, 0.25], [0.25, 0.5], [0.5, 0.5]],
    [[0.25, 0.25], [0, 0.5], [0, 1]],
  ] },
  { id: 'ladder', name: { en: 'Ladder', pl: 'Drabina' }, base: 'arch', rule: [
    [[1, 0], [0.5, 0], [0.25, 0.25]],
    [[0.5, 0], [0, 0], [0, 0.5]],
    [[0.25, 0.25], [0, 0.5], [0, 1]],
  ] },
  { id: 'tower', name: { en: 'Tower', pl: 'Wieża' }, base: 'arch', rule: [
    [[1, 0], [5 / 12, 1 / 6], [1 / 6, 5 / 12]],
    [[1 / 6, 5 / 12], [0, 0], [5 / 12, 1 / 6]],
    [[5 / 12, 1 / 6], [1 / 6, 5 / 12], [0, 1]],
  ] },
  { id: 'babia-gora', name: { en: 'Babia Góra', pl: 'Babia Góra' }, base: 'arch', rule: [
    [[1, 0], [0.5, 0], [0.5, 0.25]],
    [[0.5, 0.25], [0.5, 0.5], [0.25, 0.5]],
    [[0.25, 0.5], [0, 0.5], [0, 1]],
  ] },
  { id: 'frost', name: { en: 'Frost', pl: 'Szron' }, base: 'arch', rule: [
    [[1, 0], [1, t], [u, t]],
    [[u, t], [t, t], [u, 0]],
    [[u, 0], [u, -t], [t, 0]],
    [[t, 0], [t, t], [0, t]],
    [[0, t], [-t, u], [0, u]],
    [[0, u], [t, t], [t, u]],
    [[t, u], [t, 1], [0, 1]],
  ] },
  { id: 'hut', name: { en: 'Hut', pl: 'Szałas' }, base: 'arch', rule: [
    [[1, 0], [0.5, 0], [0, 0.5]],
    [[0.5, 0], [0, 0.5], [0, 1]],
  ] },
  { id: 'windmill', name: { en: 'Windmill', pl: 'Wiatrak' }, base: 'loop', rule: [
    [[t, t], [u, 0], [1, 0]],
    [[t, t], [0, t], [0, 0]],
    [[t, t], [t, u], [0, 1]],
  ] },
];

export const DEFAULTS: Settings = {
  rule: presetById('koch')!.rule,
  base: 'loop',
  depth: 10,
  line: 'medium',
  construction: false,
  ink: 'blue',
};

export function presetById(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

// ---- Geometry ----

/** The point with affine coordinates [a, b] in the triangle: control + a·(start − control) + b·(end − control). */
export function affine(parent: Piece, [a, b]: Point): Point {
  const [s, c, e] = parent;
  return [c[0] + a * (s[0] - c[0]) + b * (e[0] - c[0]), c[1] + a * (s[1] - c[1]) + b * (e[1] - c[1])];
}

/** The affine coordinates of a plane point in the triangle (inverse of affine). */
export function coordinates(parent: Piece, [x, y]: Point): Point {
  const [s, c, e] = parent;
  const ux = s[0] - c[0], uy = s[1] - c[1], vx = e[0] - c[0], vy = e[1] - c[1];
  const det = ux * vy - uy * vx;
  const dx = x - c[0], dy = y - c[1];
  return [(dx * vy - dy * vx) / det, (ux * dy - uy * dx) / det];
}

/** The pieces of a rule placed in a triangle. */
export function applyRule(rule: Rule, parent: Piece): Piece[] {
  return rule.map((piece) => piece.map((p) => affine(parent, p)) as Piece);
}

/** Splits a piece in half along its curve (de Casteljau): the curve stays the same. */
export function splitPiece([s, c, e]: Piece): [Piece, Piece] {
  const mid = (p: Point, q: Point): Point => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const sc = mid(s, c), ce = mid(c, e), m = mid(sc, ce);
  return [[s, sc, m], [m, ce, e]];
}

/** The same piece run backwards: what grows on it comes out mirrored. */
export function reversePiece([s, c, e]: Piece): Piece {
  return [e, c, s];
}

export const snap = (v: number, step = SNAP): number => Math.round(v / step) * step;

/** Rounds away float noise: a value within a hair of the dots' grid lands on it. */
const tidy = (v: number): number => (Math.abs(v - snap(v)) < 1e-6 ? snap(v) + 0 : v);  // + 0: no -0

/**
 * The same piece made equilateral: start and end stay, the control point moves to the apex,
 * on the side where it was (on the side of the reference triangle's, if it lay on the chord).
 * The grid of dots is triangular, so a piece with its ends on the dots keeps its apex on them.
 */
export function equilateralPiece([s, c, e]: Piece): Piece {
  const [ps, pc, pe] = [s, c, e].map((p) => affine(REFERENCE, p));
  const dx = pe[0] - ps[0], dy = pe[1] - ps[1];
  const side = dx * (pc[1] - ps[1]) - dy * (pc[0] - ps[0]);
  const k = (Math.sqrt(3) / 2) * (side > 1e-12 ? 1 : -1);
  const apex: Point = [(ps[0] + pe[0]) / 2 - k * dy, (ps[1] + pe[1]) / 2 + k * dx];
  const [a, b] = coordinates(REFERENCE, apex);
  return [s, [tidy(a), tidy(b)], e];
}

/**
 * A new piece for a rule: an upright copy of the reference triangle a third of its size,
 * on the dots, as near the middle as it goes without a corner on a corner already there.
 */
export function newPiece(rule: Rule): Piece {
  const k = 1 / 3, n = 24;
  const taken = rule.flatMap((p) => p);
  const free = (q: Point) => !taken.some((t) => close(t, q));
  const [mx, my] = affine(REFERENCE, [1 / 3, 1 / 3]);
  let best: Piece | null = null, bestD = Infinity;
  for (let i = 8; i <= n; i++) {
    for (let j = 0; i + j <= n; j++) {
      const a = i / n, b = j / n;
      const piece: Piece = [[a, b], [a - k, b], [a - k, b + k]];
      if (!piece.every(free)) continue;
      const [cx, cy] = affine(REFERENCE, [a - 2 * k / 3, b + k / 3]);
      const d = Math.hypot(cx - mx, cy - my);
      if (d < bestD - 1e-9) { bestD = d; best = piece; }
    }
  }
  return best ?? [[1, 0], [1 - k, 0], [1 - k, k]];
}

const close = (p: Point, q: Point, eps = 1e-6) => Math.abs(p[0] - q[0]) < eps && Math.abs(p[1] - q[1]) < eps;

export type RuleKind = 'smooth' | 'chain' | 'loose';

/**
 * smooth — every piece is a stretch of the parent's own curve, run either way, and together
 *          they cover all of it: the limit is that Bézier curve, however many pieces there are;
 * chain  — the pieces join end to end from the parent's start to its end: one continuous curve;
 * loose  — neither: the drawing branches or falls apart into dust.
 */
export function ruleKind(rule: Rule): RuleKind {
  if (rule.length === 0) return 'loose';
  // On the parent's curve B(t), in affine coordinates: [(1 − t)², t²].
  const along = ([a, b]: Point): number | null => {
    if (b < -1e-9 || a < -1e-9) return null;
    const tt = Math.sqrt(Math.max(b, 0));
    return Math.abs(a - (1 - tt) ** 2) < 1e-6 ? tt : null;
  };
  const stretches: [number, number][] = [];
  for (const [s, c, e] of rule) {
    const t0 = along(s), t1 = along(e);
    // The control point of the stretch from t0 to t1 (the same either way).
    if (t0 === null || t1 === null || Math.abs(t1 - t0) < 1e-9 || !close(c, [(1 - t0) * (1 - t1), t0 * t1])) break;
    stretches.push([Math.min(t0, t1), Math.max(t0, t1)]);
  }
  if (stretches.length === rule.length) {
    stretches.sort((x, y) => x[0] - y[0]);
    let reach = 0;
    for (const [lo, hi] of stretches) {
      if (lo > reach + 1e-6) break;
      reach = Math.max(reach, hi);
    }
    if (reach > 1 - 1e-6) return 'smooth';
  }
  const chained = close(rule[0][0], [1, 0])
    && close(rule[rule.length - 1][2], [0, 1])
    && rule.every((p, i) => i === 0 || close(rule[i - 1][2], p[0]));
  return chained ? 'chain' : 'loose';
}

// ---- Expansion ----

export interface Expansion {
  /** Finished pieces, six numbers each: start, control, end. In the order of the curve. */
  pieces: Float64Array;
  count: number;
  /** The level reached: depth, or less when the budget stopped it. */
  level: number;
  /** The budget stopped it while some pieces were still larger than the detail. */
  truncated: boolean;
}

export interface ExpandOptions {
  /** A piece smaller than this fraction of the base is not split any further. */
  detail?: number;
  /** At most this many pieces: the level that would exceed it is not drawn. */
  budget?: number;
}

const flat = (pieces: Piece[]): Float64Array => Float64Array.from(pieces.flatMap((p) => p.flatMap((q) => q)));

function extentOf(pieces: Float64Array, count: number): number {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < count * 6; i += 2) {
    const x = pieces[i], y = pieces[i + 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return Math.max(x1 - x0, y1 - y0, 1e-9);
}

/**
 * Replaces every piece of the base by the rule, level after level. A piece below the detail
 * stays as it is (it would look the same split); the rest keeps going until depth, or until
 * the next level would exceed the budget. The order of the pieces is kept, so a chain
 * comes out as one continuous path.
 */
export function expand(rule: Rule, base: Piece[], depth: number, options: ExpandOptions = {}): Expansion {
  const { detail = 1 / 1500, budget = 100_000 } = options;
  const r = flat(rule);
  const n = rule.length;
  let cur = flat(base);
  let count = base.length;
  const eps = extentOf(cur, count) * detail;
  const small = (p: Float64Array, o: number) => {
    const x0 = Math.min(p[o], p[o + 2], p[o + 4]), x1 = Math.max(p[o], p[o + 2], p[o + 4]);
    const y0 = Math.min(p[o + 1], p[o + 3], p[o + 5]), y1 = Math.max(p[o + 1], p[o + 3], p[o + 5]);
    return Math.max(x1 - x0, y1 - y0) < eps;
  };

  let level = 0;
  let truncated = false;
  while (level < depth && n > 0) {
    let big = 0;
    for (let i = 0; i < count; i++) if (!small(cur, i * 6)) big++;
    if (big === 0) break;
    const nextCount = count - big + big * n;
    if (nextCount > budget) { truncated = true; break; }
    const next = new Float64Array(nextCount * 6);
    let o = 0;
    for (let i = 0; i < count; i++) {
      const p = i * 6;
      if (small(cur, p)) {
        next.set(cur.subarray(p, p + 6), o);
        o += 6;
        continue;
      }
      const sx = cur[p], sy = cur[p + 1], cx = cur[p + 2], cy = cur[p + 3], ex = cur[p + 4], ey = cur[p + 5];
      const ux = sx - cx, uy = sy - cy, vx = ex - cx, vy = ey - cy;
      for (let k = 0; k < n * 6; k += 2) {
        const a = r[k], b = r[k + 1];
        next[o++] = cx + a * ux + b * vx;
        next[o++] = cy + a * uy + b * vy;
      }
    }
    cur = next;
    count = nextCount;
    level++;
  }
  return { pieces: cur, count, level, truncated };
}

// ---- Drawing ----

export interface Drawing {
  svg: string;
  level: number;
  truncated: boolean;
  count: number;
}

export interface DrawOptions extends ExpandOptions {
  /** Side of the square viewBox. */
  size?: number;
  /** width and height attributes, e.g. '180mm'; none when omitted. */
  width?: string;
  /** Digits after the decimal point in the path. */
  precision?: number;
  /** Draw the control triangles when there are at most this many pieces. */
  constructionLimit?: number;
  /** A white square under the drawing (for a downloaded file). */
  background?: boolean;
  /** Line width in viewBox units, instead of the one the settings choose (small pictures). */
  stroke?: number;
}

/** Fits points into a square of the given side, centred, with a margin. */
function fitter(pieces: Float64Array, count: number, size: number, controls: boolean, margin = 0.04) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < count; i++) {
    for (const k of controls ? [0, 2, 4] : [0, 4]) {
      const x = pieces[i * 6 + k], y = pieces[i * 6 + k + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  const w = x1 - x0, h = y1 - y0;
  const scale = (size * (1 - 2 * margin)) / Math.max(w, h, 1e-9);
  const ox = size / 2 - ((x0 + x1) / 2) * scale, oy = size / 2 - ((y0 + y1) / 2) * scale;
  return (x: number, y: number): [number, number] => [ox + x * scale, oy + y * scale];
}

/** Chords of the pieces as path data; a chord starting where the last one ended continues the line. */
export function chordPath(pieces: Float64Array, count: number, map: (x: number, y: number) => [number, number], precision: number): string {
  const f = (v: number) => {
    const s = v.toFixed(precision);
    return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
  };
  const out: string[] = [];
  let last = '';
  for (let i = 0; i < count; i++) {
    const p = i * 6;
    const [ax, ay] = map(pieces[p], pieces[p + 1]);
    const [bx, by] = map(pieces[p + 4], pieces[p + 5]);
    const a = `${f(ax)} ${f(ay)}`, b = `${f(bx)} ${f(by)}`;
    if (a !== last) out.push(`M${a}`);
    if (b !== a) out.push(`L${b}`);
    last = b;
  }
  return out.join('');
}

/** Control triangles of the pieces (start, control, end) as path data. */
export function controlPath(pieces: Float64Array, count: number, map: (x: number, y: number) => [number, number], precision: number): string {
  const f = (v: number) => Number(v.toFixed(precision));
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const p = i * 6;
    const pts = [0, 2, 4].map((k) => map(pieces[p + k], pieces[p + k + 1]).map(f).join(' '));
    out.push(`M${pts[0]}L${pts[1]}L${pts[2]}`);
  }
  return out.join('');
}

/** The drawing as a square SVG, fitted to its own extent. */
export function renderDrawing(s: Settings, o: DrawOptions = {}): Drawing {
  const size = o.size ?? 1000;
  const precision = o.precision ?? 1;
  const ex = expand(s.rule, BASES[s.base], s.depth, o);
  const showControls = s.construction && ex.count <= (o.constructionLimit ?? 4000);
  const map = fitter(ex.pieces, ex.count, size, showControls);
  const width = o.stroke ?? LINES[s.line] * size / 1000;
  const ink = inkColors(s.ink ?? DEFAULTS.ink);
  const dims = o.width ? ` width="${o.width}" height="${o.width}"` : '';
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"${dims}>`,
    o.background ? `<rect width="${size}" height="${size}" fill="#ffffff"/>` : '',
    showControls
      ? `<path d="${controlPath(ex.pieces, ex.count, map, precision)}" fill="none" stroke="${ink.construction}" stroke-width="${(width * 0.6).toFixed(2)}" stroke-linejoin="round"/>`
      : '',
    `<path d="${chordPath(ex.pieces, ex.count, map, precision)}" fill="none" stroke="${ink.line}" stroke-width="${width.toFixed(2)}" stroke-linejoin="round" stroke-linecap="round"/>`,
    '</svg>',
  ];
  return { svg: parts.join(''), level: ex.level, truncated: ex.truncated, count: ex.count };
}

/**
 * The first levels side by side on one arch, with their control triangles: how a rule grows.
 * All panels share one scale, so each level can be compared with the one before.
 */
export function renderSteps(rule: Rule, levels = 4, o: { panel?: number; gap?: number } = {}): string {
  const panel = o.panel ?? 240, gap = o.gap ?? 24;
  const steps = Array.from({ length: levels }, (_, d) => expand(rule, BASES.arch, d, { detail: 0, budget: 20_000 }));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const ex of steps) {
    for (let i = 0; i < ex.count * 6; i += 2) {
      const x = ex.pieces[i], y = ex.pieces[i + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  const pad = 0.06 * Math.max(x1 - x0, y1 - y0);
  x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
  const scale = panel / (x1 - x0);
  const height = Math.round((y1 - y0) * scale);
  const label = 22;
  const width = levels * panel + (levels - 1) * gap;
  const body = steps.map((ex, d) => {
    const left = d * (panel + gap);
    const map = (x: number, y: number): [number, number] => [left + (x - x0) * scale, (y - y0) * scale];
    return [
      `<path d="${controlPath(ex.pieces, ex.count, map, 1)}" fill="none" stroke="${CONSTRUCTION_INK}" stroke-width="1" stroke-linejoin="round"/>`,
      `<path d="${chordPath(ex.pieces, ex.count, map, 1)}" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`,
      `<text x="${left + panel / 2}" y="${height + label - 4}" text-anchor="middle" font-size="14" fill="${INK}">${d}</text>`,
    ].join('');
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height + label}" font-family="Inter, system-ui, sans-serif">${body}</svg>`;
}

// ---- The link ----

const num = (v: number): string => {
  const s = String(Number(v.toFixed(4)));
  return s.replace(/^(-?)0\./, '$1.');
};

/** A rule as six numbers per piece, joined by "_" — characters a link keeps as they are. */
export function encodeRule(rule: Rule): string {
  return rule.flatMap((p) => p.flatMap((q) => q.map(num))).join('_');
}

export function decodeRule(text: string): Rule | null {
  const v = text.split('_').map(Number);
  if (v.length < 6 || v.length % 6 !== 0 || v.length > MAX_PIECES * 6) return null;
  if (v.some((x) => !Number.isFinite(x) || Math.abs(x) > 4)) return null;
  const rule: Rule = [];
  for (let i = 0; i < v.length; i += 6) rule.push([[v[i], v[i + 1]], [v[i + 2], v[i + 3]], [v[i + 4], v[i + 5]]]);
  return rule;
}

export function sameRule(a: Rule, b: Rule): boolean {
  return a.length === b.length && a.every((p, i) => p.every((q, j) => close(q, b[i][j], 1e-4)));
}

/** The preset whose rule this is, if any. */
export function presetOf(rule: Rule): Preset | undefined {
  return PRESETS.find((p) => sameRule(p.rule, rule));
}

/**
 * Settings from a link. rule=<numbers>, or shape=<preset> (links before 1.2); base, depth,
 * line, ink, steps=1. Anything missing or not understood takes the default. Names and
 * meanings of the parameters do not change; a new option gets a new parameter.
 */
export function parseSettings(q: URLSearchParams): Settings {
  const s: Settings = { ...DEFAULTS };
  const name = q.get('shape') ?? '';
  const preset = RETIRED_SHAPES.find((p) => p.id === name) ?? presetById(name);
  const rule = q.has('rule') ? decodeRule(q.get('rule') ?? '') : null;
  if (rule) s.rule = rule;
  else if (preset) s.rule = preset.rule;
  const base = q.get('base') as BaseId;
  if (BASE_IDS.includes(base)) s.base = base;
  const depth = Number(q.get('depth'));
  if (q.has('depth') && Number.isInteger(depth)) s.depth = Math.min(MAX_DEPTH, Math.max(0, depth));
  const line = q.get('line') as LineId;
  if (LINE_IDS.includes(line)) s.line = line;
  if (q.get('steps') === '1') s.construction = true;
  const ink = (q.get('ink') ?? '').toLowerCase();
  if (ink in INKS || /^[0-9a-f]{6}$/.test(ink)) s.ink = ink;
  return s;
}

export function settingsQuery(s: Settings): string {
  const q = new URLSearchParams();
  // Every rule by its numbers, the presets too: the link shows what is drawn.
  if (!sameRule(s.rule, DEFAULTS.rule)) q.set('rule', encodeRule(s.rule));
  if (s.base !== DEFAULTS.base) q.set('base', s.base);
  if (s.depth !== DEFAULTS.depth) q.set('depth', String(s.depth));
  if (s.line !== DEFAULTS.line) q.set('line', s.line);
  if (s.construction) q.set('steps', '1');
  if (s.ink !== DEFAULTS.ink) q.set('ink', s.ink);
  return q.toString();
}

/** A file name for the drawing: the preset's id, or "custom". */
export function fileName(s: Settings): string {
  return `fractal-bezier-${presetOf(s.rule)?.id ?? 'custom'}-${s.base}`;
}
