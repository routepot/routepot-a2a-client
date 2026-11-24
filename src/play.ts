import { parseArgs } from "node:util";
import { x402Client } from "@x402/core/client";
import { toClientEvmSigner } from "@x402/evm";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { formatUnits, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { agentCard, artifactOf, Conversation, textOf, X402_EXTENSION } from "./a2a";
import { chooseRoute, drawHolds, type PlayResult, type Puzzle } from "./game";
import { agentWallet, BASE_NETWORK, registeredOnChain, registration, registrationUrl } from "./identity";
import { onlyTheEntry } from "./payment";

const { values } = parseArgs({
  options: {
    url: { type: "string", default: "https://routepot.compose.land" },
    route: { type: "string", default: "best" },
    say: { type: "string", default: "Hi, I am an agent with a funded Base wallet. What is this game and how do I play it?" },
    rpc: { type: "string" },
    send: { type: "boolean" },
  },
});
if (values.route !== "best" && values.route !== "baseline") throw new Error("--route must be best or baseline");

const log = (step: string, event: Record<string, unknown>) => console.log(JSON.stringify({ step, ...event }, null, 2));
const stop = (step: string, reason: string): never => {
  log(step, { stopped: reason });
  process.exit(1);
};

const baseUrl = values.url!;
const card = await agentCard(baseUrl);
const found = await registration(baseUrl);
const payTo = agentWallet(found);
const identity = await registeredOnChain(found, registrationUrl(baseUrl), values.rpc);
const paysWithX402 = (card.capabilities?.extensions ?? []).some((extension) => extension.uri.startsWith(X402_EXTENSION));
log("discover", { agent: card.name, endpoint: card.url, protocol: card.protocolVersion, skills: card.skills.map((skill) => skill.id), paysWithX402, payTo, identity });
if (!paysWithX402) stop("discover", "the agent card does not offer the a2a-x402 extension");

const conversation = new Conversation(card.url);
const opening = await conversation.say(values.say!);
const puzzle = artifactOf<Puzzle>(opening) ?? stop("opening", "no puzzle came back");
log("opening", { contextId: conversation.contextId, reply: textOf(opening), puzzle: puzzle.puzzle, start: puzzle.graph.start, target: puzzle.graph.target, maxHops: puzzle.graph.maxHops });

const route = chooseRoute(puzzle, values.route as "best" | "baseline");
const practice = await conversation.ask({ skill: "practice", puzzle: puzzle.puzzle, path: route.path });
log("practice", { path: route.path, localScore: route.score, result: artifactOf(practice) });

const asked = await conversation.ask({ skill: "play", puzzle: puzzle.puzzle, path: route.path });
const required = asked.status.message?.metadata?.["x402.payment.required"];
const accepted = required ? onlyTheEntry(payTo, puzzle.rules.entryAtomic)(required.x402Version, required.accepts) : [];
log("challenge", { state: asked.status.state, taskId: asked.id, accepts: required?.accepts, onlyTheEntryToTheAgentWallet: accepted.length > 0 });
if (asked.status.state !== "input-required" || accepted.length === 0) {
  stop("challenge", `the play did not ask for exactly ${formatUnits(BigInt(puzzle.rules.entryAtomic), 6)} USDC to the registered agent wallet`);
}
if (!values.send) {
  log("dry run", { stopped: "nothing was signed or paid: run again with --send and PRIVATE_KEY set to pay the entry from your own wallet" });
  process.exit(0);
}

const key = process.env.PRIVATE_KEY ?? stop("pay", "set PRIVATE_KEY to the key of the wallet that pays the entry");
const account = privateKeyToAccount(key as Hex);
const client = new x402Client().register(BASE_NETWORK, new ExactEvmScheme(toClientEvmSigner(account))).registerPolicy(onlyTheEntry(payTo, puzzle.rules.entryAtomic));
const payload = await client.createPaymentPayload(required);
const paid = await conversation.send([{ kind: "text", text: "Here is the signed payment." }], {
  taskId: asked.id,
  metadata: { "x402.payment.status": "payment-submitted", "x402.payment.payload": payload },
});
const result = artifactOf<PlayResult>(paid);
const receipts = paid.status.message?.metadata?.["x402.payment.receipts"];
const verified = result ? await drawHolds(puzzle.commitment, result) : false;
log("paid", {
  state: paid.status.state,
  wallet: account.address,
  transaction: receipts?.[0]?.transaction,
  won: result?.won,
  multiplier: result?.multiplier,
  prize: result?.prizeAtomic === undefined ? undefined : formatUnits(BigInt(result.prizeAtomic), 6),
  drawPpm: result?.drawPpm,
  drawVerified: verified,
});
if (paid.status.state !== "completed" || !verified) process.exit(1);
