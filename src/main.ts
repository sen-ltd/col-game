import './style.css';
import { type Board, type Colour, BLUE, RED, undirected, directed, isUndirected } from './col.ts';
import type { Request, Reply } from './worker.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const svg = $<HTMLElement>('board') as unknown as SVGSVGElement;
const statusEl = $('status');
const presetSel = $<HTMLSelectElement>('presetSel');
const youSel = $<HTMLSelectElement>('youSel');
const firstSel = $<HTMLSelectElement>('firstSel');
const hintsBox = $<HTMLInputElement>('hints');

// ---- boards -------------------------------------------------------------------------

interface Layout {
  name: string;
  look: Board;
  xy: [number, number][];
  /** pre-coloured vertices */
  colour?: Colour[];
}

function fit(xy: [number, number][]): [number, number][] {
  const xs = xy.map((p) => p[0]);
  const ys = xy.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const s = Math.max(x1 - x0, y1 - y0) || 1;
  return xy.map(([x, y]) => [(x - x0) / s + (1 - (x1 - x0) / s) / 2, (y - y0) / s + (1 - (y1 - y0) / s) / 2]);
}

const ring = (n: number, r = 1, phase = -Math.PI / 2): [number, number][] =>
  Array.from({ length: n }, (_, i) => [r * Math.cos(phase + (2 * Math.PI * i) / n), r * Math.sin(phase + (2 * Math.PI * i) / n)]);

function pathU(n: number): Layout {
  const es = Array.from({ length: n - 1 }, (_, i): [number, number] => [i, i + 1]);
  return { name: `P${n}`, look: undirected(n, es), xy: fit(Array.from({ length: n }, (_, i) => [i, 0])) };
}
function cycleU(n: number): Layout {
  const es = Array.from({ length: n }, (_, i): [number, number] => [i, (i + 1) % n]);
  return { name: `C${n}`, look: undirected(n, es), xy: fit(ring(n)) };
}
function gridU(w: number, h: number): Layout {
  const es: [number, number][] = [];
  const xy: [number, number][] = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    xy.push([i, j]);
    if (i + 1 < w) es.push([j * w + i, j * w + i + 1]);
    if (j + 1 < h) es.push([j * w + i, (j + 1) * w + i]);
  }
  return { name: `${w}×${h}`, look: undirected(w * h, es), xy: fit(xy) };
}
function petersen(): Layout {
  const es: [number, number][] = [];
  for (let i = 0; i < 5; i++) es.push([i, (i + 1) % 5], [i, i + 5], [5 + i, 5 + ((i + 2) % 5)]);
  return { name: 'Petersen', look: undirected(10, es), xy: fit([...ring(5), ...ring(5, 0.5)]) };
}

/** A linked list v0 → v1 → … (each node looks at its successor). */
function list(n: number, colour?: Colour[]): Layout {
  const arcs = Array.from({ length: n - 1 }, (_, i): [number, number] => [i, i + 1]);
  return { name: `list ${n}`, look: directed(n, arcs), xy: fit(Array.from({ length: n }, (_, i) => [i, 0])), colour };
}

/** A binary tree from its preorder string "(()(()()))": each node looks at its children. */
function tree(s: string, colour?: string): Layout {
  const kids: number[][] = [];
  const stack: number[] = [];
  for (const ch of s) {
    if (ch === '(') {
      const v = kids.length;
      kids.push([]);
      if (stack.length) kids[stack[stack.length - 1]].push(v);
      stack.push(v);
    } else stack.pop();
  }
  const xy: [number, number][] = new Array(kids.length);
  let leaf = 0;
  const place = (v: number, d: number): number => {
    if (!kids[v].length) { xy[v] = [leaf++, d]; return xy[v][0]; }
    const xs = kids[v].map((u) => place(u, d + 1));
    // a lone child sits half a step to the side so the arc reads as a tree
    xy[v] = [kids[v].length === 1 ? xs[0] - 0.5 : (xs[0] + xs[xs.length - 1]) / 2, d];
    return xy[v][0];
  };
  place(0, 0);
  const arcs: [number, number][] = [];
  kids.forEach((cs, v) => cs.forEach((c) => arcs.push([v, c])));
  return {
    name: `tree ${kids.length}`, look: directed(kids.length, arcs), xy: fit(xy.map(([x, y]) => [x, y * 1.15])),
    colour: colour ? ([...colour].map(Number) as Colour[]) : undefined,
  };
}

