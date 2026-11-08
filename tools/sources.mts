// Beyond trees: on a digraph, let r be a vertex nobody looks at (in-degree 0) that
// is uncoloured and looks only at uncoloured vertices. Is G = * + G(board − r)?
// Every digraph on ≤ N labelled vertices (each pair: none, →, ←, both), every
// colouring, every such r. Also the same test for an r somebody does look at, to
// see that the in-degree condition matters.
// Usage: node tools/sources.mts N           → runs/sources-N.json (exhaustive)
//        node tools/sources.mts N S seed   → runs/sources-N-sample.json: S random
//        boards on exactly N vertices (each pair none/→/←/both with prob. .55/.2/.2/.05, each
//        vertex uncoloured/blue/red with prob. 1/2, 1/4, 1/4)
import { writeFileSync, mkdirSync } from 'node:fs';
import { name, add, STAR } from '../src/cgt.ts';
import { Valuer, fromColouring, type Board, type Colour } from '../src/col.ts';

const N = Number(process.argv[2] ?? 4);
const S = Number(process.argv[3] ?? 0);
let seed = Number(process.argv[4] ?? 1) >>> 0;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
// sparse enough that sources are common: none .55, → .2, ← .2, both .05
const pick = () => { const z = rnd(); return z < 0.55 ? 0 : z < 0.75 ? 1 : z < 0.95 ? 2 : 3; };
const V = new Valuer();
const t0 = Date.now();
const res = { source: { cases: 0, fails: 0, ex: [] as unknown[] }, watched: { cases: 0, fails: 0, ex: [] as unknown[] } };
const rows: unknown[] = [];
for (let n = S ? N : 2; n <= N; n++) {
  const pairs: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([i, j]);
  const total = S || 4 ** pairs.length;
  for (let code = 0; code < total; code++) {
    const look: Board = Array.from({ length: n }, () => []);
    let x = code;
    for (const [i, j] of pairs) {
      const k = S ? pick() : x & 3; x >>= 2;
      if (k & 1) look[i].push(j);
      if (k & 2) look[j].push(i);
    }
    const watched = look.map(() => false);
    look.forEach((ws) => ws.forEach((w) => { watched[w] = true; }));
    for (let cc = 0; cc < (S ? 1 : 3 ** n); cc++) {
      const c: Colour[] = [];
      let y = cc;
      for (let v = 0; v < n; v++) {
        if (S) { const z = rnd(); c.push(z < 0.5 ? 0 : z < 0.75 ? 1 : 2); continue; }
        c.push((y % 3) as Colour); y = Math.floor(y / 3);
      }
      let g: number | null = null;
      for (let r = 0; r < n; r++) {
        if (c[r] || look[r].length === 0 || look[r].some((w) => c[w])) continue;
        // only watchers that are still in play count
        const live = look.some((ws, u) => u !== r && !c[u] && ws.includes(r));
        const t = live ? res.watched : res.source;
        g ??= V.value(fromColouring(look, c));
        const rest = look.map((ws, u) => (u === r ? [] : ws.filter((w) => w !== r)));
        const cr = c.slice(); cr[r] = 0;
        // board − r: drop r's arcs and r itself (an isolated uncoloured vertex is *, so subtract it)
        const restVal = V.value(fromColouring(rest.filter((_, u) => u !== r).map((ws) => ws.map((w) => (w > r ? w - 1 : w))), c.filter((_, u) => u !== r)));
        t.cases++;
        if (add(STAR, restVal) !== g) { t.fails++; if (t.ex.length < 6) t.ex.push({ n, look, c: c.join(''), r, G: name(g), formula: name(add(STAR, restVal)) }); }
      }
    }
  }
  const row = { n, source: `${res.source.fails}/${res.source.cases}`, watched: `${res.watched.fails}/${res.watched.cases}`, sec: (Date.now() - t0) / 1000 };
  rows.push(row);
  console.log(JSON.stringify(row));
}
mkdirSync('runs', { recursive: true });
writeFileSync(`runs/sources-${N}${S ? '-sample' : ''}.json`, JSON.stringify({ N, rows, res, sec: (Date.now() - t0) / 1000 }, null, 1));
console.log(JSON.stringify(res.source.ex.slice(0, 3)), JSON.stringify(res.watched.ex.slice(0, 3)));
