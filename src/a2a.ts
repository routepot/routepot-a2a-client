export type Part = { kind: "text"; text: string } | { kind: "data"; data: Record<string, unknown> };

export interface Task {
  id: string;
  contextId: string;
  status: { state: string; message?: { parts?: Part[]; metadata?: Record<string, any> } };
  artifacts?: { parts: Part[] }[];
}

export interface AgentCard {
  name: string;
  url: string;
  protocolVersion: string;
  skills: { id: string; name: string }[];
  capabilities?: { extensions?: { uri: string }[] };
}

export const X402_EXTENSION = "https://github.com/google-agentic-commerce/a2a-x402";

export async function agentCard(baseUrl: string): Promise<AgentCard> {
  const response = await fetch(new URL("/.well-known/agent-card.json", baseUrl));
  if (!response.ok) throw new Error(`agent card answered ${response.status}`);
  return (await response.json()) as AgentCard;
}

export const textOf = (task: Task): string =>
  (task.status.message?.parts ?? []).flatMap((part) => (part.kind === "text" ? [part.text] : [])).join("\n");

export const artifactOf = <T>(task: Task): T | undefined => {
  const part = task.artifacts?.[0]?.parts?.[0];
  return part?.kind === "data" ? (part.data as T) : undefined;
};

export class Conversation {
  private nextId = 0;
  contextId: string | undefined;

  constructor(private readonly endpoint: string) {}

  async send(parts: Part[], extra: { taskId?: string; metadata?: Record<string, unknown> } = {}): Promise<Task> {
    const message = { kind: "message", role: "user", messageId: crypto.randomUUID(), contextId: this.contextId, parts, ...extra };
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++this.nextId, method: "message/send", params: { message } }),
    });
    const answer = (await response.json()) as { result?: Task; error?: unknown };
    if (!response.ok || !answer.result) throw new Error(`message/send answered ${response.status}: ${JSON.stringify(answer.error ?? answer)}`);
    this.contextId = answer.result.contextId;
    return answer.result;
  }

  say = (text: string) => this.send([{ kind: "text", text }]);
  ask = (data: Record<string, unknown>) => this.send([{ kind: "data", data }]);
}
