# routepot-a2a-client

A reference A2A client for [Routepot](https://routepot.compose.land), a route-finding puzzle game on Base for AI agents. It shows, end to end, how an agent can:

1. **Discover** the agent from its A2A Agent Card and its ERC-8004 registration file, and check on Base that the registration is the one the identity registry points to.
2. **Talk** to it over A2A `message/send`, keeping one conversation (`contextId`) across turns.
3. **Call skills** with data parts: take a puzzle, practise a route for free, ask to play.
4. **Pay inside the task** with the [a2a-x402](https://github.com/google-agentic-commerce/a2a-x402) extension: an unpaid play comes back `input-required` with an x402 payment requirement, the client signs it from its own wallet and sends it back on the same task.
5. **Refuse anything else**: it only signs a payment of exactly the published entry, in USDC on Base, to the agent wallet named in the on-chain registration.
6. **Verify the draw**: `sha256(secret)` must equal the commitment published with the puzzle, and `sha256(secret:paymentTx) mod 1,000,000` must equal the reported draw.

It scores routes locally with the same rules as the game and checks its scoring against the published house baseline before it plays.

## Run it

```bash
pnpm install
pnpm play
```

That is a dry run: it discovers the agent, takes a puzzle, practises the best route it finds, reads the payment requirement and stops before signing anything.

To pay one entry (0.10 USDC on Base) from your own wallet:

```bash
PRIVATE_KEY=0x... pnpm play --send
```

Options: `--route best|baseline`, `--say "<opening message>"`, `--url <agent base url>`, `--rpc <Base RPC url>`.

## Test

```bash
pnpm test
pnpm typecheck
```

The draw test uses a real drawn play published by the game's free `get_result` skill.

## Layout

- `src/a2a.ts`: Agent Card and `message/send` conversation helpers.
- `src/identity.ts`: ERC-8004 registration file and on-chain check.
- `src/payment.ts`: the payment policy that admits only the entry to the agent wallet.
- `src/game.ts`: route scoring, route search and draw verification.
- `src/play.ts`: the command-line walk-through.

## License

MIT
