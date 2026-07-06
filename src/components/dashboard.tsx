import { useState, useMemo, useEffect } from "react";
import { 
  Search, 
  Folder, 
  Play, 
  Square, 
  Plus, 
  X, 
  Terminal, 
  Sparkles,
  Settings,
  ChevronDown
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/motion/button/base";
import { MorphingModal } from "@/components/motion/morphing-modal";
import { Switch } from "@/components/motion/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/motion/tabs";

interface DashboardProps {
  onNavigateToSettings: () => void;
}

interface AgentCard {
  id: string;
  name: string;
  imageSrc: string;
  accentColor: string;
  gradient: string;
}

interface Project {
  id: string;
  name: string;
  path: string;
  agent: "OpenCode" | "ClaudeCode" | "AGY" | "None";
  status: "Running" | "Idle";
  lastActive: string;
}

export function Dashboard({ onNavigateToSettings }: DashboardProps) {
  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [activeAgentModalId, setActiveAgentModalId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectPath, setNewProjectPath] = useState("");
  const [newProjectAgent, setNewProjectAgent] = useState<Project["agent"]>("None");

  interface OpenCodeConfig {
    configDir: string;
    mcpServers: Array<{
      name: string;
      type: string;
      url?: string;
      command?: string[];
      env?: any;
      enabled: boolean;
      sourceFile: string;
    }>;
    skills: Array<{
      id: string;
      name: string;
      description: string;
      path: string;
      enabled: boolean;
    }>;
  }

  const [opencodeConfig, setOpencodeConfig] = useState<OpenCodeConfig | null>(null);

  useEffect(() => {
    if (activeAgentModalId === "OpenCode") {
      invoke<any>("get_opencode_config")
        .then((data) => {
          const mappedSkills = (data.skills || []).map((sk: any) => ({
            ...sk,
            enabled: true
          }));
          setOpencodeConfig({
            ...data,
            skills: mappedSkills
          });
        })
        .catch((err) => console.error("Failed to load OpenCode config:", err));
    } else {
      setOpencodeConfig(null);
    }
  }, [activeAgentModalId]);

  const handleToggleMcpEnable = (serverName: string) => {
    if (!opencodeConfig) return;
    setOpencodeConfig((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        mcpServers: prev.mcpServers.map((s) => {
          if (s.name === serverName) {
            return { ...s, enabled: !s.enabled };
          }
          return s;
        }),
      };
    });
  };

  const handleToggleSkillEnable = (skillId: string) => {
    if (!opencodeConfig) return;
    setOpencodeConfig((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        skills: prev.skills.map((s) => {
          if (s.id === skillId) {
            return { ...s, enabled: !s.enabled };
          }
          return s;
        }),
      };
    });
  };
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  const toggleItemExpanded = (id: string) => {
    setExpandedItems((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Initial Mock Data
  const [projects, setProjects] = useState<Project[]>([
    {
      id: "1",
      name: "unified-agent-control",
      path: "/home/mallubeast/Dev/applications/desktop/unified-agent-control",
      agent: "ClaudeCode",
      status: "Running",
      lastActive: "Just now",
    },
    {
      id: "2",
      name: "cortex-engine",
      path: "/home/mallubeast/Dev/services/cortex-engine",
      agent: "OpenCode",
      status: "Running",
      lastActive: "12 mins ago",
    },
    {
      id: "3",
      name: "agent-sandbox",
      path: "/home/mallubeast/Dev/sandboxes/agent-sandbox",
      agent: "OpenCode",
      status: "Idle",
      lastActive: "2 hours ago",
    },
    {
      id: "4",
      name: "antigravity-cli",
      path: "/home/mallubeast/Dev/cli/antigravity-cli",
      agent: "None",
      status: "Idle",
      lastActive: "1 day ago",
    },
  ]);

  const agents: AgentCard[] = [
    {
      id: "OpenCode",
      name: "OPENCODE",
      imageSrc: "/icons/opencode-dark.webp",
      accentColor: "border-violet-500/20 hover:border-violet-500/50",
      gradient: "from-violet-500/10 via-transparent to-transparent",
    },
    {
      id: "ClaudeCode",
      name: "CLAUDECODE",
      imageSrc: "/icons/claudecode-color-dark.webp",
      accentColor: "border-amber-500/20 hover:border-amber-500/50",
      gradient: "from-amber-500/10 via-transparent to-transparent",
    },
    {
      id: "AGY",
      name: "AGY",
      imageSrc: "/icons/gemini-color-dark.webp",
      accentColor: "border-emerald-500/20 hover:border-emerald-500/50",
      gradient: "from-emerald-500/10 via-transparent to-transparent",
    },
  ];

  // Actions
  const handleToggleAgent = (projectId: string) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id === projectId) {
          const nextStatus = p.status === "Running" ? "Idle" : "Running";
          return {
            ...p,
            status: nextStatus,
            lastActive: nextStatus === "Running" ? "Just now" : p.lastActive,
          };
        }
        return p;
      })
    );
  };

  const handleAddProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    const newProj: Project = {
      id: Date.now().toString(),
      name: newProjectName,
      path: newProjectPath || `~/Dev/${newProjectName}`,
      agent: newProjectAgent,
      status: newProjectAgent !== "None" ? "Running" : "Idle",
      lastActive: "Just now",
    };

    setProjects((prev) => [newProj, ...prev]);
    setNewProjectName("");
    setNewProjectPath("");
    setNewProjectAgent("None");
    setIsAddModalOpen(false);
  };

  // Filter logic
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      return (
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.path.toLowerCase().includes(searchQuery.toLowerCase())
      );
    });
  }, [projects, searchQuery]);

  return (
    <div className="flex-1 w-full p-6 flex flex-col gap-6 overflow-y-auto">
      {/* Top Cards (Agents + Global Config Summary) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Global Config Summary Card */}
        <div
          onClick={onNavigateToSettings}
          className="group relative cursor-pointer overflow-hidden rounded-2xl border border-dashed border-border bg-secondary/15 hover:bg-secondary/25 p-4 flex justify-between gap-4 transition-all duration-300 hover:border-primary/60 hover:shadow-sm h-36"
        >
          <div className="flex flex-col justify-between h-full flex-1">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground/80 tracking-wider uppercase">
                Global Settings
              </div>
              <p className="text-[10px] text-muted-foreground leading-tight">
                Configure shared MCPs & skillsets
              </p>
            </div>

            <div className="flex flex-col gap-1 mt-1">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                <span className="text-muted-foreground">Active MCP:</span>
                <span className="font-semibold text-foreground">2 Running</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-primary/80" />
                <span className="text-muted-foreground">Skills:</span>
                <span className="font-semibold text-foreground">3 Enabled</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between items-end h-full">
            <div className="p-2 rounded-xl bg-background border border-border/60 group-hover:border-primary/40 transition-colors">
              <Settings className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:rotate-45 transition-all duration-300" />
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onNavigateToSettings();
              }}
              className="h-8 rounded-lg text-xs gap-1 py-0 px-3 hover:bg-primary hover:text-primary-foreground transition-all duration-200"
            >
              Configure
            </Button>
          </div>
        </div>

        {agents.map((agent) => {
          return (
            <motion.div
              key={agent.id}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setActiveAgentModalId(agent.id)}
              className={`relative cursor-pointer overflow-hidden rounded-2xl border bg-card h-36 flex items-center justify-center transition-all duration-300 border-border ${agent.accentColor}`}
            >
              {/* Decorative radial gradient highlight */}
              <div className={`absolute inset-0 bg-gradient-to-br ${agent.gradient} opacity-60 pointer-events-none`} />

              <div className="relative z-10 flex items-center justify-center w-full h-full p-6">
                <img
                  src={agent.imageSrc}
                  alt={agent.name}
                  className="max-h-16 max-w-[80%] object-contain select-none pointer-events-none"
                />
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Projects Row Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-border/60 pt-6 mt-2">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold tracking-tight text-foreground">Projects</h2>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Search bar */}
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-64 pl-9 pr-4 py-2 text-sm rounded-xl border border-border bg-background/50 placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery("")} 
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Add project button */}
          <Button 
            onClick={() => setIsAddModalOpen(true)}
            variant="primary" 
            size="sm" 
            className="rounded-xl gap-1.5 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
      </div>

      {/* Projects List */}
      <div className="flex-1 min-h-0">
        <AnimatePresence mode="popLayout">
          {filteredProjects.length > 0 ? (
            <div className="flex flex-col gap-3">
              {filteredProjects.map((project) => (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="group flex flex-col md:flex-row md:items-center justify-between p-4 rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-sm transition-all duration-200 gap-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-secondary text-muted-foreground group-hover:text-primary transition-colors border border-border/40">
                      <Folder className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-foreground flex items-center gap-2">
                        {project.name}
                        {project.status === "Running" && (
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        )}
                      </h4>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5 line-clamp-1">{project.path}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 border-border/40 pt-3 md:pt-0">
                    {/* Active Agent Badge */}
                    <div className="flex flex-col items-start md:items-end gap-1">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Active Agent</span>
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md border ${
                        project.agent === "OpenCode"
                          ? "bg-violet-500/5 text-violet-500 border-violet-500/10"
                          : project.agent === "ClaudeCode"
                          ? "bg-amber-500/5 text-amber-500 border-amber-500/10"
                          : project.agent === "AGY"
                          ? "bg-emerald-500/5 text-emerald-500 border-emerald-500/10"
                          : "bg-muted text-muted-foreground border-border/85"
                      }`}>
                        {project.agent === "None" ? "No Agent" : project.agent}
                      </span>
                    </div>

                    {/* Last active info */}
                    <div className="hidden sm:flex flex-col items-end gap-1">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Last Active</span>
                      <span className="text-xs text-foreground font-medium">{project.lastActive}</span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {project.agent !== "None" && (
                        <Button
                          variant={project.status === "Running" ? "outline" : "secondary"}
                          size="sm"
                          onClick={() => handleToggleAgent(project.id)}
                          className="h-8 rounded-lg px-3 text-xs gap-1.5"
                        >
                          {project.status === "Running" ? (
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
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 rounded-lg p-0"
                        title="Open Terminal"
                      >
                        <Terminal className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-16 px-4 rounded-xl border border-dashed border-border text-center"
            >
              <div className="p-3 bg-secondary rounded-full text-muted-foreground mb-4">
                <Folder className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-foreground">No projects found</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                No projects matched your criteria. Add a new project or adjust your filters.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Add Project Morphing Modal */}
      <MorphingModal
        viewId={isAddModalOpen ? "add-project" : null}
        onClose={() => setIsAddModalOpen(false)}
        placement="center"
        className="max-w-md"
      >
        <div className="flex items-center justify-between pb-4 border-b border-border/60">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Add Project
          </h3>
          <button
            type="button"
            onClick={() => setIsAddModalOpen(false)}
            className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleAddProject} className="space-y-4 pt-4">
          <div className="space-y-1.5">
            <label htmlFor="proj-name" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Project Name
            </label>
            <input
              id="proj-name"
              type="text"
              required
              placeholder="e.g. unified-agent-control"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="proj-path" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Project Directory Path
            </label>
            <input
              id="proj-path"
              type="text"
              placeholder="e.g. /home/mallubeast/Dev/my-project"
              value={newProjectPath}
              onChange={(e) => setNewProjectPath(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="proj-agent" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Attach Agent
            </label>
            <select
              id="proj-agent"
              value={newProjectAgent}
              onChange={(e) => setNewProjectAgent(e.target.value as Project["agent"])}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            >
              <option value="None">None (No Agent)</option>
              <option value="OpenCode">OpenCode</option>
              <option value="ClaudeCode">ClaudeCode</option>
              <option value="AGY">AGY</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/40 mt-6">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAddModalOpen(false)}
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
              Add Project
            </Button>
          </div>
        </form>
      </MorphingModal>

      {/* Agent Details Morphing Modal */}
      <MorphingModal
        viewId={activeAgentModalId}
        onClose={() => setActiveAgentModalId(null)}
        placement="center"
        className="max-w-md"
      >
        {activeAgentModalId && (() => {
          const agent = agents.find(a => a.id === activeAgentModalId);
          if (!agent) return null;
          return (
            <div className="flex flex-col items-center text-center gap-4">
              <div className="flex justify-end w-full">
                <button
                  type="button"
                  onClick={() => setActiveAgentModalId(null)}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <img
                src={agent.imageSrc}
                alt={agent.name}
                className="h-16 object-contain select-none mb-2 pointer-events-none"
              />

              <div>
                <h3 className="text-xl font-bold text-foreground">{agent.name}</h3>
                <p className="text-xs text-muted-foreground mt-1 px-4">
                  Configure specific model selections, system rules, and capabilities for {agent.name}.
                </p>
              </div>

              {/* Agent Settings Form */}
              <div className="w-full text-left space-y-4 border-t border-b border-border/40 py-4 my-2 max-h-[60vh] overflow-y-auto pr-1">
                {agent.id === "OpenCode" ? (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        <Folder className="h-3.5 w-3.5 text-primary" />
                        Global Config Location
                      </div>
                      <div className="text-xs font-mono bg-secondary/50 border border-border/40 p-2.5 rounded-xl break-all select-all">
                        {opencodeConfig ? opencodeConfig.configDir : "Loading..."}
                      </div>
                    </div>

                    <Tabs defaultValue="mcp" variant="underline" className="w-full mt-2">
                      <TabsList className="w-full justify-start border-b border-border/40 pb-0 gap-2 mb-4">
                        <TabsTrigger value="mcp" className="pb-2 pt-0 -mb-px text-[11px] font-bold uppercase tracking-wider">
                          MCP Servers ({opencodeConfig?.mcpServers.length ?? 0})
                        </TabsTrigger>
                        <TabsTrigger value="skills" className="pb-2 pt-0 -mb-px text-[11px] font-bold uppercase tracking-wider">
                          Skills ({opencodeConfig?.skills.length ?? 0})
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="mcp" className="space-y-3 mt-0">
                        {opencodeConfig ? (
                          opencodeConfig.mcpServers.length > 0 ? (
                            <div className="space-y-2">
                              {opencodeConfig.mcpServers.map((srv, idx) => {
                                const isExpanded = !!expandedItems[`mcp-${srv.name}`];
                                return (
                                  <div 
                                    key={idx} 
                                    onClick={() => toggleItemExpanded(`mcp-${srv.name}`)}
                                    className="flex flex-col p-3 rounded-xl border border-border/60 bg-background/50 text-xs gap-1.5 hover:border-primary/20 transition-all duration-150 cursor-pointer text-left"
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-0" : "-rotate-90"}`} />
                                        <span className="font-bold text-foreground">{srv.name}</span>
                                        <span className="text-[9px] font-mono font-bold bg-secondary px-1.5 py-0.5 rounded text-muted-foreground uppercase">
                                          {srv.sourceFile}
                                        </span>
                                      </div>
                                      <div onClick={(e) => e.stopPropagation()}>
                                        <Switch
                                          checked={srv.enabled}
                                          onCheckedChange={() => handleToggleMcpEnable(srv.name)}
                                        />
                                      </div>
                                    </div>
                                    
                                    {isExpanded && (
                                      <div className="mt-1 space-y-1.5 border-t border-border/20 pt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                        {srv.type === "remote" ? (
                                          <div className="text-[10px] font-mono text-muted-foreground break-all">
                                            URL: <span className="text-primary/95">{srv.url}</span>
                                          </div>
                                        ) : (
                                          <div className="text-[10px] font-mono text-muted-foreground break-all">
                                            Command: <span className="text-foreground">{srv.command?.join(" ")}</span>
                                          </div>
                                        )}

                                        {srv.env && Object.keys(srv.env).length > 0 && (
                                          <div className="text-[9px] font-mono text-muted-foreground bg-secondary/30 p-1.5 rounded-lg border border-border/20">
                                            Env: {JSON.stringify(srv.env)}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground italic text-center py-4 border border-dashed border-border rounded-xl">
                              No MCP servers found in global config.
                            </p>
                          )
                        ) : (
                          <div className="flex justify-center items-center py-6">
                            <span className="text-xs text-muted-foreground animate-pulse">Loading configs...</span>
                          </div>
                        )}
                      </TabsContent>

                      <TabsContent value="skills" className="space-y-3 mt-0">
                        {opencodeConfig ? (
                          opencodeConfig.skills.length > 0 ? (
                            <div className="space-y-2">
                              {opencodeConfig.skills.map((sk, idx) => {
                                const isExpanded = !!expandedItems[`skill-${sk.id}`];
                                return (
                                  <div 
                                    key={idx} 
                                    onClick={() => toggleItemExpanded(`skill-${sk.id}`)}
                                    className="flex flex-col p-3 rounded-xl border border-border/60 bg-background/50 text-xs gap-1.5 hover:border-primary/20 transition-all duration-150 cursor-pointer text-left"
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-0" : "-rotate-90"}`} />
                                        <span className="font-bold text-foreground capitalize">{sk.name}</span>
                                        <span className="text-[9px] font-mono font-bold bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">
                                          {sk.id}
                                        </span>
                                      </div>
                                      <div onClick={(e) => e.stopPropagation()}>
                                        <Switch
                                          checked={sk.enabled}
                                          onCheckedChange={() => handleToggleSkillEnable(sk.id)}
                                        />
                                      </div>
                                    </div>
                                    
                                    {isExpanded && (
                                      <div className="mt-1 space-y-1.5 border-t border-border/20 pt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                                          {sk.description}
                                        </p>

                                        <div className="text-[9px] font-mono text-muted-foreground/80 break-all bg-secondary/20 p-1.5 rounded border border-border/10">
                                          Path: {sk.path}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground italic text-center py-4 border border-dashed border-border rounded-xl">
                              No skills found in global config.
                            </p>
                          )
                        ) : (
                          <div className="flex justify-center items-center py-6">
                            <span className="text-xs text-muted-foreground animate-pulse">Loading configs...</span>
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Target Model
                      </label>
                      <select className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all">
                        {agent.id === "ClaudeCode" && (
                          <>
                            <option>Claude 3.5 Sonnet (Default)</option>
                            <option>Claude 3.5 Haiku</option>
                          </>
                        )}
                        {agent.id === "AGY" && (
                          <>
                            <option>Gemini 2.5 Flash (Default)</option>
                            <option>Gemini 2.5 Pro</option>
                          </>
                        )}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Agent Role / Prompt Context
                      </label>
                      <textarea 
                        className="w-full h-20 px-3 py-2 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none transition-all"
                        placeholder={`Enter custom behaviors for ${agent.name}...`}
                        defaultValue={`You are a helpful programming assistant running via ${agent.name}.`}
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 w-full">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveAgentModalId(null)}
                  className="rounded-lg h-9 px-4"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => setActiveAgentModalId(null)}
                  className="rounded-lg h-9 px-4"
                >
                  Save Config
                </Button>
              </div>
            </div>
          );
        })()}
      </MorphingModal>
    </div>
  );
}
