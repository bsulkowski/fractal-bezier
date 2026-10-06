// Writes the pictures of the README to examples/: every preset in one gallery, and the first
// levels of two rules side by side.
// Run: npm run examples

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { DEFAULTS, PRESETS, presetById, renderDrawing, renderSteps } from '../src/fractal-bezier.ts';

const dir = new URL('../examples/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const f of readdirSync(dir)) if (f.endsWith('.svg')) rmSync(new URL(f, dir));
const write = (name: string, svg: string) => {
  writeFileSync(new URL(name, dir), `<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`);
  console.log(name);
};

// The gallery: five in a row, the name under each.
const cell = 200, label = 28, cols = 5;
const rows = Math.ceil(PRESETS.length / cols);
const cells = PRESETS.map((p, i) => {
  const x = (i % cols) * cell, y = Math.floor(i / cols) * (cell + label);
  const d = renderDrawing({ ...DEFAULTS, rule: p.rule, base: p.base }, { size: cell, detail: 1 / 250, budget: 8000, precision: 1 });
  const inner = d.svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  return `<g transform="translate(${x} ${y})">${inner}<text x="${cell / 2}" y="${cell + 18}" text-anchor="middle">${p.name.en}</text></g>`;
}).join('');
write('gallery.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cols * cell} ${rows * (cell + label)}" font-family="Inter, system-ui, sans-serif" font-size="14" fill="#1f3a7a"><rect width="100%" height="100%" fill="#ffffff"/>${cells}</svg>`);

for (const id of ['bezier', 'koch', 'cathedral']) write(`steps-${id}.svg`, renderSteps(presetById(id)!.rule));
