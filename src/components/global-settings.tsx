import { useState } from "react";
import { 
  Cpu, 
  Settings, 
  Plus, 
  Trash2, 
  ToggleLeft, 
  ToggleRight, 
  BookOpen, 
  Sliders,
  Play,
  Square,
  Sparkles,
  Info,
  X
} from "lucide-react";
import { Button } from "@/components/motion/button/base";
import { MorphingModal } from "@/components/motion/morphing-modal";

interface McpServer {
  id: string;
  name: string;
  status: "Running" | "Stopped";
  command: string;
  args: string;
  env: string;
}

interface Skill {
  id: string;
  name: string;
  description: string;
  category: "FileSystem" | "Network" | "Database" | "Utility";
  enabled: boolean;
}

export function GlobalSettings() {
  const [activeSubTab, setActiveSubTab] = useState<"mcp" | "skills" | "rules">("mcp");

  // Mock MCP Server State
  const [mcpServers, setMcpServers] = useState<McpServer[]>([
    {
      id: "1",
      name: "sqlite-mcp-server",
      status: "Running",
      command: "npx",
      args: "-y @modelcontextprotocol/server-sqlite --db /tmp/agents.db",
      env: "DB_PATH=/tmp/agents.db",
    },
    {
      id: "2",
      name: "google-search-mcp",
      status: "Running",
      command: "npx",
      args: "-y @modelcontextprotocol/server-google-search",
      env: "API_KEY=••••••••••••••••",
    },
    {
      id: "3",
      name: "postgres-mcp",
      status: "Stopped",
      command: "npx",
      args: "-y @modelcontextprotocol/server-postgres postgresql://localhost:5432/dev",
      env: "PGUSER=postgres",
    },
  ]);

  // Mock Skills State
  const [skills, setSkills] = useState<Skill[]>([
    {
      id: "web-search",
      name: "Search the Web",
      description: "Allows agents to query search engines to retrieve up-to-date public information.",
      category: "Network",
      enabled: true,
    },
    {
      id: "file-edit",
      name: "Precise File Modification",
      description: "Equips agents with line-range diff tools to safely modify codebases without overwriting whole files.",
      category: "FileSystem",
      enabled: true,
    },
    {
      id: "sql-execution",
      name: "Database Query Execution",
      description: "Grants read/write capabilities to attached data stores under developer guidance.",
      category: "Database",
      enabled: false,
    },
    {
      id: "schedule-timers",
      name: "Cron & Alarm Scheduling",
      description: "Allows setting up background reminders, recurrence routines, and asynchronous callback jobs.",
      category: "Utility",
      enabled: true,
    },
  ]);

  // Global Rules State
  const [globalRules, setGlobalRules] = useState(
    "# Global Agent Behavior Rules\n\n- Do not run untrusted binaries or curl scripts without confirmation.\n- Standard package manager is `pnpm` in JS/TS workspaces.\n- Preserve existing code comments and header structures.\n- Prefer small, incremental Git commits on major edits."
  );

  // New MCP Server Form state
  const [newMcpName, setNewMcpName] = useState("");
  const [newMcpCommand, setNewMcpCommand] = useState("");
  const [newMcpArgs, setNewMcpArgs] = useState("");
  const [newMcpEnv, setNewMcpEnv] = useState("");
  const [isAddingMcp, setIsAddingMcp] = useState(false);

  // Actions
  const handleToggleMcpStatus = (id: string) => {
    setMcpServers(prev =>
      prev.map(s => {
        if (s.id === id) {
          return { ...s, status: s.status === "Running" ? "Stopped" : "Running" };
        }
        return s;
      })
    );
  };

  const handleDeleteMcp = (id: string) => {
    setMcpServers(prev => prev.filter(s => s.id !== id));
  };

  const handleAddMcp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMcpName.trim() || !newMcpCommand.trim()) return;

    const newMcp: McpServer = {
      id: Date.now().toString(),
      name: newMcpName,
      status: "Running",
      command: newMcpCommand,
      args: newMcpArgs,
      env: newMcpEnv,
    };

    setMcpServers(prev => [...prev, newMcp]);
    setNewMcpName("");
    setNewMcpCommand("");
    setNewMcpArgs("");
    setNewMcpEnv("");
    setIsAddingMcp(false);
  };

  const handleToggleSkill = (id: string) => {
    setSkills(prev =>
      prev.map(sk => {
        if (sk.id === id) {
          return { ...sk, enabled: !sk.enabled };
        }
        return sk;
      })
    );
  };

  return (
    <div className="flex-1 w-full p-6 flex flex-col gap-6 overflow-y-auto">
      {/* Title section */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" />
          Global Config Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure shared environment components, Model Context Protocol (MCP) servers, and skillsets that apply globally to all your AI agents.
        </p>
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
              <h2 className="text-lg font-bold text-foreground">Registered MCP Servers</h2>
              <Button 
                onClick={() => setIsAddingMcp(true)}
                variant="primary" 
                size="sm" 
                className="rounded-xl gap-1.5"
              >
                <Plus className="h-4 w-4" />
                Register Server
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {mcpServers.map((server) => (
                <div 
                  key={server.id} 
                  className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-xl border border-border bg-card hover:border-primary/20 transition-all duration-200 gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-foreground">{server.name}</h4>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        server.status === "Running"
                          ? "bg-emerald-500/5 text-emerald-500 border-emerald-500/10"
                          : "bg-muted text-muted-foreground border-border/80"
                      }`}>
                        <span className={`h-1 w-1 rounded-full ${server.status === "Running" ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
                        {server.status}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-muted-foreground bg-background/50 p-2 rounded-lg border border-border/40 mt-1 max-w-2xl overflow-x-auto">
                      <span className="text-primary font-bold">{server.command}</span> {server.args}
                    </div>
                    {server.env && (
                      <p className="text-[10px] text-muted-foreground font-mono mt-1">
                        Env: <span className="bg-secondary px-1.5 py-0.5 rounded">{server.env}</span>
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-end md:self-center">
                    <Button
                      variant={server.status === "Running" ? "outline" : "secondary"}
                      size="sm"
                      onClick={() => handleToggleMcpStatus(server.id)}
                      className="h-8 rounded-lg text-xs gap-1"
                    >
                      {server.status === "Running" ? (
                        <>
                          <Square className="h-3 w-3 fill-current" />
                          Stop
                        </>
                      ) : (
                        <>
                          <Play className="h-3 w-3 fill-current" />
                          Start
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteMcp(server.id)}
                      className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Register MCP Server Morphing Modal */}
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

              <form onSubmit={handleAddMcp} className="space-y-4 pt-4">
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
                      placeholder="e.g. -y @modelcontextprotocol/..."
                      value={newMcpArgs}
                      onChange={(e) => setNewMcpArgs(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="mcp-env" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Environment Variables (comma or line separated)
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
              <p className="text-xs text-muted-foreground">
                Enabling a skillset injects the corresponding functions, MCP schemas, and tools directly into the execution prompt payload for all agents.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {skills.map((skill) => (
                <div 
                  key={skill.id} 
                  onClick={() => handleToggleSkill(skill.id)}
                  className={`cursor-pointer flex items-start justify-between p-4 rounded-xl border bg-card transition-all duration-200 select-none ${
                    skill.enabled 
                      ? "border-primary/50 ring-1 ring-primary/10 shadow-sm" 
                      : "border-border hover:border-border/80"
                  }`}
                >
                  <div className="space-y-1 max-w-[80%]">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-foreground text-sm">{skill.name}</h4>
                      <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded font-mono">
                        {skill.category}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                      {skill.description}
                    </p>
                  </div>

                  <button 
                    type="button"
                    className={`focus:outline-none transition-colors duration-150 ${skill.enabled ? "text-primary" : "text-muted-foreground"}`}
                  >
                    {skill.enabled ? (
                      <ToggleRight className="h-7 w-7" />
                    ) : (
                      <ToggleLeft className="h-7 w-7" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSubTab === "rules" && (
          <div className="space-y-4 h-full flex flex-col">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">Global Markdown Rules</h2>
              <span className="text-xs text-muted-foreground">Saved automatically to AGENTS.md</span>
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
