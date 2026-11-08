// Col and Myopic Col on a graph. Left colours a vertex blue, Right colours one red,
// and you may not colour a vertex next to a vertex of your own colour. Whoever
// cannot move loses.
//
// Both games are written on one structure: `look[u]` lists the vertices u *looks
// at*, and u may not take a colour that one of them already has. In Col (Conway,
// ONAG) u looks at all its neighbours, so `look` is an undirected adjacency list.
// In Myopic Col (Bovee–Burke–Tennenhouse, "Games from Basic Data Structures", 2016) the board
// is a digraph and u looks only along its outgoing arcs.
//
// The position the players face is simpler than the colouring: a coloured vertex
// is gone, and each vertex keeps the set of colours still allowed on it (1 blue,
// 2 red, 3 both). A vertex allowed nothing is gone too. An arc u → w no longer
// matters once no colour is allowed on both ends (a move on w can only forbid a
// colour that u has already lost), so it is dropped. What is left falls apart into
// components, and the game is their sum.

import { type GameId, ZERO, STAR, add, make, numberGame, isNumber } from './cgt.ts';

export const BLUE = 1; // Left
export const RED = 2; // Right
export type Colour = 0 | 1 | 2;
export type Allow = 1 | 2 | 3;

/** look[u] = vertices u looks at. Undirected boards list each edge both ways. */
export type Board = number[][];

/** A position: local vertices 0..n−1, the colours allowed on each, the arcs that still matter. */
export interface Position {
  allow: Allow[];
  look: number[][];
  /** local vertex → board vertex */
  ids: number[];
}

export function undirected(n: number, es: readonly (readonly [number, number])[]): Board {
  const look: Board = Array.from({ length: n }, () => []);
  for (const [u, v] of es) {
    if (u === v || look[u].includes(v)) continue;
    look[u].push(v);
    look[v].push(u);
  }
  return look;
}

/** arcs (u, w): u looks at w */
export function directed(n: number, arcs: readonly (readonly [number, number])[]): Board {
  const look: Board = Array.from({ length: n }, () => []);
  for (const [u, w] of arcs) if (u !== w && !look[u].includes(w)) look[u].push(w);
  return look;
}

export const isUndirected = (b: Board) => b.every((ws, u) => ws.every((w) => b[w].includes(u)));

/** The subposition on `keep` with the given allowances, dead arcs dropped. */
function induced(look: Board, allow: readonly number[], keep: readonly number[], ids: readonly number[]): Position {
  const local = new Map<number, number>();
  keep.forEach((v, i) => local.set(v, i));
  const out: number[][] = keep.map((u) =>
    look[u].flatMap((w) => {
      const j = local.get(w);
      return j !== undefined && (allow[u] & allow[w]) ? [j] : [];
    }));
  return { allow: keep.map((v) => allow[v] as Allow), look: out, ids: keep.map((v) => ids[v]) };
}

/**
 * The position left by a colouring of `b`: colour[v] is 0 (uncoloured), BLUE or RED.
 * Any colouring of a digraph can arise in play (colour along a topological order of
 * the coloured part); in Col a vertex may not be next to its own colour.
 */
export function fromColouring(b: Board, colour: readonly Colour[]): Position {
  const n = b.length;
  const allow = new Array<number>(n).fill(3);
  for (let u = 0; u < n; u++) for (const w of b[u]) if (colour[w]) allow[u] &= ~colour[w];
  const keep: number[] = [];
  for (let v = 0; v < n; v++) if (!colour[v] && allow[v]) keep.push(v);
  return induced(b, allow, keep, Array.from({ length: n }, (_, i) => i));
}

export const empty = (b: Board): Position => fromColouring(b, new Array<Colour>(b.length).fill(0));

/** Can `side` (BLUE or RED) colour local vertex v? */
export const legal = (p: Position, v: number, side: Colour) => (p.allow[v] & side) !== 0;

