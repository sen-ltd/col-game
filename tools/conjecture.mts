// The Myopic Col conjecture of Bovee–Burke–Tennenhouse (2016): if the root r of a binary tree
// T0 is uncoloured and has two children whose subtrees T1, T2 have uncoloured
// roots, then G(T0) = * + G(T1) + G(T2). Every tree up to N vertices, every
// colouring of the other vertices. Also: is every value x or x + * (cold)?
// Usage: node tools/conjecture.mts N  → runs/conjecture-N.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { name, add, STAR, isNumber, numberValue } from '../src/cgt.ts';
import { Valuer, fromColouring, binaryTree, isCold, type Colour } from '../src/col.ts';
import { binaryTrees, parse } from './trees.mts';

const N = Number(process.argv[2] ?? 9);
const V = new Valuer();
const t0 = Date.now();
const rows: unknown[] = [];
const allValues = new Map<string, { n: number; tree: string; colour: string }>();
for (let n = 1; n <= N; n++) {
  const shapes = binaryTrees(n);
  let cases = 0, fails = 0, notCold = 0, positions = 0;
  const firstFails: unknown[] = [];
  for (const s of shapes) {
    const kids = parse(s);
    const b = binaryTree(kids);
    const both = kids[0].length === 2;
    const free = kids.length; // colour every vertex 0..n-1, constrained below
    const total = 3 ** free;
    for (let code = 0; code < total; code++) {
      const colour: Colour[] = [];
      let x = code;
      for (let v = 0; v < free; v++) { colour.push((x % 3) as Colour); x = Math.floor(x / 3); }
      if (colour[0] !== 0) continue; // positions with an uncoloured root
      positions++;
      const g = V.value(fromColouring(b, colour));
      if (!isCold(g)) notCold++;
      const nm = name(g);
      if (!allValues.has(nm)) allValues.set(nm, { n, tree: s, colour: colour.join('') });
      if (!both) continue;
      const [a, c] = kids[0];
      if (colour[a] || colour[c]) continue;
      cases++;
      // subtrees: vertices reachable from a / from c
      const sub = (root: number) => {
        const vs: number[] = [];
        const st = [root];
        while (st.length) { const v = st.pop()!; vs.push(v); st.push(...kids[v]); }
        vs.sort((p, q) => p - q);
        const idx = new Map(vs.map((v, i) => [v, i]));
        return { b: binaryTree(vs.map((v) => kids[v].map((w) => idx.get(w)!))), colour: vs.map((v) => colour[v]) };
      };
      const A = sub(a), C = sub(c);
      const rhs = add(STAR, add(V.value(fromColouring(A.b, A.colour)), V.value(fromColouring(C.b, C.colour))));
      if (rhs !== g) {
        fails++;
        if (firstFails.length < 12) firstFails.push({ tree: s, colour: colour.join(''), G: nm, conjectured: name(rhs) });
      }
    }
  }
  const row = { n, trees: shapes.length, positions, cases, fails, notCold, firstFails, sec: (Date.now() - t0) / 1000 };
  rows.push(row);
  console.log(JSON.stringify({ ...row, firstFails: firstFails.slice(0, 2) }));
}
const numbers = [...allValues.entries()].filter(([k]) => !k.includes('*') && !k.includes('↑') && !k.includes('{'));
mkdirSync('runs', { recursive: true });
writeFileSync(`runs/conjecture-${N}.json`, JSON.stringify({ N, rows, values: [...allValues.entries()].map(([v, w]) => ({ v, ...w })), components: V.size, sec: (Date.now() - t0) / 1000 }, null, 1));
console.log('distinct values', allValues.size, 'numbers', numbers.length, 'components', V.size);
void isNumber; void numberValue;
