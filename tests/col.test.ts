import { describe, it, expect } from 'vitest';
import { name, add, nimber, numberGame, outcome, STAR, type GameId } from '../src/cgt.ts';
import {
  Valuer, fromColouring, empty, plainOutcome, undirected, directed, dipath, binaryTree, pathFormula, isCold,
  freeSources, without, key, components, type Board, type Colour,
} from '../src/col.ts';
import { connectedGraphs } from '../tools/graphs.mts';
import { binaryTrees, rootedTrees, parse } from '../tools/trees.mts';

const V = new Valuer();
const fromMask = (g: number[]): Board => g.map((m) => { const ws: number[] = []; for (let u = 0; u < g.length; u++) if (m & (1 << u)) ws.push(u); return ws; });
function each(n: number, f: (c: Colour[]) => void) {
  for (let code = 0; code < 3 ** n; code++) {
    const c: Colour[] = [];
    let x = code;
    for (let v = 0; v < n; v++) { c.push((x % 3) as Colour); x = Math.floor(x / 3); }
    f(c);
  }
}
function digraphs(n: number, f: (b: Board) => void) {
  const pairs: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([i, j]);
  for (let code = 0; code < 4 ** pairs.length; code++) {
    const arcs: [number, number][] = [];
    let x = code;
    for (const [i, j] of pairs) { const k = x & 3; x >>= 2; if (k & 1) arcs.push([i, j]); if (k & 2) arcs.push([j, i]); }
    f(directed(n, arcs));
  }
}
const agrees = (g: GameId, [l, r]: [boolean, boolean]) => {
  const o = outcome(g);
  return l === (o === 'L' || o === 'N') && r === (o === 'R' || o === 'N');
};
const value = (b: Board, c?: Colour[]) => V.value(c ? fromColouring(b, c) : empty(b));
const treeColour = (s: string, c: string) => value(binaryTree(parse(s)), [...c].map(Number) as Colour[]);

describe('engine', () => {
  it('agrees with plain search on every Col position of connected graphs up to 5 vertices', () => {
    const all = connectedGraphs(5);
    let n0 = 0;
    for (let n = 1; n <= 5; n++) for (const g of all[n]) {
      const b = fromMask(g);
      each(n, (c) => {
        if (!b.every((ws, u) => !c[u] || ws.every((w) => c[w] !== c[u]))) return;
        n0++;
        expect(agrees(value(b, c), plainOutcome(b, c))).toBe(true);
      });
    }
    expect(n0).toBe(1721);
  });
  it('agrees with plain search on every Myopic Col position of digraphs up to 3 vertices', () => {
    for (let n = 2; n <= 3; n++) digraphs(n, (b) => each(n, (c) => expect(agrees(value(b, c), plainOutcome(b, c))).toBe(true)));
  });
  it('keys mirror-image trees alike', () => {
    const a = fromColouring(binaryTree(parse('((())())')), [0, 0, 1, 0]);
    const b = fromColouring(binaryTree(parse('(()(()))')), [0, 0, 0, 1]);
    expect(key(a)).toBe(key(b));
    const u = empty(undirected(4, [[0, 1], [1, 2], [2, 3]]));
    const w = empty(undirected(4, [[3, 0], [0, 2], [2, 1]]));
    expect(key(u)).toBe(key(w));
  });
  it('drops arcs whose ends share no allowed colour, and splits there', () => {
    // 0 → 1 → 2 with 2 blue: 1 may only be red, so 0 → 1 still matters; colour 1 red too and the list falls apart
    const p = fromColouring(dipath(4), [0, 0, 2, 1]);
    expect(p.allow).toEqual([3, 1]);
    expect(components(p).length).toBe(1);
  });
});

describe('Col (Conway)', () => {
  it('values small paths and stars', () => {
    expect(name(value(undirected(1, [])))).toBe('*');
    for (let n = 2; n <= 8; n++) {
      const es = Array.from({ length: n - 1 }, (_, i): [number, number] => [i, i + 1]);
      expect(name(value(undirected(n, es)))).toBe('0');
    }
    // P3 with an end coloured blue: the middle is red-only
    expect(name(value(undirected(3, [[0, 1], [1, 2]]), [1, 0, 0]))).toBe('−1/2');
  });
  it('is cold on every colouring of every connected graph up to 5 vertices', () => {
    const all = connectedGraphs(5);
    for (let n = 1; n <= 5; n++) for (const g of all[n]) {
      const b = fromMask(g);
      each(n, (c) => {
        if (!b.every((ws, u) => !c[u] || ws.every((w) => c[w] !== c[u]))) return;
        expect(isCold(value(b, c))).toBe(true);
      });
    }
  });
});

