export interface PuzzleEdge {
  from: number;
  to: number;
  ratePpm: number;
  feeBps: number;
}

export interface PuzzleGraph {
  tokens: number;
  start: number;
  target: number;
  maxHops: number;
  startAmountAtomic: number;
  edges: PuzzleEdge[];
}

export interface Puzzle {
  puzzle: string;
  expiresAt: string;
  commitment: string;
  graph: PuzzleGraph;
  baseline: { path: number[] | null; score: number };
  rules: { entryAtomic: number; baselineOddsPct: number; winMultipliers: number[] };
}

export interface Route {
  path: number[];
  score: number;
}

export interface PlayResult {
  puzzle: string;
  commitment: string;
  secret?: string;
  paymentTx?: string;
  drawPpm?: number;
  won?: boolean;
  multiplier?: number | null;
  prizeAtomic?: number;
}

const DRAW_SCALE_PPM = 1_000_000n;

const hop = (amount: number, edge: PuzzleEdge) => {
  const converted = Math.floor((amount * edge.ratePpm) / 1_000_000);
  return converted - Math.floor((converted * edge.feeBps) / 10_000);
};

const edgeKey = (from: number, to: number) => `${from}>${to}`;

export function scoreRoute(graph: PuzzleGraph, path: number[]): number | null {
  if (path.length < 2 || path.length > graph.maxHops + 1 || path[0] !== graph.start || path[path.length - 1] !== graph.target) return null;
  const used = new Set<string>();
  let amount = graph.startAmountAtomic;
  for (let i = 1; i < path.length; i++) {
    const edge = graph.edges.find((e) => e.from === path[i - 1] && e.to === path[i]);
    const key = edgeKey(path[i - 1], path[i]);
    if (!edge || used.has(key)) return null;
    used.add(key);
    amount = hop(amount, edge);
  }
  return amount;
}

export function allRoutes(graph: PuzzleGraph): Route[] {
  const routes: Route[] = [];
  const walk = (path: number[], used: Set<string>, amount: number) => {
    const at = path[path.length - 1];
    if (at === graph.target && path.length > 1) routes.push({ path: [...path], score: amount });
    if (path.length > graph.maxHops) return;
    for (const edge of graph.edges) {
      const key = edgeKey(edge.from, edge.to);
      if (edge.from !== at || used.has(key)) continue;
      used.add(key);
      path.push(edge.to);
      walk(path, used, hop(amount, edge));
      path.pop();
      used.delete(key);
    }
  };
  walk([graph.start], new Set(), graph.startAmountAtomic);
  return routes.sort((a, b) => b.score - a.score || a.path.length - b.path.length);
}

export function baselineRoute(puzzle: Puzzle): Route {
  const { path, score } = puzzle.baseline;
  if (!path || scoreRoute(puzzle.graph, path) !== score) throw new Error(`puzzle ${puzzle.puzzle}: local scoring does not give the published baseline ${score}`);
  return { path, score };
}

export function chooseRoute(puzzle: Puzzle, choice: "best" | "baseline"): Route {
  const baseline = baselineRoute(puzzle);
  return choice === "best" ? (allRoutes(puzzle.graph)[0] ?? baseline) : baseline;
}

const sha256 = (text: string) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function drawHolds(commitment: string, result: PlayResult): Promise<boolean> {
  if (!result.secret || !result.paymentTx || result.drawPpm === undefined) return false;
  const digest = new DataView(await sha256(`${result.secret}:${result.paymentTx.toLowerCase()}`));
  const draw = Number(digest.getBigUint64(0) % DRAW_SCALE_PPM);
  return result.commitment === commitment && hex(await sha256(result.secret)) === commitment && draw === result.drawPpm;
}
