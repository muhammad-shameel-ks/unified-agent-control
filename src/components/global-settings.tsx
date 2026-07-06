"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
  Cpu, 
  Settings, 
  Plus, 
  Trash2, 
  Sparkles,
  Info,
  X,
  RefreshCw,
  Sliders,
  BookOpen
} from "lucide-react";
import { Button } from "@/components/motion/button/base";
import { MorphingModal } from "@/components/motion/morphing-modal";
import { Checkbox } from "@/components/motion/checkbox";
import { invoke } from "@tauri-apps/api/core";
import { Loader } from "@/components/motion/loader";
import {
  toggleAgentRegistration as sharedToggleAgentRegistration,
  toggleMcpState as sharedToggleMcpState,
  type AgentId,
} from "@/lib/mcpActions";

interface McpServerAggregated {
  name: string;
  type: string;
  url?: string;
  command?: string[];
  env?: any;
  headers?: any;
  inOpenCode: boolean;
  opencodeEnabled: boolean;
  inClaudeCode: boolean;
  claudecodeEnabled: boolean;
  inAgy: boolean;
  agyEnabled: boolean;
}

export function GlobalSettings() {
  const [activeSubTab, setActiveSubTab] = useState<"mcp" | "skills" | "rules">("mcp");
  const [opencodeConfig, setOpencodeConfig] = useState<any>(null);
  const [claudecodeConfig, setClaudecodeConfig] = useState<any>(null);
  const [agyConfig, setAgyConfig] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // New MCP Server Form state
  const [newMcpName, setNewMcpName] = useState("");
  const [newMcpCommand, setNewMcpCommand] = useState("");
  const [newMcpArgs, setNewMcpArgs] = useState("");
  const [newMcpEnv, setNewMcpEnv] = useState("");
  const [isAddingMcp, setIsAddingMcp] = useState(false);

  // Global Rules state
  const [globalRules, setGlobalRules] = useState(
    "# Unified Agent System Rules\n\n- Standard package manager is `pnpm` in JS/TS workspaces.\n- Do not run unverified code or commands without user confirmation.\n- Always preserve existing comments and documentation."
  );

  const fetchConfigs = (silent = false) => {
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);
    Promise.all([
      invoke<any>("get_opencode_config").catch(() => null),
      invoke<any>("get_claudecode_config").catch(() => null),
      invoke<any>("get_agy_config").catch(() => null),
    ]).then(([openVal, claudeVal, agyVal]) => {
      setOpencodeConfig(openVal);
      setClaudecodeConfig(claudeVal);
      setAgyConfig(agyVal);
      setIsLoading(false);
      setIsRefreshing(false);
    });
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  const aggregatedMcp = useMemo<McpServerAggregated[]>(() => {
    const servers: Record<string, McpServerAggregated> = {};

    if (opencodeConfig?.mcpServers) {
      opencodeConfig.mcpServers.forEach((s: any) => {
        servers[s.name] = {
          name: s.name,
          type: s.type || "command",
          url: s.url,
          command: s.command,
          env: s.env,
          headers: s.headers,
          inOpenCode: true,
          opencodeEnabled: s.enabled,
          inClaudeCode: false,
          claudecodeEnabled: false,
          inAgy: false,
          agyEnabled: false,
        };
      });
    }

    if (claudecodeConfig?.mcpServers) {
      claudecodeConfig.mcpServers.forEach((s: any) => {
        const existing = servers[s.name];
        if (existing) {
          existing.inClaudeCode = true;
          existing.claudecodeEnabled = s.enabled;
          if (!existing.command && s.command) {
            existing.command = s.command;
          }
          if (!existing.env && s.env) {
            existing.env = s.env;
          }
          if (!existing.headers && s.headers) {
            existing.headers = s.headers;
          }
        } else {
          servers[s.name] = {
            name: s.name,
            type: s.type || "command",
            url: s.url,
            command: s.command,
            env: s.env,
            headers: s.headers,
            inOpenCode: false,
            opencodeEnabled: false,
            inClaudeCode: true,
            claudecodeEnabled: s.enabled,
            inAgy: false,
            agyEnabled: false,
          };
        }
      });
    }

    if (agyConfig?.mcpServers) {
      agyConfig.mcpServers.forEach((s: any) => {
        const existing = servers[s.name];
        if (existing) {
          existing.inAgy = true;
          existing.agyEnabled = s.enabled;
          if (!existing.command && s.command) {
            existing.command = s.command;
          }
          if (!existing.env && s.env) {
            existing.env = s.env;
          }
          if (!existing.headers && s.headers) {
            existing.headers = s.headers;
          }
        } else {
          servers[s.name] = {
            name: s.name,
            type: s.type || "command",
            url: s.url,
            command: s.command,
            env: s.env,
            headers: s.headers,
            inOpenCode: false,
            opencodeEnabled: false,
            inClaudeCode: false,
            claudecodeEnabled: false,
            inAgy: true,
            agyEnabled: s.enabled,
          };
        }
      });
    }

    return Object.values(servers).sort((a, b) => a.name.localeCompare(b.name));
  }, [opencodeConfig, claudecodeConfig, agyConfig]);

  const handleToggleAgentRegistration = async (
    srv: McpServerAggregated,
    agentId: AgentId,
    register: boolean
  ) => {
    try {
      await sharedToggleAgentRegistration(srv, agentId, register);
      fetchConfigs(true);
    } catch {}
  };

  const handleToggleMcpState = async (
    srv: McpServerAggregated,
    agentId: AgentId,
    enabled: boolean
  ) => {
    try {
      await sharedToggleMcpState(
        srv,
        agentId,
        enabled,
        agentId === "OpenCode"
          ? opencodeConfig?.mcpServers.find((s: any) => s.name === srv.name)?.sourceFile
          : undefined
      );
      fetchConfigs(true);
    } catch {}
  };

  const handleRegisterNewMcp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMcpName.trim() || !newMcpCommand.trim()) return;

    let envObj: Record<string, string> = {};
    if (newMcpEnv.trim()) {
      newMcpEnv.split(",").forEach((pair) => {
        const parts = pair.split("=");
        if (parts.length === 2) {
          envObj[parts[0].trim()] = parts[1].trim();
        }
      });
    }

    const cmdArr = [newMcpCommand.trim()];
    if (newMcpArgs.trim()) {
      newMcpArgs.split(" ").forEach((arg) => {
        if (arg.trim()) cmdArr.push(arg.trim());
      });
    }

    const payload = {
      name: newMcpName.trim(),
      type: "command",
      command: cmdArr,
      env: envObj,
      enabled: true,
    };

    Promise.all([
      invoke("register_mcp_on_agent", { agentId: "OpenCode", payload, register: true }).catch(() => null),
      invoke("register_mcp_on_agent", { agentId: "ClaudeCode", payload, register: true }).catch(() => null),
      invoke("register_mcp_on_agent", { agentId: "AGY", payload, register: true }).catch(() => null),
    ])
      .then(() => {
        setNewMcpName("");
        setNewMcpCommand("");
        setNewMcpArgs("");
        setNewMcpEnv("");
        setIsAddingMcp(false);
        fetchConfigs(true);
      })
      .catch((err) => {
        console.error("Failed to register new MCP server:", err);
      });
  };

  const handleDeleteMcp = (name: string) => {
    Promise.all([
      invoke("register_mcp_on_agent", { agentId: "OpenCode", payload: { name, enabled: false }, register: false }).catch(() => null),
      invoke("register_mcp_on_agent", { agentId: "ClaudeCode", payload: { name, enabled: false }, register: false }).catch(() => null),
      invoke("register_mcp_on_agent", { agentId: "AGY", payload: { name, enabled: false }, register: false }).catch(() => null),
    ]).then(() => {
      fetchConfigs(true);
    });
  };

  return (
    <div className="flex-1 w-full p-6 flex flex-col gap-6 overflow-y-auto">
      {/* Title section */}
      <div className="flex items-center justify-between">
        <div className="text-left">
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Settings className="h-6 w-6 text-primary" />
            Global agent settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure shared environments, Model Context Protocol (MCP) servers, and skillsets applied globally across all agents.
          </p>
        </div>
        <button
          onClick={() => fetchConfigs()}
          title="Refresh configurations"
          className="p-2 rounded-xl border border-border hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading || isRefreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Subtab selection row */}
      <div className="flex border-b border-border/60">
        <button
          onClick={() => setActiveSubTab("mcp")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-[2px] transition-all flex items-center gap-2 ${
            activeSubTab === "mcp"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Cpu className="h-4 w-4" />
          MCP Servers
        </button>
        <button
          onClick={() => setActiveSubTab("skills")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-[2px] transition-all flex items-center gap-2 ${
            activeSubTab === "skills"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Sliders className="h-4 w-4" />
          Unified Skills
        </button>
        <button
          onClick={() => setActiveSubTab("rules")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-[2px] transition-all flex items-center gap-2 ${
            activeSubTab === "rules"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <BookOpen className="h-4 w-4" />
          Global Agent Rules
        </button>
      </div>

      {/* Content wrapper */}
      <div className="flex-1 min-h-0">
        {activeSubTab === "mcp" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">Unified MCP Manager</h2>
              <Button 
                onClick={() => setIsAddingMcp(true)}
                variant="primary" 
                size="sm" 
                className="rounded-xl gap-1.5"
              >
                <Plus className="h-4 w-4" />
                Register New Server
              </Button>
            </div>

            {isLoading ? (
              <div className="flex flex-col justify-center items-center py-20 gap-3">
                <Loader variant="helix" size={36} className="text-primary" />
                <span className="text-sm text-muted-foreground font-medium">Syncing agent configurations...</span>
              </div>
            ) : aggregatedMcp.length > 0 ? (
              <div className="grid grid-cols-1 gap-3.5">
                {aggregatedMcp.map((server) => (
                  <div 
                    key={server.name} 
                    className="flex flex-col p-4.5 rounded-2xl border border-border/80 bg-background/50 hover:border-primary/25 transition-all duration-200 gap-4 text-left"
                  >
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-foreground text-sm">{server.name}</h4>
                          <span className="text-[9px] font-mono font-bold bg-secondary px-1.5 py-0.5 rounded text-muted-foreground uppercase">
                            {server.type}
                          </span>
                        </div>
                        {server.type === "remote" ? (
                          <div className="text-[11px] font-mono text-muted-foreground break-all bg-secondary/10 p-2 rounded-xl border border-border/10 mt-2 max-w-2xl select-all">
                            URL: <span className="text-primary font-medium">{server.url}</span>
                          </div>
                        ) : (
                          <div className="text-[11px] font-mono text-muted-foreground break-all bg-secondary/10 p-2 rounded-xl border border-border/10 mt-2 max-w-2xl select-all">
                            Command: <span className="text-foreground">{server.command?.join(" ")}</span>
                          </div>
                        )}
                        {server.env && Object.keys(server.env).length > 0 && (
                          <div className="text-[10px] text-muted-foreground font-mono mt-2 bg-secondary/20 px-2 py-1 rounded-lg border border-border/15 max-w-xs break-all">
                            Env: {JSON.stringify(server.env)}
                          </div>
                        )}
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteMcp(server.name)}
                        className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/5 self-start"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Agent Distribution Control Matrix */}
                    <div className="border-t border-border/30 pt-3 mt-1 grid grid-cols-3 gap-4">
                      {/* OpenCode Column */}
                      <div className="flex flex-col gap-2 p-2.5 rounded-xl bg-secondary/25 border border-border/20">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-foreground/80">OpenCode</span>
                          <Checkbox
                            checked={server.inOpenCode}
                            onCheckedChange={(checked) => handleToggleAgentRegistration(server, "OpenCode", checked)}
                          />
                        </div>
                        {server.inOpenCode && (
                          <div className="flex items-center justify-between text-[10px] border-t border-border/10 pt-1.5 mt-0.5">
                            <span className="text-muted-foreground">Active state</span>
                            <Checkbox
                              checked={server.opencodeEnabled}
                              onCheckedChange={(checked) => handleToggleMcpState(server, "OpenCode", checked)}
                            />
                          </div>
                        )}
                      </div>

                      {/* Claude Code Column */}
                      <div className="flex flex-col gap-2 p-2.5 rounded-xl bg-secondary/25 border border-border/20">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-foreground/80">Claude Code</span>
                          <Checkbox
                            checked={server.inClaudeCode}
                            onCheckedChange={(checked) => handleToggleAgentRegistration(server, "ClaudeCode", checked)}
                          />
                        </div>
                        {server.inClaudeCode && (
                          <div className="flex items-center justify-between text-[10px] border-t border-border/10 pt-1.5 mt-0.5">
                            <span className="text-muted-foreground">Active state</span>
                            <Checkbox
                              checked={server.claudecodeEnabled}
                              onCheckedChange={(checked) => handleToggleMcpState(server, "ClaudeCode", checked)}
                            />
                          </div>
                        )}
                      </div>

                      {/* AGY Column */}
                      <div className="flex flex-col gap-2 p-2.5 rounded-xl bg-secondary/25 border border-border/20">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-foreground/80">Antigravity</span>
                          <Checkbox
                            checked={server.inAgy}
                            onCheckedChange={(checked) => handleToggleAgentRegistration(server, "AGY", checked)}
                          />
                        </div>
                        {server.inAgy && (
                          <div className="flex items-center justify-between text-[10px] border-t border-border/10 pt-1.5 mt-0.5">
                            <span className="text-muted-foreground">Active state</span>
                            <Checkbox
                              checked={server.agyEnabled}
                              onCheckedChange={(checked) => handleToggleMcpState(server, "AGY", checked)}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic text-center py-10 border border-dashed border-border rounded-xl">
                No MCP servers registered globally. Click Register Server to start.
              </p>
            )}

            {/* Register MCP Server Modal */}
            <MorphingModal
              viewId={isAddingMcp ? "register-mcp" : null}
              onClose={() => setIsAddingMcp(false)}
              placement="center"
              className="max-w-md"
            >
              <div className="flex items-center justify-between pb-4 border-b border-border/60">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Register MCP Server
                </h3>
                <button
                  type="button"
                  onClick={() => setIsAddingMcp(false)}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleRegisterNewMcp} className="space-y-4 pt-4 text-left">
                <div className="space-y-1.5">
                  <label htmlFor="mcp-name" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Server Name
                  </label>
                  <input
                    id="mcp-name"
                    type="text"
                    required
                    placeholder="e.g. postgres-mcp"
                    value={newMcpName}
                    onChange={(e) => setNewMcpName(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1 space-y-1.5">
                    <label htmlFor="mcp-cmd" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Command
                    </label>
                    <input
                      id="mcp-cmd"
                      type="text"
                      required
                      placeholder="e.g. npx"
                      value={newMcpCommand}
                      onChange={(e) => setNewMcpCommand(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label htmlFor="mcp-args" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Arguments
                    </label>
                    <input
                      id="mcp-args"
                      type="text"
                      placeholder="e.g. -y @modelcontextprotocol/server-postgres postgresql://..."
                      value={newMcpArgs}
                      onChange={(e) => setNewMcpArgs(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="mcp-env" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Environment Variables (comma separated KEY=VAL)
                  </label>
                  <input
                    id="mcp-env"
                    type="text"
                    placeholder="e.g. API_KEY=abc, DB_PATH=/tmp"
                    value={newMcpEnv}
                    onChange={(e) => setNewMcpEnv(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/40 mt-6">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsAddingMcp(false)}
                    className="rounded-lg h-9 px-4"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    className="rounded-lg h-9 px-4"
                  >
                    Register
                  </Button>
                </div>
              </form>
            </MorphingModal>
          </div>
        )}

        {activeSubTab === "skills" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-secondary/50 border border-border/40 rounded-xl">
              <Info className="h-4 w-4 text-primary shrink-0" />
              <p className="text-xs text-muted-foreground text-left leading-relaxed">
                Enabling a skillset injects the corresponding functions, MCP schemas, and tools directly into the execution prompt payload for all agents.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3.5 text-left">
              {/* Skill 1: File Editor */}
              <div className="flex items-start justify-between p-4 rounded-xl border border-border bg-background/50">
                <div className="space-y-1 max-w-[80%]">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-foreground text-sm">Precise File Modification</h4>
                    <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded font-mono">
                      FileSystem
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                    Equips agents with line-range diff tools to safely modify codebases without overwriting whole files.
                  </p>
                </div>
                <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-lg">
                  Always Active
                </span>
              </div>

              {/* Skill 2: Web Search */}
              <div className="flex items-start justify-between p-4 rounded-xl border border-border bg-background/50">
                <div className="space-y-1 max-w-[80%]">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-foreground text-sm">Web Search Retrieval</h4>
                    <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded font-mono">
                      Network
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                    Allows agents to query search engines to retrieve up-to-date public information.
                  </p>
                </div>
                <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-lg">
                  Always Active
                </span>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === "rules" && (
          <div className="space-y-4 h-full flex flex-col text-left">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">Global Agent Rules</h2>
              <span className="text-xs text-muted-foreground">Configured in global configurations</span>
            </div>

            <div className="flex-1 flex flex-col min-h-[300px]">
              <textarea
                value={globalRules}
                onChange={(e) => setGlobalRules(e.target.value)}
                className="flex-1 w-full p-4 font-mono text-xs rounded-xl border border-border bg-background/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none leading-relaxed"
                placeholder="# Global Rules..."
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