/** The position after `side` colours local vertex v. */
export function play(p: Position, v: number, side: Colour): Position {
  const n = p.allow.length;
  const allow = p.allow.slice() as number[];
  for (let u = 0; u < n; u++) if (p.look[u].includes(v)) allow[u] &= ~side;
  const keep: number[] = [];
  for (let u = 0; u < n; u++) if (u !== v && allow[u]) keep.push(u);
  return induced(p.look, allow, keep, p.ids);
}

/** Weakly connected components, each as a Position. */
export function components(p: Position): Position[] {
  const n = p.allow.length;
  const nb: number[][] = p.look.map((ws) => ws.slice());
  p.look.forEach((ws, u) => ws.forEach((w) => nb[w].push(u)));
  const seen = new Uint8Array(n);
  const out: Position[] = [];
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue;
    const part: number[] = [];
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const v = stack.pop()!;
      part.push(v);
      for (const u of nb[v]) if (!seen[u]) { seen[u] = 1; stack.push(u); }
    }
    part.sort((a, b) => a - b);
    out.push(induced(p.look, p.allow, part, p.ids));
  }
  return out;
}

/**
 * A key equal for isomorphic components. Undirected trees get an AHU code from
 * their centre; out-trees (every vertex looked at by at most one other, one root)
 * get a rooted code; anything else is keyed by its labelled structure, which is
 * exact but shares less.
 */
export function key(p: Position): string {
  const n = p.allow.length;
  const arcs = p.look.reduce((s, ws) => s + ws.length, 0);
  const sym = p.look.every((ws, u) => ws.every((w) => p.look[w].includes(u)));
  if (sym && arcs === 2 * (n - 1)) return undirectedTreeCode(p);
  if (!sym && arcs === n - 1) {
    const parent = new Array<number>(n).fill(-1);
    let ok = true;
    p.look.forEach((ws, u) => ws.forEach((w) => { if (parent[w] >= 0) ok = false; parent[w] = u; }));
    const roots = parent.flatMap((x, v) => (x < 0 ? [v] : []));
    if (ok && roots.length === 1) {
      const code = (v: number): string => `${p.allow[v]}(${p.look[v].map(code).sort().join('')})`;
      return 'R' + code(roots[0]);
    }
  }
  const es: number[] = [];
  p.look.forEach((ws, u) => ws.forEach((w) => es.push(u * n + w)));
  es.sort((a, b) => a - b);
  return `G${n}:${p.allow.join('')}:${es.join(',')}`;
}

function undirectedTreeCode(p: Position): string {
  const n = p.allow.length;
  const deg = p.look.map((ns) => ns.length);
  let layer: number[] = [];
  for (let v = 0; v < n; v++) if (deg[v] <= 1) layer.push(v);
  let left = n;
  while (left > 2) {
    left -= layer.length;
    const next: number[] = [];
    for (const v of layer) for (const u of p.look[v]) if (--deg[u] === 1) next.push(u);
    layer = next;
  }
  const code = (v: number, parent: number): string => {
    const cs: string[] = [];
    for (const u of p.look[v]) if (u !== parent) cs.push(code(u, v));
    cs.sort();
    return `${p.allow[v]}(${cs.join('')})`;
  };
  if (layer.length === 1) return 'T' + code(layer[0], -1);
  const [a, b] = layer;
  const x = code(a, b);
  const y = code(b, a);
  return 'U' + (x < y ? x + y : y + x);
}

/** Values every component it meets, once each. */
export class Valuer {
  private memo = new Map<string, GameId>();
  get size(): number {
    return this.memo.size;
  }

  value(p: Position): GameId {
    let g = ZERO;
    for (const c of components(p)) g = add(g, this.component(c));
    return g;
  }