/** A 15-node random binary tree (fixed seed) with a few coloured nodes. */
function randomTree(): Layout {
  let seed = 20160520;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const kids: number[][] = [[]];
  while (kids.length < 15) {
    const open = kids.map((c, v) => (c.length < 2 ? v : -1)).filter((v) => v >= 0);
    const p = open[Math.floor(rnd() * open.length)];
    kids[p].push(kids.length);
    kids.push([]);
  }
  const str = (v: number): string => `(${kids[v].map(str).join('')})`;
  const L = tree(str(0));
  // renumbered in preorder by tree(); colour three deep nodes
  const colour = new Array<Colour>(15).fill(0);
  colour[6] = BLUE; colour[11] = RED; colour[13] = BLUE;
  return { ...L, name: 'random tree', colour };
}

function watchedRoot(): Layout {
  return { name: 'watched', look: directed(3, [[0, 1], [0, 2], [1, 0]]), xy: fit([[1, 0], [0, 1.2], [2, 1.2]]) };
}

interface Preset { id: string; label: string; make: () => Layout }
const PRESETS: Preset[] = [
  { id: 'rt', label: 'Myopic Col · random binary tree, 15 nodes', make: randomTree },
  { id: 'bt7', label: 'Myopic Col · full binary tree, 7 nodes = *', make: () => tree('((()())(()()))') },
  { id: 't34', label: 'Myopic Col · smallest −3/4 (5 nodes)', make: () => tree('(()(()()))', '01000') },
  { id: 't14', label: 'Myopic Col · smallest 1/4 (7 nodes)', make: () => tree('(((()(()()))))', '0201000') },
  { id: 'list', label: 'Myopic Col · list of 9 ending in blue = −1', make: () => list(10, [0, 0, 0, 0, 0, 0, 0, 0, 0, BLUE]) },
  { id: 'watch', label: 'Myopic Col · a root that is looked at: 0, not *', make: watchedRoot },
  { id: 'pet', label: 'Col · Petersen graph', make: petersen },
  { id: 'g34', label: 'Col · 4×3 grid', make: () => gridU(4, 3) },
  { id: 'c9', label: 'Col · cycle C9', make: () => cycleU(9) },
  { id: 'p8', label: 'Col · path P8', make: () => pathU(8) },
];

let board: Layout = PRESETS[0].make();
let colour: Colour[] = [];
let leftToMove = true;
let history: { colour: Colour[]; leftToMove: boolean; v: number }[] = [];
let you: 'blue' | 'red' | 'both' = 'blue';
let reply: Reply | null = null;
let requestId = 0;
let busy = false;
let worker = makeWorker();

function makeWorker(): Worker {
  const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (ev: MessageEvent<Reply>) => {
    if (ev.data.id !== requestId) return;
    busy = false;
    reply = ev.data;
    render();
    maybeCpu();
  };
  w.onerror = (ev) => {
    ev.preventDefault();
    busy = false;
    worker.terminate();
    worker = makeWorker();
    statusEl.textContent = `The position is too big to value here (${ev.message || 'worker error'}).`;
  };
  return w;
}

const SIDE = (left: boolean) => (left ? 'Blue' : 'Red');
const myopic = () => !isUndirected(board.look);

function newGame(): void {
  colour = board.colour ? board.colour.slice() : new Array<Colour>(board.look.length).fill(0);
  leftToMove = firstSel.value === 'blue';
  history = [];
  analyse();
}

function analyse(): void {
  requestId++;
  reply = null;
  if (busy) { worker.terminate(); worker = makeWorker(); }
  busy = true;
  const req: Request = { id: requestId, look: board.look, colour, leftToMove };
  worker.postMessage(req);
  render();
}

const yourTurn = () => you === 'both' || (you === 'blue') === leftToMove;
const gameOver = () => reply !== null && reply.moves.length === 0;

