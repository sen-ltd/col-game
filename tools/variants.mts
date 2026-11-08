// How far does the Bovee–Burke–Tennenhouse conjecture reach? Every rooted tree (any arity) on
// ≤ N vertices, every colouring with an uncoloured root, arcs parent → child. With
// k = the root's children, Gi = the value of the i-th child's subtree, test
// G(T0) = * + ΣGi in four cases:
//   two      k = 2, both children uncoloured        (the conjecture)
//   one      k = 1, child uncoloured                (true on paths, the paper's lemma)
//   many     k ≥ 3, all children uncoloured
// Also counts positions whose value is not x or x + *.
// Usage: node tools/variants.mts N → runs/variants-N.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { name, add, STAR } from '../src/cgt.ts';
import { Valuer, fromColouring, binaryTree, isCold, type Colour, type Board } from '../src/col.ts';
import { rootedTrees, parse } from './trees.mts';

const N = Number(process.argv[2] ?? 8);
const V = new Valuer();
const t0 = Date.now();
type Case = 'two' | 'one' | 'many';
const tally: Record<Case, { cases: number; fails: number; smallest: unknown[] }> = {
  two: { cases: 0, fails: 0, smallest: [] }, one: { cases: 0, fails: 0, smallest: [] },
  many: { cases: 0, fails: 0, smallest: [] },
};
const rows: unknown[] = [];
let notCold = 0, positions = 0;
for (let n = 1; n <= N; n++) {
  const shapes = rootedTrees(n);
  for (const s of shapes) {
    const kids = parse(s);
    const b: Board = binaryTree(kids); // any arity: parent looks at each child
    const subs = kids[0].map((root) => {
      const vs: number[] = [];
      const st = [root];
      while (st.length) { const v = st.pop()!; vs.push(v); st.push(...kids[v]); }
      vs.sort((p, q) => p - q);
      const idx = new Map(vs.map((v, i) => [v, i]));
      return { vs, b: binaryTree(vs.map((v) => kids[v].map((w) => idx.get(w)!))) };
    });
    const total = 3 ** (n - 1);
    for (let code = 0; code < total; code++) {
      const colour: Colour[] = [0];
      let x = code;
      for (let v = 1; v < n; v++) { colour.push((x % 3) as Colour); x = Math.floor(x / 3); }
      positions++;
      const g = V.value(fromColouring(b, colour));
      if (!isCold(g)) notCold++;
      const k = kids[0].length;
      if (k === 0) continue;
      // a coloured child already forbids its colour on r, so r is no longer a free *
      if (kids[0].some((c) => colour[c] !== 0)) continue;
      const kind: Case = k === 1 ? 'one' : k === 2 ? 'two' : 'many';
      const rhs = subs.reduce((acc, sb) => add(acc, V.value(fromColouring(sb.b, sb.vs.map((v) => colour[v])))), STAR);
      const t = tally[kind];
      t.cases++;
      if (rhs !== g) {
        t.fails++;
        if (t.smallest.length < 6) t.smallest.push({ n, tree: s, colour: colour.join(''), G: name(g), formula: name(rhs) });
      }
    }
  }
  const row = { n, trees: shapes.length, positions, notCold, ...Object.fromEntries(Object.entries(tally).map(([k, v]) => [k, `${v.fails}/${v.cases}`])), sec: (Date.now() - t0) / 1000 };
  rows.push(row);
  console.log(JSON.stringify(row));
}
mkdirSync('runs', { recursive: true });
writeFileSync(`runs/variants-${N}.json`, JSON.stringify({ N, rows, tally, positions, notCold, components: V.size, sec: (Date.now() - t0) / 1000 }, null, 1));
for (const [k, v] of Object.entries(tally)) console.log(k, v.fails, '/', v.cases, JSON.stringify(v.smallest.slice(0, 3)));
