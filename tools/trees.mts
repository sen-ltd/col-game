// Unordered binary trees (every vertex has 0, 1 or 2 children) on n vertices, as
// child lists with vertex 0 the root. Counts are OEIS A001190 (Wedderburn–Etherington).
export type Kids = number[][];

const shapes: string[][] = [[], ['()']];
function canon(n: number): string[] {
  for (let m = shapes.length; m <= n; m++) {
    const out = new Set<string>();
    for (const a of shapes[m - 1]) out.add(`(${a})`);
    for (let i = 1; i < m - 1; i++) {
      const j = m - 1 - i;
      if (i > j) continue;
      for (const a of shapes[i]) for (const b of shapes[j]) {
        if (i === j && a > b) continue;
        out.add(`(${a}${b})`);
      }
    }
    shapes.push([...out].sort());
  }
  return shapes[n];
}

/** parse "((..)(..))" into child lists, root 0, preorder numbering */
export function parse(s: string): Kids {
  const kids: Kids = [];
  const stack: number[] = [];
  for (const ch of s) {
    if (ch === '(') {
      const v = kids.length;
      kids.push([]);
      if (stack.length) kids[stack[stack.length - 1]].push(v);
      stack.push(v);
    } else stack.pop();
  }
  return kids;
}

export const binaryTrees = (n: number): string[] => canon(n);

// Rooted unordered trees of any arity on n vertices (OEIS A000081), same string form.
const rooted: string[][] = [[], ['()']];
function forests(m: number, maxPart: number, maxCode: string | null): string[][] {
  // multisets of trees with total size m, parts in non-increasing (size, code) order
  if (m === 0) return [[]];
  const out: string[][] = [];
  for (let k = Math.min(m, maxPart); k >= 1; k--) {
    for (const t of rootedTrees(k)) {
      if (k === maxPart && maxCode !== null && t > maxCode) continue;
      for (const rest of forests(m - k, k, t)) out.push([t, ...rest]);
    }
  }
  return out;
}
export function rootedTrees(n: number): string[] {
  for (let m = rooted.length; m <= n; m++) rooted.push(forests(m - 1, m - 1, null).map((f) => `(${f.join('')})`).sort());
  return rooted[n];
}
