/** In-memory chat session store: clientSessionId → agentSessionId */
const sessions = new Map<string, string>();

export function getSession(id: string): string | undefined {
  return sessions.get(id);
}

export function setSession(id: string, agentSessionId: string): void {
  sessions.set(id, agentSessionId);
}

export function deleteSession(id: string): boolean {
  return sessions.delete(id);
}
