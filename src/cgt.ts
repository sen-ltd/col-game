// Short combinatorial games in canonical form.
//
// Every game is interned once by its canonical option lists, so two games are
// equal exactly when their ids are equal. `make` turns any option lists (of
// canonical games) into a canonical form by deleting dominated options and
// bypassing reversible ones; `le` is Conway's recursive comparison.

export type GameId = number;

const Ls: GameId[][] = [];
const Rs: GameId[][] = [];
// numeric value of a game that equals a number, NaN otherwise
const numVal: number[] = [];
const byKey = new Map<string, GameId>();

const KEY = 0x4000000; // pair keys: g * KEY + h, ids stay below 2^26

// A Map holds at most 2^24 entries; the pair caches outgrow that on long Clobber
// rows, so they are split over shards by key.
class PairCache<V> {
  private shards: Map<number, V>[] = Array.from({ length: 64 }, () => new Map<number, V>());
  get(k: number): V | undefined {
    return this.shards[k % 64].get(k);
  }
  set(k: number, v: V): void {
    this.shards[k % 64].set(k, v);
  }
  get size(): number {
    return this.shards.reduce((n, m) => n + m.size, 0);
  }
}

const leMemo = new PairCache<boolean>();
const sumMemo = new PairCache<GameId>();
const negMemo = new Map<GameId, GameId>();
const numGames = new Map<number, GameId>();

const uniq = (xs: GameId[]) => [...new Set(xs)].sort((a, b) => a - b);

function intern(L: GameId[], R: GameId[], value: number): GameId {
  const key = L.join(',') + '|' + R.join(',');
  const hit = byKey.get(key);
  if (hit !== undefined) return hit;
  const id = Ls.length;
  Ls.push(L);
  Rs.push(R);
  numVal.push(value);
  byKey.set(key, id);
  return id;
}

export const ZERO: GameId = intern([], [], 0);
numGames.set(0, ZERO);

export const leftOptions = (g: GameId): readonly GameId[] => Ls[g];
export const rightOptions = (g: GameId): readonly GameId[] => Rs[g];
export const isNumber = (g: GameId): boolean => !Number.isNaN(numVal[g]);
export const numberValue = (g: GameId): number => numVal[g];
export const gameCount = (): number => Ls.length;
export const cacheSizes = () => ({ le: leMemo.size, sum: sumMemo.size });

/** The simplest number strictly between lo and hi (lo < hi; either may be infinite). */
export function simplestBetween(lo: number, hi: number): number {
  if (lo < 0 && hi > 0) return 0;
  if (hi <= 0) return -simplestBetween(-hi, -lo);
  // 0 <= lo < hi: the smallest integer above lo, else the dyadic with the smallest denominator
  const n = Math.floor(lo) + 1;
  if (n < hi) return n;
  for (let d = 2; ; d *= 2) {
    const m = Math.floor(lo * d) + 1;
    if (m / d < hi) return m / d;
  }
}

/** Canonical form of a dyadic rational. */
export function numberGame(x: number): GameId {
  const hit = numGames.get(x);
  if (hit !== undefined) return hit;
  let g: GameId;
  if (Number.isInteger(x)) {
    g = x > 0 ? intern([numberGame(x - 1)], [], x) : intern([], [numberGame(x + 1)], x);
  } else {
    let d = 2;
    while (!Number.isInteger(x * d)) d *= 2;
    g = intern([numberGame(x - 1 / d)], [numberGame(x + 1 / d)], x);
  }
  numGames.set(x, g);
  return g;
}

/** G ≤ H. */
export function le(g: GameId, h: GameId): boolean {
  if (g === h) return true;
  const a = numVal[g];
  const b = numVal[h];
  if (!Number.isNaN(a) && !Number.isNaN(b)) return a <= b;
  const k = g * KEY + h;
  const hit = leMemo.get(k);
  if (hit !== undefined) return hit;
  let r = true;
  for (const hr of Rs[h]) if (le(hr, g)) { r = false; break; }
  if (r) for (const gl of Ls[g]) if (le(h, gl)) { r = false; break; }
  leMemo.set(k, r);
  return r;
}

export const eq = (g: GameId, h: GameId) => g === h;
export const ge = (g: GameId, h: GameId) => le(h, g);
export const lt = (g: GameId, h: GameId) => le(g, h) && !le(h, g);

export type Outcome = 'L' | 'R' | 'P' | 'N';

/** Who wins: L (G > 0), R (G < 0), P (G = 0, the second player) or N (G ‖ 0, the first player). */
export function outcome(g: GameId): Outcome {
  const geq = le(ZERO, g);
  const leq = le(g, ZERO);
  return geq && leq ? 'P' : geq ? 'L' : leq ? 'R' : 'N';
}

