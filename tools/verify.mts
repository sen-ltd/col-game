// Checks of the engine and of the paper's path results.
//  1. engine vs plain search (no values, no splitting, no arc dropping): every
//     connected graph on ≤ 6 vertices (Col) and every digraph on ≤ 4 labelled
//     vertices (Myopic Col), every colouring that can arise
//  2. Bovee–Burke–Tennenhouse Lemma (Myopic Col on a path of n uncoloured vertices, maybe
//     followed by a coloured one): n·*, (n−1)·* − 1, (n−1)·* + 1, for n ≤ 400
//  3. Their Corollary a·* + b − c on every colouring of directed paths ≤ 13 vertices
//     and of every forest of directed paths on ≤ 9 vertices (two to four paths)
// → runs/verify.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { name, add, outcome, nimber, numberGame, ZERO, STAR, type GameId } from '../src/cgt.ts';
import { Valuer, fromColouring, plainOutcome, dipath, directed, pathFormula, type Board, type Colour } from '../src/col.ts';
import { connectedGraphs } from './graphs.mts';

const V = new Valuer();
const t0 = Date.now();
const out: Record<string, unknown> = {};
const fromMask = (g: number[]): Board => g.map((m) => { const ws: number[] = []; for (let u = 0; u < g.length; u++) if (m & (1 << u)) ws.push(u); return ws; });
function each(n: number, f: (c: Colour[]) => void) {
  for (let code = 0; code < 3 ** n; code++) {
    const c: Colour[] = [];
    let x = code;
    for (let v = 0; v < n; v++) { c.push((x % 3) as Colour); x = Math.floor(x / 3); }
    f(c);
  }
}
const agrees = (g: GameId, [l, r]: [boolean, boolean]) => {
  const o = outcome(g);
  return l === (o === 'L' || o === 'N') && r === (o === 'R' || o === 'N');
};

// 1a. Col
{
  let checked = 0, bad = 0;
  const all = connectedGraphs(6);
  for (let n = 1; n <= 6; n++) for (const g of all[n]) {
    const b = fromMask(g);
    each(n, (c) => {
      if (!b.every((ws, u) => !c[u] || ws.every((w) => c[w] !== c[u]))) return;
      checked++;
      if (!agrees(V.value(fromColouring(b, c)), plainOutcome(b, c))) bad++;
    });
  }
  out.colPlain = { checked, bad };
  console.log('Col vs plain search', checked, 'bad', bad);
}
// 1b. Myopic Col
{
  let checked = 0, bad = 0;
  for (let n = 2; n <= 4; n++) {
    const pairs: [number, number][] = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([i, j]);
    for (let code = 0; code < 4 ** pairs.length; code++) {
      const arcs: [number, number][] = [];
      let x = code;
      for (const [i, j] of pairs) { const k = x & 3; x >>= 2; if (k & 1) arcs.push([i, j]); if (k & 2) arcs.push([j, i]); }
      const b = directed(n, arcs);
      each(n, (c) => { checked++; if (!agrees(V.value(fromColouring(b, c)), plainOutcome(b, c))) bad++; });
    }
  }
  out.myopicPlain = { checked, bad };
  console.log('Myopic Col vs plain search', checked, 'bad', bad);
}
// 2. Lemma
{
  const times = (n: number) => nimber(n % 2);
  let bad = 0;
  for (let n = 1; n <= 400; n++) {
    const b = dipath(n + 1);
    const c: Colour[] = new Array(n + 1).fill(0);
    const free = V.value(fromColouring(dipath(n), new Array(n).fill(0)));
    c[n] = 1;
    const blue = V.value(fromColouring(b, c));
    c[n] = 2;
    const red = V.value(fromColouring(b, c));
    if (free !== times(n) || blue !== add(times(n - 1), numberGame(-1)) || red !== add(times(n - 1), numberGame(1))) bad++;
  }
  out.lemma = { n: 400, bad };
  console.log('Lemma n ≤ 400 bad', bad);
}
// 3. Corollary
{
  const formula = (b: Board, c: Colour[]) => { const [a, bb, cc] = pathFormula(b, c); return add(nimber(a % 2), numberGame(bb - cc)); };
  let checked = 0, bad = 0;
  for (let n = 1; n <= 13; n++) {
    const b = dipath(n);
    each(n, (c) => { checked++; if (V.value(fromColouring(b, c)) !== formula(b, c)) bad++; });
  }
  // forests: compositions of n ≤ 9 into 2..4 paths
  let forests = 0;
  const comps = (n: number, k: number): number[][] => k === 1 ? [[n]] : Array.from({ length: n - k + 1 }, (_, i) => i + 1).flatMap((a) => comps(n - a, k - 1).map((r) => [a, ...r]));
  for (let n = 2; n <= 9; n++) for (let k = 2; k <= Math.min(4, n); k++) for (const parts of comps(n, k)) {
    const arcs: [number, number][] = [];
    let base = 0;
    for (const p of parts) { for (let i = 0; i + 1 < p; i++) arcs.push([base + i, base + i + 1]); base += p; }
    const b = directed(n, arcs);
    each(n, (c) => { forests++; if (V.value(fromColouring(b, c)) !== formula(b, c)) bad++; });
  }
  out.corollary = { paths: checked, forests, bad };
  console.log('Corollary paths', checked, 'forests', forests, 'bad', bad);
}
void name; void ZERO; void STAR;
out.sec = (Date.now() - t0) / 1000;
mkdirSync('runs', { recursive: true });
writeFileSync('runs/verify.json', JSON.stringify(out, null, 1));
console.log(out);
