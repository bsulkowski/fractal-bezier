# Fractal Bézier

*Also available in Polish: [README](README_PL.md)*

Curves drawn by replacing a triangle with smaller triangles, again and again. One rule gives
a perfectly smooth Bézier curve, another the Koch snowflake. Play with the rules in the browser
at **[bsulkowski.pl/fractal-bezier](https://bsulkowski.pl/fractal-bezier)**; this repository
holds the code that draws them.

![Twenty-two shapes drawn with different rules](examples/gallery.svg)

## The idea

Three points — a start, a control point and an end — define a quadratic Bézier curve: it leaves
the start towards the control point and arrives at the end from its direction. Cut the curve
in half and each half is again such a curve, with a triangle of its own, smaller than the
first (de Casteljau's construction). Replace each of the two triangles by its own two halves,
and again, and the chords of the triangles close in on the curve.

Nothing forces the replacement to be the halves. A **rule** is any list of smaller triangles
placed in the big one; applied over and over, it draws whatever the list makes of itself.
Halves of the curve draw the curve, four triangles that bend the line up in the middle third
draw the Koch curve, a triangle run backwards mirrors everything that grows on it. Each
finished triangle is drawn as its chord, from its start to its end.

![The first levels of the Koch rule](examples/steps-koch.svg)

The rule is written in the coordinates of the big triangle, so it works the same in a triangle
of any shape: `[1, 0]` is its start, `[0, 0]` its control point, `[0, 1]` its end, and the point
`[a, b]` is *control* + *a* · (*start* − *control*) + *b* · (*end* − *control*). The halves of
the curve are

```
[1, 0]     [0.5, 0]   [0.25, 0.25]
[0.25, 0.25] [0, 0.5] [0, 1]
```

with `[0.25, 0.25]` the middle of the curve and `[0.5, 0]`, `[0, 0.5]` the middles of the
two arms.

### Kinds of rules

- **Smooth** — the triangles are stretches of the big triangle's own curve, run either way, and
  together cover all of it, in two pieces or in more: the drawing converges to that Bézier curve.
- **Chain** — they join end to end from the start to the end: one continuous line, however
  jagged (Koch, Sierpiński, the Cathedral).
- **Loose** — they do not: the drawing branches or falls apart into dust (the Vine, the Windmill).

A triangle not much smaller than the one it replaces would take a very long time to settle,
so the drawing stops before a level that would exceed a budget of pieces, and pieces smaller
than the detail of the picture are not split any further.

### No circle

A parabola comes out exactly, a circle never does. Every step is an affine map, which turns a
circle into an ellipse; for a smaller arc of the circle to be an image of the whole one, the map
would have to take the circle onto itself, and such a map does not shrink anything. The circle's
own halves change from level to level: in the equilateral triangle of a 120° arc its middle is at
`[⅓, ⅓]`, in the triangles of the 60° arcs at 0.268, then 0.254, 0.251 … closing in on the ¼ of
the parabola. The Wheel, found by hand, keeps within 1.4% of a circle on the loop base and is a
fractal up close.

### Bases

The rule starts from a **base**: one arch (the reference triangle of the editor, equilateral);
three arches around a triangle bulging outwards (the Koch rule makes the snowflake on it);
or two arches from the bottom corners to a common top, mirror images of each other (the
Christmas tree).

## Origin

A Groovy script from 2011 that wrote the drawing to an SVG file, with the shapes kept in its
source as lists of triangles; most of them were added in 2014. The shapes are the same here, with ⅓ and ⅔ written exactly
instead of 0.33 and 0.67; the names are translated from the Polish ones.

## Using the code

One TypeScript module, [`src/fractal-bezier.ts`](src/fractal-bezier.ts), with no dependencies
and no DOM access. It runs in the browser and in Node ≥ 22.12 (with `--experimental-strip-types`).

```ts
import { BASES, DEFAULTS, expand, presetById, renderDrawing, renderSteps, ruleKind,
  parseSettings, settingsQuery } from 'fractal-bezier';

const rule = presetById('cathedral')!.rule;
ruleKind(rule);                                   // 'chain'
const settings = { ...DEFAULTS, rule, base: 'arch' as const };
const { svg, level, truncated } = renderDrawing(settings, { budget: 50_000 });  // square <svg>, fitted
renderSteps(rule);                                // levels 0–3 side by side, with their triangles

expand(rule, BASES.arch, 6).pieces;               // Float64Array, six numbers per triangle
settingsQuery(settings);                          // 'shape=cathedral&base=arch' — defaults are left out
parseSettings(new URLSearchParams('shape=cathedral&base=arch'));  // the same settings back
```

Install from GitHub: `npm install github:bsulkowski/fractal-bezier`, or with `#<commit>` at the end
to pin a version. The package ships the TypeScript source, so a bundler has to compile it (Vite
does; in an Astro or Vite SSR build, add `fractal-bezier` to `ssr.noExternal`).

### Link parameters

| Parameter | Meaning | Default |
|---|---|---|
| `shape` | a preset by name, e.g. `koch`, `tree` | `koch` |
| `rule` | a rule of one's own: six numbers per triangle joined by `_`, e.g. `1_0_.5_0_.25_.25_.25_.25_0_.5_0_1` | — |
| `base` | `arch`, `loop` or `pair` | `loop` |
| `depth` | levels of replacement, 0–12 | `10` |
| `line` | `thin`, `medium` or `thick` | `medium` |
| `steps` | `1` draws the triangles of the finished pieces too | — |

### Compatibility

The link parameters are a promise: their names and meaning do not change, so a link saved
today opens the same rule later. A new option comes as a new parameter whose default draws
what was drawn before. The level of detail and the budget may still change.

`TOOL_VERSION` follows that: a new option → 1.1, a fix in the drawing → 1.0.1.

- **1.1** — the Wheel (`shape=wheel`).
- **1.0** — the first version.

## Tests

```sh
npm test            # the Bézier limit, the snowflake, detail and budget, link parameters
npm run examples    # redraw examples/
```

## Licence

[MIT](LICENSE) — Bartosz Sułkowski.
