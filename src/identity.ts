import { createPublicClient, http, parseAbi, type Address } from "viem";
import { base } from "viem/chains";

export const BASE_NETWORK = "eip155:8453";
export const BASE_USDC: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

export interface Registration {
  name: string;
  services: { name: string; endpoint: string }[];
  registrations: { agentId: number; agentRegistry: string }[];
}

const TOKEN_URI_ABI = parseAbi(["function tokenURI(uint256 agentId) view returns (string)"]);

export const registrationUrl = (baseUrl: string) => new URL("/.well-known/agent-registration.json", baseUrl).toString();

export async function registration(baseUrl: string): Promise<Registration> {
  const response = await fetch(registrationUrl(baseUrl));
  if (!response.ok) throw new Error(`registration file answered ${response.status}`);
  return (await response.json()) as Registration;
}

export function agentWallet(found: Registration): Address {
  const endpoint = found.services.find((service) => service.name === "agentWallet")?.endpoint ?? "";
  const [namespace, chain, address] = endpoint.split(":");
  if (`${namespace}:${chain}` !== BASE_NETWORK || !/^0x[0-9a-fA-F]{40}$/.test(address ?? "")) throw new Error(`no agent wallet on Base in the registration: ${endpoint}`);
  return address as Address;
}

export async function registeredOnChain(found: Registration, expectedUrl: string, rpcUrl?: string): Promise<{ agentId: number; tokenURI: string }> {
  const onBase = found.registrations.find((entry) => entry.agentRegistry.startsWith(`${BASE_NETWORK}:`));
  if (!onBase) throw new Error("the registration names no identity registry on Base");
  const registry = onBase.agentRegistry.slice(BASE_NETWORK.length + 1) as Address;
  const client = createPublicClient({ chain: base, transport: http(rpcUrl) });
  const tokenURI = await client.readContract({ address: registry, abi: TOKEN_URI_ABI, functionName: "tokenURI", args: [BigInt(onBase.agentId)] });
  if (tokenURI !== expectedUrl) throw new Error(`agent ${onBase.agentId} points on chain to ${tokenURI}, not ${expectedUrl}`);
  return { agentId: onBase.agentId, tokenURI };
}
