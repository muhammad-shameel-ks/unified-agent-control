import { invoke } from "@tauri-apps/api/core";

export type AgentId = "OpenCode" | "ClaudeCode" | "AGY";

export interface McpServerPayload {
  name: string;
  type: string;
  url?: string;
  command?: string[];
  env?: any;
  headers?: any;
  enabled?: boolean;
}

const TOGGLE_COMMAND: Record<AgentId, string> = {
  OpenCode: "toggle_mcp_server",
  ClaudeCode: "toggle_claudecode_mcp_server",
  AGY: "toggle_agy_mcp_server",
};

const DEFAULT_SOURCE_FILE: Record<AgentId, string> = {
  OpenCode: "opencode.json",
  ClaudeCode: "mcpServers",
  AGY: "mcp_config.json",
};

function buildPayload(srv: McpServerPayload, fallbackEnabled = true) {
  return {
    name: srv.name,
    type: srv.type,
    url: srv.url,
    command: srv.command,
    env: srv.env,
    headers: srv.headers,
    enabled: srv.enabled ?? fallbackEnabled,
  };
}

export async function toggleAgentRegistration(
  srv: McpServerPayload,
  agentId: AgentId,
  register: boolean
): Promise<void> {
  try {
    await invoke("register_mcp_on_agent", {
      agentId,
      payload: buildPayload(srv, true),
      register,
    });
  } catch (err) {
    console.error(`Failed to update registration on ${agentId}:`, err);
    throw err;
  }
}

export async function toggleMcpState(
  srv: McpServerPayload,
  agentId: AgentId,
  enabled: boolean,
  sourceFile?: string
): Promise<void> {
  try {
    await invoke(TOGGLE_COMMAND[agentId], {
      name: srv.name,
      sourceFile: sourceFile ?? DEFAULT_SOURCE_FILE[agentId],
      enabled,
    });
  } catch (err) {
    console.error(`Failed to toggle MCP state on ${agentId}:`, err);
    throw err;
  }
}

export async function registerMcpOnAllAgents(
  srv: McpServerPayload,
  sourceAgent: string,
  register: boolean
): Promise<void> {
  const agents: AgentId[] = ["OpenCode", "ClaudeCode", "AGY"];
  const targets = agents.filter((a) => a !== sourceAgent);
  await Promise.all(
    targets.map((agent) => toggleAgentRegistration(srv, agent, register))
  );
}