function play(v: number): void {
  if (!reply?.moves.some((m) => m.v === v)) return;
  history.push({ colour, leftToMove, v });
  colour = colour.slice();
  colour[v] = leftToMove ? BLUE : RED;
  leftToMove = !leftToMove;
  analyse();
}

function maybeCpu(): void {
  if (!reply || yourTurn() || gameOver()) return;
  const pool = reply.moves.some((m) => m.good) ? reply.moves.filter((m) => m.good) : reply.moves;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  const id = requestId;
  setTimeout(() => { if (id === requestId) play(pick.v); }, 550);
}

// ---- the board ---------------------------------------------------------------------

const W = 640;
const H = 440;
const PAD = 34;

function render(): void {
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const px = (v: number) => PAD + board.xy[v][0] * (W - 2 * PAD);
  const py = (v: number) => PAD + board.xy[v][1] * (H - 2 * PAD);
  const n = board.look.length;
  const r = Math.max(10, Math.min(18, 240 / Math.sqrt(n + 4)));
  const live = reply !== null && yourTurn() && !gameOver();
  const moveOf = new Map((reply?.moves ?? []).map((m) => [m.v, m]));
  const allow = reply?.allow;
  const sources = new Set(reply?.sources ?? []);
  const last = history.length ? history[history.length - 1].v : -1;
  let s = `<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="#8d919a"/></marker>` +
    `<marker id="ahd" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="#3e424a"/></marker></defs>`;
  for (let u = 0; u < n; u++) {
    for (const w of board.look[u]) {
      const both = board.look[w].includes(u);
      if (both && w < u) continue;
      // an arc still matters only while some colour is allowed at both ends
      const dead = !!allow && !(allow[u] & allow[w]);
      const [x1, y1, x2, y2] = [px(u), py(u), px(w), py(w)];
      const d = Math.hypot(x2 - x1, y2 - y1) || 1;
      const [ux, uy] = [(x2 - x1) / d, (y2 - y1) / d];
      const directedArc = myopic();
      const a = directedArc && both ? r + 2 : 0;
      const b = directedArc ? r + 2 : 0;
      const mk = dead ? 'ahd' : 'ah';
      s += `<line class="edge${dead ? ' dead' : ''}" x1="${x1 + ux * a}" y1="${y1 + uy * a}" x2="${x2 - ux * b}" y2="${y2 - uy * b}"` +
        `${directedArc ? ` marker-end="url(#${mk})"${both ? ` marker-start="url(#${mk})"` : ''}` : ''}/>`;
    }
  }
  for (let v = 0; v < n; v++) {
    const cls = ['vtx'];
    if (colour[v] === BLUE) cls.push('blue');
    else if (colour[v] === RED) cls.push('red');
    else if (allow) cls.push(allow[v] === 0 ? 'gone' : allow[v] === BLUE ? 'tb' : allow[v] === RED ? 'tr' : '');
    if (v === last) cls.push('lastmove');
    if (live && moveOf.has(v)) cls.push('movable');
    if (sources.has(v) && hintsBox.checked) s += `<circle class="src" cx="${px(v)}" cy="${py(v)}" r="${r + 6}"/>`;
    s += `<circle class="${cls.join(' ')}" cx="${px(v)}" cy="${py(v)}" r="${r}" data-v="${v}"/>`;
    const m = moveOf.get(v);
    if (live && m && hintsBox.checked) {
      s += `<text class="mark ${m.good ? 'win' : 'lose'}" x="${px(v)}" y="${py(v) + 4.5}" text-anchor="middle">${m.good ? '✓' : '✗'}</text>`;
    }
  }
  svg.innerHTML = s;
  renderStatus();
  renderValue();
}

// ---- side panel ---------------------------------------------------------------------

const OUTCOME_TEXT: Record<string, string> = {
  L: 'Blue wins, whoever moves first (G > 0)',
  R: 'Red wins, whoever moves first (G < 0)',
  P: 'the player to move loses (G = 0)',
  N: 'the player to move wins (G ‖ 0)',
};
const valueText = (v: string | null, size: number) => v ?? `<span class="dim">a canonical form with ${size > 80 ? 'over 80' : size} subgames</span>`;

