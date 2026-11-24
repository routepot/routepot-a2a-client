import { describe, expect, it } from "vitest";
import { allRoutes, chooseRoute, drawHolds, scoreRoute, type Puzzle } from "../src/game";
import drawn from "./drawn-play.json";

const graph = {
  tokens: 3,
  start: 0,
  target: 2,
  maxHops: 3,
  startAmountAtomic: 1_000_000,
  edges: [
    { from: 0, to: 1, ratePpm: 2_000_000, feeBps: 100 },
    { from: 1, to: 2, ratePpm: 600_000, feeBps: 0 },
    { from: 0, to: 2, ratePpm: 1_100_000, feeBps: 50 },
  ],
};
const puzzle: Puzzle = {
  puzzle: "p",
  expiresAt: "soon",
  commitment: "c",
  graph,
  baseline: { path: [0, 2], score: 1_094_500 },
  rules: { entryAtomic: 100_000, baselineOddsPct: 50, winMultipliers: [10, 5, 2] },
};

describe("routes", () => {
  it("scores a route hop by hop, rate first and fee after", () => {
    expect(scoreRoute(graph, [0, 1, 2])).toBe(1_188_000);
    expect(scoreRoute(graph, [0, 2])).toBe(1_094_500);
  });

  it("refuses a route that misses the start or target or uses an edge twice", () => {
    expect(scoreRoute(graph, [1, 2])).toBeNull();
    expect(scoreRoute(graph, [0, 1])).toBeNull();
    expect(scoreRoute({ ...graph, edges: [...graph.edges, { from: 2, to: 0, ratePpm: 1_000_000, feeBps: 0 }] }, [0, 2, 0, 2])).toBeNull();
  });

  it("ranks every route best first and plays the best unless asked for the baseline", () => {
    expect(allRoutes(graph).map((route) => route.path)).toEqual([[0, 1, 2], [0, 2]]);
    expect(chooseRoute(puzzle, "best")).toEqual({ path: [0, 1, 2], score: 1_188_000 });
    expect(chooseRoute(puzzle, "baseline")).toEqual({ path: [0, 2], score: 1_094_500 });
  });

  it("stops when its scoring disagrees with the published baseline", () => {
    expect(() => chooseRoute({ ...puzzle, baseline: { path: [0, 2], score: 1 } }, "best")).toThrow(/published baseline/);
  });
});

describe("the draw", () => {
  it("holds for a real drawn play: the secret hashes to the commitment and draws the reported number", async () => {
    expect(await drawHolds(drawn.commitment, drawn)).toBe(true);
  });

  it("fails when the commitment, the payment or the draw differ", async () => {
    expect(await drawHolds("0".repeat(64), drawn)).toBe(false);
    expect(await drawHolds(drawn.commitment, { ...drawn, paymentTx: `0x${"1".repeat(64)}` })).toBe(false);
    expect(await drawHolds(drawn.commitment, { ...drawn, drawPpm: (drawn.drawPpm + 1) % 1_000_000 })).toBe(false);
  });
});