// Comparisons between a canonical game x and a game G given only by its option
// lists (the game being simplified, which has no id yet).
class RawCompare {
  private xg = new Map<GameId, boolean>();
  private gx = new Map<GameId, boolean>();
  private L: GameId[];
  private R: GameId[];
  constructor(L: GameId[], R: GameId[]) {
    this.L = L;
    this.R = R;
  }
  /** x ≤ G */
  xLeG(x: GameId): boolean {
    const hit = this.xg.get(x);
    if (hit !== undefined) return hit;
    let r = true;
    for (const gr of this.R) if (le(gr, x)) { r = false; break; }
    if (r) for (const xl of Ls[x]) if (this.gLeX(xl)) { r = false; break; }
    this.xg.set(x, r);
    return r;
  }
  /** G ≤ x */
  gLeX(x: GameId): boolean {
    const hit = this.gx.get(x);
    if (hit !== undefined) return hit;
    let r = true;
    for (const xr of Rs[x]) if (this.xLeG(xr)) { r = false; break; }
    if (r) for (const gl of this.L) if (le(x, gl)) { r = false; break; }
    this.gx.set(x, r);
    return r;
  }
}

function numberIfAny(L: GameId[], R: GameId[]): number {
  let lo = -Infinity;
  let hi = Infinity;
  for (const l of L) {
    if (Number.isNaN(numVal[l])) return NaN;
    lo = Math.max(lo, numVal[l]);
  }
  for (const r of R) {
    if (Number.isNaN(numVal[r])) return NaN;
    hi = Math.min(hi, numVal[r]);
  }
  return lo < hi ? simplestBetween(lo, hi) : NaN;
}

/** The canonical form of { L | R }, where every option is already canonical. */
export function make(L0: readonly GameId[], R0: readonly GameId[]): GameId {
  let L = uniq([...L0]);
  let R = uniq([...R0]);
  const x = numberIfAny(L, R);
  if (!Number.isNaN(x)) return numberGame(x);
  for (;;) {
    // delete dominated options
    L = L.filter((a) => !L.some((b) => b !== a && le(a, b)));
    R = R.filter((a) => !R.some((b) => b !== a && le(b, a)));
    // bypass reversible options
    const cmp = new RawCompare(L, R);
    let changed = false;
    const nL: GameId[] = [];
    for (const a of L) {
      const rev = Rs[a].find((ar) => cmp.xLeG(ar));
      if (rev === undefined) nL.push(a);
      else { nL.push(...Ls[rev]); changed = true; }
    }
    const nR: GameId[] = [];
    for (const b of R) {
      const rev = Ls[b].find((bl) => cmp.gLeX(bl));
      if (rev === undefined) nR.push(b);
      else { nR.push(...Rs[rev]); changed = true; }
    }
    L = uniq(nL);
    R = uniq(nR);
    if (!changed) break;
  }
  const y = numberIfAny(L, R);
  if (!Number.isNaN(y)) return numberGame(y);
  return intern(L, R, NaN);
}

export function neg(g: GameId): GameId {
  if (isNumber(g)) return numberGame(-numVal[g]);
  const hit = negMemo.get(g);
  if (hit !== undefined) return hit;
  const r = make(Rs[g].map(neg), Ls[g].map(neg));
  negMemo.set(g, r);
  return r;
}

export function add(g: GameId, h: GameId): GameId {
  if (g === ZERO) return h;
  if (h === ZERO) return g;
  if (isNumber(g) && isNumber(h)) return numberGame(numVal[g] + numVal[h]);
  if (g > h) [g, h] = [h, g];
  const k = g * KEY + h;
  const hit = sumMemo.get(k);
  if (hit !== undefined) return hit;
  const L = [...Ls[g].map((gl) => add(gl, h)), ...Ls[h].map((hl) => add(g, hl))];
  const R = [...Rs[g].map((gr) => add(gr, h)), ...Rs[h].map((hr) => add(g, hr))];
  const r = make(L, R);
  sumMemo.set(k, r);
  return r;
}

export const sum = (gs: readonly GameId[]): GameId => gs.reduce(add, ZERO);

const nimbers: GameId[] = [ZERO];
/** *n */
export function nimber(n: number): GameId {
  while (nimbers.length <= n) {
    const opts = nimbers.slice();
    nimbers.push(make(opts, opts));
  }
  return nimbers[n];
}

export const STAR = nimber(1);
export const UP = make([ZERO], [STAR]);
export const DOWN = neg(UP);

/** n·↑ (n may be negative). */
export function upMultiple(n: number): GameId {
  let g = ZERO;
  for (let i = 0; i < Math.abs(n); i++) g = add(g, n > 0 ? UP : DOWN);
  return g;
}

/** Left stop and right stop: where the game "cools" to when each side moves first. */
export function stops(g: GameId): [number, number] {
  return [leftStop(g), rightStop(g)];
}
const lsMemo = new Map<GameId, number>();
const rsMemo = new Map<GameId, number>();
function leftStop(g: GameId): number {
  if (isNumber(g)) return numVal[g];
  let v = lsMemo.get(g);
  if (v === undefined) {
    v = Math.max(...Ls[g].map(rightStop));
    lsMemo.set(g, v);
  }
  return v;
}
function rightStop(g: GameId): number {
  if (isNumber(g)) return numVal[g];
  let v = rsMemo.get(g);
  if (v === undefined) {
    v = Math.min(...Rs[g].map(leftStop));
    rsMemo.set(g, v);
  }
  return v;
}