function renderValue(): void {
  const box = $('value');
  if (!reply) {
    box.innerHTML = `<div class="big dim">…</div><p class="dim small">computing the value</p>`;
    $('groups').innerHTML = '';
    return;
  }
  const v = reply.value;
  const rule = myopic()
    ? `${reply.sources.length} free ${reply.sources.length === 1 ? 'source' : 'sources'} (ringed): each splits off as a lone *`
    : 'Col: every edge is looked at both ways';
  box.innerHTML =
    `<div class="big${v !== null && v.length > 26 ? ' long' : ''}">G = ${valueText(v, reply.size)}</div>` +
    `<p class="verdict">${OUTCOME_TEXT[reply.outcome]}</p>` +
    `<dl class="kv"><dt>game</dt><dd>${myopic() ? 'Myopic Col (look along arcs)' : 'Col (look at all neighbours)'}</dd>` +
    `<dt>cold</dt><dd class="${reply.cold ? '' : 'warn'}">${reply.cold ? 'yes: a number x or x + *' : 'no'}</dd>` +
    `<dt>split rule</dt><dd>${rule}</dd></dl>` +
    `<p class="dim small">${reply.states.toLocaleString('en')} components valued this session · ${reply.ms} ms</p>`;
  $('groups').innerHTML = reply.comps.length === 0
    ? `<p class="dim small">Nothing left to colour.</p>`
    : `<table>${reply.comps.map((c) =>
      `<tr><td class="shape">${c.ids.length} ${c.ids.length === 1 ? 'vertex' : 'vertices'}</td><td><div class="gv">${valueText(c.value, c.size)}</div>` +
      `<div class="dim small">${c.outcome}</div></td></tr>`).join('')}</table>`;
}

function renderStatus(): void {
  if (!reply) { statusEl.textContent = 'computing…'; return; }
  const who = SIDE(leftToMove);
  if (gameOver()) {
    const winner = SIDE(!leftToMove);
    const msg = you === 'both' ? `<strong>${winner} wins.</strong>`
      : !yourTurn() ? `<strong class="win-t">You win.</strong>` : `<strong class="lose-t">The computer wins.</strong>`;
    statusEl.innerHTML = `${who} cannot move. ${msg}`;
    return;
  }
  const wins = reply.moves.filter((m) => m.good).length;
  const verdict = wins
    ? `<strong class="win-t">${who} to move wins</strong> (${wins} of ${reply.moves.length} moves win)`
    : `<strong class="lose-t">${who} to move loses</strong> against best play (0 of ${reply.moves.length} moves win)`;
  const lead = yourTurn() ? `Your move (${who}): click a vertex to colour it` : `Computer (${who}) to move`;
  statusEl.innerHTML = `${lead} · ${verdict}`;
}

// ---- input --------------------------------------------------------------------------

svg.addEventListener('click', (ev) => {
  const el = (ev.target as Element).closest('[data-v]');
  if (!el || !reply || !yourTurn() || gameOver()) return;
  play(Number(el.getAttribute('data-v')));
});

for (const p of PRESETS) presetSel.add(new Option(p.label, p.id));
presetSel.addEventListener('change', () => {
  board = (PRESETS.find((x) => x.id === presetSel.value) ?? PRESETS[0]).make();
  newGame();
});
youSel.addEventListener('change', () => { you = youSel.value as typeof you; render(); maybeCpu(); });
firstSel.addEventListener('change', newGame);
hintsBox.addEventListener('change', render);
$('restart').addEventListener('click', newGame);
$('undo').addEventListener('click', () => {
  while (history.length) {
    const h = history.pop()!;
    colour = h.colour;
    leftToMove = h.leftToMove;
    if (yourTurn()) break;
  }
  analyse();
});

const params = new URLSearchParams(location.search);
const pre = PRESETS.find((x) => x.id === params.get('p')) ?? PRESETS[0];
presetSel.value = pre.id;
board = pre.make();
const y = params.get('you');
if (y === 'red' || y === 'both') { you = y; youSel.value = y; }
if (params.get('first') === 'red') firstSel.value = 'red';
if (params.get('hints') === '0') hintsBox.checked = false;
newGame();
