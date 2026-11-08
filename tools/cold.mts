// Conway's theorem (ONAG): every Col position is a number x or x + *.
//   node tools/cold.mts col N      every connected graph on ≤ N vertices, every colouring
//                                  that can arise (no two neighbours share a colour)
//   node tools/cold.mts myopic N   every digraph on ≤ N labelled vertices (each pair:
//                                  no arc, →, ←, or both), every colouring
// The empty board alone says little: it is symmetric, so G = −G, and a cold game
// equal to its own negative is 0 or *.
// → runs/cold-<mode>-N.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { name } from '../src/cgt.ts';
import { Valuer, fromColouring, isCold, type Board, type Colour } from '../src/col.ts';
import { connectedGraphs } from './graphs.mts';

const mode = process.argv[2] ?? 'col';
const N = Number(process.argv[3] ?? 6);
const t0 = Date.now();
const V = new Valuer();
const rows: unknown[] = [];
const hot: unknown[] = [];
const valueCount = new Map<string, number>();
const firstWith = new Map<string, string>();
const fromMask = (g: number[]): Board => g.map((m) => { const ws: number[] = []; for (let u = 0; u < g.length; u++) if (m & (1 << u)) ws.push(u); return ws; });

function eachColouring(n: number, ok: (c: Colour[]) => boolean, f: (c: Colour[]) => void): void {
  const total = 3 ** n;
  for (let code = 0; code < total; code++) {
    const c: Colour[] = [];
    let x = code;
    for (let v = 0; v < n; v++) { c.push((x % 3) as Colour); x = Math.floor(x / 3); }
    if (ok(c)) f(c);
  }
}

if (mode === 'col') {
  const all = connectedGraphs(N);
  for (let n = 1; n <= N; n++) {
    let notCold = 0, zero = 0, star = 0, positions = 0;
    for (const g of all[n]) {
      const b = fromMask(g);
      eachColouring(n, (c) => b.every((ws, u) => !c[u] || ws.every((w) => c[w] !== c[u])), (c) => {
        positions++;
        const v = V.value(fromColouring(b, c));
        const nm = name(v);
        valueCount.set(nm, (valueCount.get(nm) ?? 0) + 1);
        if (!firstWith.has(nm)) firstWith.set(nm, `${n}:${g.map((m) => m.toString(36)).join(' ')}:${c.join('')}`);
        if (c.every((x) => !x)) { if (nm === '0') zero++; if (nm === '*') star++; }
        if (!isCold(v)) { notCold++; if (hot.length < 20) hot.push({ n, g, c: c.join(''), value: nm }); }
      });
    }
    const row = { n, graphs: all[n].length, positions, notCold, emptyZero: zero, emptyStar: star, sec: (Date.now() - t0) / 1000 };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
} else {
  for (let n = 2; n <= N; n++) {
    const pairs: [number, number][] = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([i, j]);
    let notCold = 0, boards = 0, positions = 0;
    const total = 4 ** pairs.length;
    for (let code = 0; code < total; code++) {
      const look: Board = Array.from({ length: n }, () => []);
      let x = code;
      for (const [i, j] of pairs) {
        const k = x & 3; x >>= 2;
        if (k & 1) look[i].push(j);
        if (k & 2) look[j].push(i);
      }
      boards++;
      eachColouring(n, () => true, (c) => {
        positions++;
        const v = V.value(fromColouring(look, c));
        const nm = name(v);
        valueCount.set(nm, (valueCount.get(nm) ?? 0) + 1);
        if (!firstWith.has(nm)) firstWith.set(nm, `${n}:${JSON.stringify(look)}:${c.join('')}`);
        if (!isCold(v)) { notCold++; if (hot.length < 20) hot.push({ n, look, c: c.join(''), value: nm }); }
      });
    }
    const row = { n, boards, positions, notCold, sec: (Date.now() - t0) / 1000 };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
}
mkdirSync('runs', { recursive: true });
const values = [...valueCount.entries()].sort((a, b) => b[1] - a[1]).map(([v, c]) => ({ v, count: c, first: firstWith.get(v) }));
writeFileSync(`runs/cold-${mode}-${N}.json`, JSON.stringify({ mode, N, rows, hot, values, components: V.size, sec: (Date.now() - t0) / 1000 }, null, 1));
console.log('values', values.slice(0, 12), 'hot', hot.length);
