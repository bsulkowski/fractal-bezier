// Fractal Bézier: the rule, the expansion and the link.
//
// - The Bézier rule converges to the curve itself; splitting its pieces keeps it smooth.
// - The Koch rule on the loop makes the closed snowflake, piece by piece.
// - Detail and budget stop the expansion, also for a rule that never gets smaller.
// - Settings survive the trip through the link.
//
// Run: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASES, DEFAULTS, INKS, PRESETS, REFERENCE,
  affine, applyRule, coordinates, decodeRule, encodeRule, equilateralPiece, expand, inkColors, newPiece,
  parseSettings, presetById,
  presetOf, renderDrawing, renderSteps, reversePiece, ruleKind, sameRule, settingsQuery, splitPiece,
  type Piece, type Point, type Rule, type Settings,
} from '../src/fractal-bezier.ts';

const bezier = presetById('bezier')!.rule;
const koch = presetById('koch')!.rule;

// The quadratic Bézier curve of a triangle.
const curve = ([s, c, e]: Piece, t: number): Point => [0, 1].map(
  (k) => (1 - t) ** 2 * s[k] + 2 * t * (1 - t) * c[k] + t * t * e[k],
) as Point;

test('affine coordinates: [1, 0] is the start, [0, 0] the control point, [0, 1] the end', () => {
  const [s, c, e] = REFERENCE;
  assert.deepEqual(affine(REFERENCE, [1, 0]), s);
  assert.deepEqual(affine(REFERENCE, [0, 0]), c);
  assert.deepEqual(affine(REFERENCE, [0, 1]), e);
  for (const p of [[0.25, 0.5], [-0.25, 1.1], [1 / 3, 2 / 3]] as Point[]) {
    const back = coordinates(REFERENCE, affine(REFERENCE, p));
    assert.ok(Math.abs(back[0] - p[0]) < 1e-12 && Math.abs(back[1] - p[1]) < 1e-12);
  }
});

test('the Bézier rule converges to the curve of the base', () => {
  const ex = expand(bezier, BASES.arch, 10, { detail: 0 });
  assert.equal(ex.count, 1024);
  assert.equal(ex.level, 10);
  for (let i = 0; i < ex.count; i++) {
    // Piece i starts where the curve is at t = i / 1024.
    const p = curve(REFERENCE, i / ex.count);
    assert.ok(Math.abs(ex.pieces[i * 6] - p[0]) < 1e-9 && Math.abs(ex.pieces[i * 6 + 1] - p[1]) < 1e-9);
  }
});

test('kinds of rules: smooth, chain, loose', () => {
  const kinds = Object.fromEntries(PRESETS.map((p) => [p.id, ruleKind(p.rule)]));
  assert.equal(kinds.bezier, 'smooth');
  for (const id of ['koch', 'cathedral', 'sierpinski', 'star', 'lace', 'tree', 'heart', 'fly', 'wheel']) assert.equal(kinds[id], 'chain', id);
  for (const id of ['vine']) assert.equal(kinds[id], 'loose', id);
  // Splitting a piece along the curve keeps the rule smooth, at any place.
  const more: Rule = [...splitPiece(bezier[0]), ...splitPiece(bezier[1])];
  assert.equal(ruleKind(more), 'smooth');
  assert.equal(ruleKind([...splitPiece(more[0]), ...more.slice(1)]), 'smooth');
  // A stretch of the curve run backwards is still the curve; a gap is not.
  assert.equal(ruleKind([reversePiece(bezier[0]), bezier[1]]), 'smooth');
  assert.equal(ruleKind([bezier[0], splitPiece(bezier[1])[1]]), 'loose');
  // Running a piece of a chain backwards breaks the chain.
  assert.equal(ruleKind([reversePiece(koch[0]), ...koch.slice(1)]), 'loose');
  // Moving the control point keeps the chain but leaves the curve.
  assert.equal(ruleKind([[[1, 0], [0.5, 0.1], [0.25, 0.25]], bezier[1]]), 'chain');
});

test('the Koch rule on the loop is the closed snowflake', () => {
  for (let d = 0; d <= 4; d++) {
    const ex = expand(koch, BASES.loop, d, { detail: 0 });
    assert.equal(ex.count, 3 * 4 ** d);
    // Every piece starts where the one before ended, and the last ends at the first start.
    for (let i = 0; i < ex.count; i++) {
      const prev = ((i + ex.count - 1) % ex.count) * 6;
      assert.ok(Math.abs(ex.pieces[i * 6] - ex.pieces[prev + 4]) < 1e-9);
      assert.ok(Math.abs(ex.pieces[i * 6 + 1] - ex.pieces[prev + 5]) < 1e-9);
    }
  }
});