/** Birthday: the day on which the game is first born. */
const bdMemo = new Map<GameId, number>();
export function birthday(g: GameId): number {
  let v = bdMemo.get(g);
  if (v === undefined) {
    v = 0;
    for (const o of [...Ls[g], ...Rs[g]]) v = Math.max(v, birthday(o) + 1);
    bdMemo.set(g, v);
  }
  return v;
}

export function formatNumber(x: number): string {
  if (Number.isInteger(x)) return x < 0 ? `−${-x}` : String(x);
  let d = 2;
  while (!Number.isInteger(x * d)) d *= 2;
  const m = x * d;
  return `${m < 0 ? '−' : ''}${Math.abs(m)}/${d}`;
}

// n·↑ + *m for |n| ≤ 40 and m < 16: the infinitesimals Clobber positions run into
const UP_RANGE = 40;
const infTable = new Map<GameId, [number, number]>();
let infBuilt = false;
function buildInfTable(): void {
  infBuilt = true;
  for (let n = -UP_RANGE; n <= UP_RANGE; n++) {
    const u = upMultiple(n);
    for (let m = 0; m < 16; m++) {
      const g = add(u, nimber(m));
      if (!infTable.has(g)) infTable.set(g, [n, m]);
    }
  }
}

function upName(n: number): string {
  if (n === 0) return '';
  const a = Math.abs(n);
  const sym = n > 0 ? ['↑', '⇑'] : ['↓', '⇓'];
  return a <= 2 ? sym[a - 1] : `${a}·${sym[0]}`;
}

/** n and m when G = x + n·↑ + *m for a number x, else null. */
export function infinitesimalPart(g: GameId): { x: number; ups: number; star: number } | null {
  if (!infBuilt) buildInfTable();
  const [ls, rs] = stops(g);
  if (ls !== rs) return null;
  const h = add(g, numberGame(-ls));
  const hit = infTable.get(h);
  return hit ? { x: ls, ups: hit[0], star: hit[1] } : null;
}

/** Number of distinct games reachable from G (G itself included). */
export function formSize(g: GameId, limit = Infinity): number {
  const seen = new Set<GameId>([g]);
  const stack = [g];
  while (stack.length && seen.size <= limit) {
    const h = stack.pop()!;
    for (const o of [...Ls[h], ...Rs[h]]) if (!seen.has(o)) { seen.add(o); stack.push(o); }
  }
  return seen.size;
}

/**
 * x + ⧾(k) = {x || x | x − k} (tiny-k) gives k > 0; x + ⧿(k) = {x + k | x || x} (miny-k)
 * gives k < 0; null for anything else.
 */
export function tinyPart(g: GameId): { x: number; k: number } | null {
  const L = Ls[g];
  const R = Rs[g];
  if (L.length !== 1 || R.length !== 1) return null;
  const [a, b] = [L[0], R[0]];
  if (isNumber(a) && !isNumber(b) && Ls[b].length === 1 && Rs[b].length === 1 && Ls[b][0] === a && isNumber(Rs[b][0])) {
    const k = numVal[a] - numVal[Rs[b][0]];
    return k > 0 ? { x: numVal[a], k } : null;
  }
  if (isNumber(b) && !isNumber(a) && Ls[a].length === 1 && Rs[a].length === 1 && Rs[a][0] === b && isNumber(Ls[a][0])) {
    const k = numVal[Ls[a][0]] - numVal[b];
    return k > 0 ? { x: numVal[b], k: -k } : null;
  }
  return null;
}

/** A readable name: 3/4, *2, ↑*, 1/2⇑, 2 + 4·↓, ±1, {1 | 0}, … */
export function name(g: GameId): string {
  if (isNumber(g)) return formatNumber(numVal[g]);
  const inf = infinitesimalPart(g);
  if (inf) {
    const x = inf.x === 0 ? '' : formatNumber(inf.x);
    const star = inf.star === 0 ? '' : inf.star === 1 ? '*' : `*${inf.star}`;
    // 2 + ⇑ and 2 + 4·↓, not "2⇑" or "24↓"; a number with only a star stays 1*
    return x && inf.ups !== 0 ? `${x} + ${upName(inf.ups)}${star}` : x + upName(inf.ups) + star;
  }
  const tiny = tinyPart(g);
  if (tiny) {
    const t = `${tiny.k > 0 ? '⧾' : '⧿'}(${formatNumber(Math.abs(tiny.k))})`;
    return tiny.x === 0 ? t : `${formatNumber(tiny.x)} + ${t}`;
  }
  const L = Ls[g];
  const R = Rs[g];
  if (L.length === 1 && R.length === 1 && neg(L[0]) === R[0] && isNumber(L[0])) {
    return `±${formatNumber(numVal[L[0]])}`;
  }
  return `{${L.map(name).join(', ')} | ${R.map(name).join(', ')}}`;
}
