// Collects the numbers quoted in the README and the articles from runs/*.json.
//   node tools/report.mts → runs/summary.json (and prints it)
import { readFileSync, writeFileSync } from 'node:fs';

const j = (f: string) => JSON.parse(readFileSync(`runs/${f}`, 'utf8'));
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const conj = j('conjecture-11.json');
const variants = j('variants-10.json');
const colCold = j('cold-col-8.json');
const myCold = j('cold-myopic-4.json');
const src4 = j('sources-4.json');
const src8 = j('sources-8-sample.json');
const ver = j('verify.json');

const denom = (v: string) => { const m = v.match(/\/(\d+)/); return m ? Number(m[1]) : 1; };
const maxDen = Math.max(...conj.values.map((x: { v: string }) => denom(x.v)));
const out = {
  verify: ver,
  conjecture: {
    maxN: conj.N,
    positions: sum(conj.rows.map((r: { positions: number }) => r.positions)),
    cases: sum(conj.rows.map((r: { cases: number }) => r.cases)),
    fails: sum(conj.rows.map((r: { fails: number }) => r.fails)),
    notCold: sum(conj.rows.map((r: { notCold: number }) => r.notCold)),
    byN: conj.rows.map((r: { n: number; trees: number; positions: number; cases: number; fails: number }) => [r.n, r.trees, r.positions, r.cases, r.fails]),
    distinctValues: conj.values.length,
    maxDenominator: maxDen,
    firstWithDenominator: Object.fromEntries([2, 4, 8, 16].map((d) => [d, conj.values.find((x: { v: string }) => denom(x.v) === d && !x.v.startsWith('−')) ?? null])),
    sec: conj.sec,
  },
  variants: { maxN: variants.N, positions: variants.positions, notCold: variants.notCold, tally: Object.fromEntries(Object.entries(variants.tally).map(([k, v]) => [k, { cases: (v as { cases: number }).cases, fails: (v as { fails: number }).fails }])) },
  sources: { exhaustive4: src4.res, sample8: { source: src8.res.source.cases, sourceFails: src8.res.source.fails, watched: src8.res.watched.cases, watchedFails: src8.res.watched.fails } },
  colCold: {
    maxN: colCold.N,
    graphsByN: colCold.rows.map((r: { n: number; graphs: number }) => [r.n, r.graphs]),
    positions: sum(colCold.rows.map((r: { positions: number }) => r.positions)),
    notCold: sum(colCold.rows.map((r: { notCold: number }) => r.notCold)),
    emptyZeroStarByN: colCold.rows.map((r: { n: number; emptyZero: number; emptyStar: number }) => [r.n, r.emptyZero, r.emptyStar]),
    distinctValues: colCold.values.length,
  },
  myopicCold: { maxN: myCold.N, positions: sum(myCold.rows.map((r: { positions: number }) => r.positions)), notCold: sum(myCold.rows.map((r: { notCold: number }) => r.notCold)) },
};
writeFileSync('runs/summary.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