describe('Bovee–Burke–Tennenhouse (2016): Myopic Col on lists', () => {
  it('Lemma: n·*, (n−1)·* − 1, (n−1)·* + 1', () => {
    for (let n = 1; n <= 40; n++) {
      const c: Colour[] = new Array(n + 1).fill(0);
      expect(value(dipath(n))).toBe(nimber(n % 2));
      c[n] = 1;
      expect(value(dipath(n + 1), c)).toBe(add(nimber((n - 1) % 2), numberGame(-1)));
      c[n] = 2;
      expect(value(dipath(n + 1), c)).toBe(add(nimber((n - 1) % 2), numberGame(1)));
    }
  });
  it('Corollary a·* + b − c on every colouring of lists up to 8 nodes', () => {
    for (let n = 1; n <= 8; n++) {
      const b = dipath(n);
      each(n, (c) => {
        const [a, bb, cc] = pathFormula(b, c);
        expect(value(b, c)).toBe(add(nimber(a % 2), numberGame(bb - cc)));
      });
    }
  });
});

describe('Bovee–Burke–Tennenhouse (2016): Myopic Col on binary trees', () => {
  it('counts binary trees and rooted trees as OEIS A001190 and A000081', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => binaryTrees(n).length)).toEqual([1, 1, 2, 3, 6, 11, 23, 46, 98, 207]);
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((n) => rootedTrees(n).length)).toEqual([1, 1, 2, 4, 9, 20, 48, 115]);
  });
  it('has the values 1/2 and −3/4 the paper mentions, and 1/4, on small trees', () => {
    expect(name(treeColour('(()())', '010'))).toBe('−1/2');
    expect(name(treeColour('(()(()()))', '01000'))).toBe('−3/4');
    expect(name(treeColour('(((()(()()))))', '0201000'))).toBe('1/4');
  });
  it('Conjecture: G(T) = * + G(T1) + G(T2) on every binary tree up to 7 nodes', () => {
    let cases = 0;
    for (let n = 3; n <= 7; n++) for (const s of binaryTrees(n)) {
      const kids = parse(s);
      if (kids[0].length !== 2) continue;
      const b = binaryTree(kids);
      each(n, (c) => {
        if (c[0] || c[kids[0][0]] || c[kids[0][1]]) return;
        cases++;
        const p = fromColouring(b, c);
        // the root is still in play with both colours; it is a free source unless both children died
        expect(p.ids[0]).toBe(0);
        expect(freeSources(p).includes(0) || p.look[0].length === 0).toBe(true);
        expect(V.value(p)).toBe(add(STAR, V.value(without(p, 0))));
      });
    }
    expect(cases).toBe(1 + 3 + 27 + 135 + 972);
  });
});

describe('the split rule beyond trees (measured, not proved)', () => {
  it('a vertex nobody looks at, allowing both colours, is a lone * on every digraph up to 4 vertices', () => {
    let cases = 0;
    for (let n = 2; n <= 4; n++) digraphs(n, (b) => each(n, (c) => {
      const p = fromColouring(b, c);
      for (const r of freeSources(p)) {
        cases++;
        expect(V.value(p)).toBe(add(STAR, V.value(without(p, r))));
      }
    }));
    // fewer than tools/sources.mts counts on the board: here dead neighbours do not count
    expect(cases).toBe(21894);
  });
  it('fails once somebody looks back at the root', () => {
    const b = directed(3, [[0, 1], [0, 2], [1, 0]]);
    const p = empty(b);
    expect(freeSources(p)).toEqual([]);
    expect(name(V.value(p))).toBe('0');
    expect(name(add(STAR, V.value(without(p, 0))))).toBe('*');
  });
  it('Myopic Col is cold on every colouring of every digraph up to 3 vertices', () => {
    for (let n = 2; n <= 3; n++) digraphs(n, (b) => each(n, (c) => expect(isCold(value(b, c))).toBe(true)));
  });
});