test('applyRule places the pieces in the parent', () => {
  const pieces = applyRule(bezier, REFERENCE);
  assert.equal(pieces.length, 2);
  assert.deepEqual(pieces[0][0], REFERENCE[0]);
  assert.deepEqual(pieces[1][2], REFERENCE[2]);
  const mid = curve(REFERENCE, 0.5);
  assert.ok(Math.abs(pieces[0][2][0] - mid[0]) < 1e-12 && Math.abs(pieces[0][2][1] - mid[1]) < 1e-12);
});

test('detail and budget stop the expansion', () => {
  // Pieces below the detail are not split: fewer than the full 4^10.
  const fine = expand(koch, BASES.arch, 10, { detail: 1 / 300 });
  assert.ok(fine.count < 4 ** 10 && fine.count >= 4 ** 4);
  // The level that would exceed the budget is not drawn.
  const star = presetById('star')!.rule;
  const capped = expand(star, BASES.arch, 10, { detail: 0, budget: 10_000 });
  assert.equal(capped.count, 7 ** 4);
  assert.equal(capped.level, 4);
  assert.ok(capped.truncated);
  // A piece as big as its parent never gets smaller: the budget stops it.
  const same: Rule = [[[1, 0], [0, 0], [0, 1]], [[1, 0], [0, 0], [0, 1]]];
  const stuck = expand(same, BASES.arch, 12, { budget: 1000 });
  assert.equal(stuck.count, 512);
  assert.ok(stuck.truncated);
  // Depth 0 is the base itself.
  assert.equal(expand(koch, BASES.loop, 0).count, 3);
});

test('every preset draws, within the budget, without stray numbers', () => {
  for (const p of PRESETS) {
    const d = renderDrawing({ ...DEFAULTS, rule: p.rule, base: p.base }, { budget: 50_000 });
    assert.ok(d.count > 0 && d.count <= 50_000, p.id);
    assert.ok(!/NaN|Infinity/.test(d.svg), p.id);
    assert.match(d.svg, /^<svg[^>]*viewBox="0 0 1000 1000"/);
  }
  assert.ok(!/NaN/.test(renderSteps(koch)));
});

test('preset ids are unique and their rules distinct', () => {
  assert.equal(new Set(PRESETS.map((p) => p.id)).size, PRESETS.length);
  for (const p of PRESETS) assert.equal(presetOf(p.rule)?.id, p.id);
});

test('settings survive the link', () => {
  assert.equal(settingsQuery(DEFAULTS), '');
  const cases: Partial<Settings>[] = [
    { rule: presetById('tree')!.rule, base: 'pair', ink: 'green' },
    { rule: bezier, depth: 3, construction: true },
    { rule: [[[1, 0], [0.5, 0.125], [0.25, 0.25]], [[0.25, 0.25], [-0.25, 0.5], [0, 1]]], line: 'thick' },
  ];
  for (const c of cases) {
    const s: Settings = { ...DEFAULTS, ...c };
    const back = parseSettings(new URLSearchParams(settingsQuery(s)));
    assert.ok(sameRule(back.rule, s.rule));
    assert.deepEqual({ ...back, rule: null }, { ...s, rule: null });
  }
  // Every rule goes by its numbers, a preset too; a link with its name still opens it.
  assert.equal(settingsQuery({ ...DEFAULTS, rule: bezier }), 'rule=1_0_.5_0_.25_.25_.25_.25_0_.5_0_1');
  assert.ok(sameRule(parseSettings(new URLSearchParams('shape=bezier')).rule, bezier));
  // The colour: a preset by name, one's own by six hex digits.
  assert.equal(settingsQuery({ ...DEFAULTS, ink: 'sepia' }), 'ink=sepia');
  assert.equal(parseSettings(new URLSearchParams('ink=1A2B3C')).ink, '1a2b3c');
  assert.equal(parseSettings(new URLSearchParams('ink=red')).ink, DEFAULTS.ink);
  assert.match(settingsQuery({ ...DEFAULTS, rule: cases[2].rule! }), /^rule=1_0_\.5_\.125_/);
  // The numbers need no escaping in a link.
  const enc = encodeRule(presetById('dragon')!.rule);
  assert.equal(new URLSearchParams({ rule: enc }).toString(), `rule=${enc}`);
});