  component(c: Position): GameId {
    const n = c.allow.length;
    if (n === 0) return ZERO;
    if (n === 1) return c.allow[0] === 3 ? STAR : numberGame(c.allow[0] === BLUE ? 1 : -1);
    const k = key(c);
    const hit = this.memo.get(k);
    if (hit !== undefined) return hit;
    const L: GameId[] = [];
    const R: GameId[] = [];
    for (let v = 0; v < n; v++) {
      if (legal(c, v, BLUE)) L.push(this.value(play(c, v, BLUE)));
      if (legal(c, v, RED)) R.push(this.value(play(c, v, RED)));
    }
    const g = make(L, R);
    this.memo.set(k, g);
    return g;
  }
}

/** Is g a number x or x + * (Conway's theorem says every Col position is)? */
export const isCold = (g: GameId) => isNumber(g) || isNumber(add(g, STAR));

/**
 * Who wins by plain search on the board itself, with no game values, no splitting
 * and no arc dropping: [Left wins moving first, Right wins moving first].
 */
export function plainOutcome(b: Board, colour: readonly Colour[] = new Array<Colour>(b.length).fill(0)): [boolean, boolean] {
  const n = b.length;
  const memo = new Map<string, boolean>();
  const canPlay = (c: Colour[], v: number, side: Colour) => !c[v] && b[v].every((w) => c[w] !== side);
  const wins = (c: Colour[], side: Colour): boolean => {
    const k = side + c.join('');
    const hit = memo.get(k);
    if (hit !== undefined) return hit;
    let r = false;
    for (let v = 0; v < n && !r; v++) {
      if (!canPlay(c, v, side)) continue;
      c[v] = side;
      if (!wins(c, (3 - side) as Colour)) r = true;
      c[v] = 0;
    }
    memo.set(k, r);
    return r;
  };
  const c = colour.slice() as Colour[];
  return [wins(c, BLUE), wins(c, RED)];
}

// ---- Bovee–Burke–Tennenhouse (2016), Myopic Col on paths and binary trees -------------------

/** A directed path v0 → v1 → … → v(n−1), with the given colours. */
export function dipath(n: number): Board {
  const arcs: [number, number][] = [];
  for (let i = 0; i + 1 < n; i++) arcs.push([i, i + 1]);
  return directed(n, arcs);
}

/**
 * Corollary (Bovee–Burke–Tennenhouse): a Myopic Col position on paths equals a·* + b − c, where
 * a counts uncoloured vertices whose arc (if any) leads to an uncoloured vertex, b
 * those whose arc leads to red, c those whose arc leads to blue. Returns [a, b, c].
 */
export function pathFormula(b: Board, colour: readonly Colour[]): [number, number, number] {
  let a = 0, bb = 0, c = 0;
  b.forEach((ws, u) => {
    if (colour[u]) return;
    const t = ws.length ? colour[ws[0]] : 0;
    if (t === RED) bb++;
    else if (t === BLUE) c++;
    else a++;
  });
  return [a, bb, c];
}

/** A binary tree as an out-tree: kids[v] = up to two children, vertex 0 the root. */
export function binaryTree(kids: readonly (readonly number[])[]): Board {
  const arcs: [number, number][] = [];
  kids.forEach((cs, v) => cs.forEach((c) => arcs.push([v, c])));
  return directed(kids.length, arcs);
}

/**
 * Vertices of a position that nobody looks at, that allow both colours and look at
 * something. Measured here (not proved): each one splits off as a lone *, i.e.
 * G = * + G(position without it). This extends the conjecture of Bovee–Burke–Tennenhouse on
 * binary trees, whose root is such a vertex.
 */
export function freeSources(p: Position): number[] {
  const watched = new Uint8Array(p.allow.length);
  p.look.forEach((ws) => ws.forEach((w) => { watched[w] = 1; }));
  return p.allow.flatMap((a, v) => (a === 3 && !watched[v] && p.look[v].length > 0 ? [v] : []));
}

/** The position with local vertex v deleted (no colour, no effect on anyone). */
export function without(p: Position, v: number): Position {
  const keep: number[] = [];
  for (let u = 0; u < p.allow.length; u++) if (u !== v) keep.push(u);
  return induced(p.look, p.allow, keep, p.ids);
}
