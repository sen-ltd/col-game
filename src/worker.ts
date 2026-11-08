// Web Worker: the value of the position, of each component it falls into, and
// whether each move for the player to move keeps the win. One Valuer is kept for
// the session, so replies get faster as you play.
import { type GameId, name, outcome, formSize, ge, le, ZERO, type Outcome } from './cgt.ts';
import { Valuer, fromColouring, components, legal, play, isCold, freeSources, BLUE, RED, type Board, type Colour } from './col.ts';

export interface Request {
  id: number;
  look: Board;
  colour: Colour[];
  leftToMove: boolean;
}

export interface Reply {
  id: number;
  /** null when the canonical form is too big to print */
  value: string | null;
  size: number;
  outcome: Outcome;
  cold: boolean;
  /** board vertex → colours still allowed (0 coloured or dead, 1 blue only, 2 red only, 3 both) */
  allow: number[];
  /** board vertices that split off as a lone * (nobody looks at them, they see only uncoloured vertices) */
  sources: number[];
  comps: { ids: number[]; value: string | null; size: number; outcome: Outcome }[];
  /** every legal move for the player to move; `good` keeps the win */
  moves: { v: number; good: boolean; after: string | null }[];
  states: number;
  ms: number;
}

const val = new Valuer();
const PRINT_LIMIT = 80;

function printable(g: GameId): { value: string | null; size: number } {
  const size = formSize(g, PRINT_LIMIT);
  return { value: size <= PRINT_LIMIT ? name(g) : null, size };
}

self.onmessage = (ev: MessageEvent<Request>) => {
  const { id, look, colour, leftToMove } = ev.data;
  const t0 = performance.now();
  const p = fromColouring(look, colour);
  const g = val.value(p);
  const allow = new Array<number>(look.length).fill(0);
  p.ids.forEach((v, i) => { allow[v] = p.allow[i]; });
  const comps = components(p).map((c) => {
    const cg = val.component(c);
    return { ids: c.ids, ...printable(cg), outcome: outcome(cg) };
  });
  const side: Colour = leftToMove ? BLUE : RED;
  const moves: Reply['moves'] = [];
  for (let i = 0; i < p.ids.length; i++) {
    if (!legal(p, i, side)) continue;
    const after = val.value(play(p, i, side));
    // after the move the opponent moves first: we win if they then lose
    const good = leftToMove ? ge(after, ZERO) : le(after, ZERO);
    moves.push({ v: p.ids[i], good, after: printable(after).value });
  }
  const reply: Reply = {
    id, ...printable(g), outcome: outcome(g), cold: isCold(g), allow,
    sources: freeSources(p).map((i) => p.ids[i]), comps, moves,
    states: val.size, ms: Math.round(performance.now() - t0),
  };
  (self as unknown as Worker).postMessage(reply);
};