test('a link that does not make sense falls back to the defaults', () => {
  const s = parseSettings(new URLSearchParams('rule=1_2_3&base=moon&depth=99&line=bold&shape=nothing'));
  assert.ok(sameRule(s.rule, DEFAULTS.rule));
  assert.equal(s.base, DEFAULTS.base);
  assert.equal(s.depth, 12);
  assert.equal(s.line, DEFAULTS.line);
  assert.equal(decodeRule('1_0_0_0_0_NaN'), null);
  assert.equal(decodeRule(Array(13 * 6).fill('0').join('_')), null);
});

test('the Koch snowflake is the first shape and the default', () => {
  assert.equal(PRESETS[0].id, 'koch');
  assert.ok(sameRule(DEFAULTS.rule, PRESETS[0].rule));
  assert.equal(DEFAULTS.base, PRESETS[0].base);
});

test('line colours: presets and one\'s own, with a paler construction colour', () => {
  assert.equal(inkColors('blue').line, INKS.blue);
  assert.deepEqual(inkColors('ffffff'), { line: '#ffffff', construction: '#ffffff' });
  assert.equal(inkColors('000000').construction, '#aaaaaa');
  assert.match(renderDrawing({ ...DEFAULTS, ink: 'sepia' }).svg, /stroke="#8b5e3c"/);
});

test('an equilateral piece keeps its ends, its side and the dots', () => {
  const plane = (p: Piece) => p.map((q) => affine(REFERENCE, q));
  const side = (p: Piece) => { const [s, c, e] = plane(p); const v = (e[0] - s[0]) * (c[1] - s[1]) - (e[1] - s[1]) * (c[0] - s[0]); return Math.abs(v) < 1e-9 ? 0 : Math.sign(v); };
  const cases: Piece[] = [bezier[0], bezier[1], [[1, 0], [0.5, 0.2], [0.5, 0]], reversePiece(bezier[0]), [[0, 0.5], [0.25, 0.25], [0.5, 0]]];
  for (const piece of cases) {
    const eq = equilateralPiece(piece);
    assert.deepEqual([eq[0], eq[2]], [piece[0], piece[2]]);
    const [s, c, e] = plane(eq);
    const d = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    assert.ok(Math.abs(d(s, c) - d(s, e)) < 1e-9 && Math.abs(d(e, c) - d(s, e)) < 1e-9);
    if (side(piece) !== 0) assert.equal(side(eq), side(piece));
    // Ends on the dots, apex on the dots.
    for (const v of eq[1]) assert.ok(Math.abs(v * 24 - Math.round(v * 24)) < 1e-9, String(eq[1]));
  }
  // The reference triangle is already equilateral.
  const ref: Piece = [[1, 0], [0, 0], [0, 1]];
  assert.deepEqual(equilateralPiece(ref), ref);
  // A control point on the chord goes to the reference triangle's side.
  assert.deepEqual(equilateralPiece([[1, 0], [0.5, 0.5], [0, 1]]), ref);
});

test('a new piece lands on free dots', () => {
  let rule: Rule = [...bezier];
  for (let i = 0; i < 8; i++) {
    const p = newPiece(rule);
    const corners = rule.flatMap((q) => q);
    for (const c of p) assert.ok(!corners.some((t) => Math.abs(t[0] - c[0]) < 1e-9 && Math.abs(t[1] - c[1]) < 1e-9));
    assert.deepEqual(equilateralPiece(p).map((q) => q.map((v) => Math.round(v * 24))), p.map((q) => q.map((v) => Math.round(v * 24))));
    rule = [...rule, p];
  }
});

test('links to shapes no longer in the gallery still open them', () => {
  // As drawn by 1.1: Frost had a corner outside the triangle, the Vine branched from the middle.
  const frost = parseSettings(new URLSearchParams('shape=frost&base=arch'));
  assert.equal(frost.rule.length, 7);
  assert.deepEqual(frost.rule[2][1].map((v) => Number(v.toFixed(4))), [0.6667, -0.3333]);
  const vine = parseSettings(new URLSearchParams('shape=vine&base=arch'));
  assert.ok(!sameRule(vine.rule, presetById('vine')!.rule));
  assert.deepEqual(vine.rule[2], [[0.25, 0.25], [0.25, 0.5], [0.5, 0.5]]);
  for (const id of ['ladder', 'tower', 'babia-gora', 'hut', 'windmill']) {
    assert.equal(presetById(id), undefined, id);
    assert.ok(!sameRule(parseSettings(new URLSearchParams(`shape=${id}`)).rule, DEFAULTS.rule), id);
  }
});
