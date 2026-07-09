import { useState, useMemo, useEffect, useCallback } from "react";
import { 
  Search, 
  Folder, 
  Plus, 
  X, 
  Sparkles,
  Settings,
  ChevronDown,
  RefreshCw,
  Copy,
  Check
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/motion/button/base";
import { MorphingModal } from "@/components/motion/morphing-modal";
import { Switch } from "@/components/motion/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/motion/tabs";
import { Loader } from "@/components/motion/loader";
import { Checkbox } from "@/components/motion/checkbox";
import { registerMcpOnAllAgents, type McpServerPayload } from "@/lib/mcpActions";
import {
  getSavedProjects,
  addSavedProject,
  removeSavedProject,
  type SavedProject,
} from "@/lib/projectActions";

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

export function Dashboard({ onNavigateToSettings }: DashboardProps) {
  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [activeAgentModalId, setActiveAgentModalId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newProjectPath, setNewProjectPath] = useState("");
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);

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
    isSymlink: boolean;
  }

  interface ClaudeCodeConfig {
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
    isSymlink: boolean;
  }

  interface AgyConfig {
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
    isSymlink: boolean;
  }

  const [opencodeConfig, setOpencodeConfig] = useState<OpenCodeConfig | null>(null);
  const [claudecodeConfig, setClaudecodeConfig] = useState<ClaudeCodeConfig | null>(null);
  const [agyConfig, setAgyConfig] = useState<AgyConfig | null>(null);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyUacCommand = useCallback((projectPath: string, projectId: string) => {
    navigator.clipboard.writeText(`uac ${projectPath}`).then(() => {
      setCopiedId(projectId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }, []);

  const fetchProjects = useCallback(() => {
    setIsLoadingProjects(true);
    getSavedProjects()
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setIsLoadingProjects(false));
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const fetchConfig = (silent = false) => {
    if (silent) setIsRefreshing(true);
    const finish = () => { if (silent) setIsRefreshing(false); };
    Promise.all([
      invoke<any>("get_opencode_config").catch(() => null),
      invoke<any>("get_claudecode_config").catch(() => null),
      invoke<any>("get_agy_config").catch(() => null),
    ])
      .then(([openVal, claudeVal, agyVal]) => {
        if (openVal) {
          setOpencodeConfig({
            configDir: openVal.configDir,
            mcpServers: openVal.mcpServers,
            skills: openVal.skills,
            isSymlink: openVal.isSymlink,
          });
        }
        if (claudeVal) {
          setClaudecodeConfig({
            configDir: claudeVal.configDir,
            mcpServers: claudeVal.mcpServers,
            skills: claudeVal.skills,
            isSymlink: claudeVal.isSymlink,
          });
        }
        if (agyVal) {
          setAgyConfig({
            configDir: agyVal.configDir,
            mcpServers: agyVal.mcpServers,
            skills: agyVal.skills,
            isSymlink: agyVal.isSymlink,
          });
        }
      })
      .finally(finish);
  };

  useEffect(() => {
    if (activeAgentModalId === "OpenCode" || activeAgentModalId === "ClaudeCode" || activeAgentModalId === "AGY") {
      fetchConfig();
      const handleFocus = () => fetchConfig(true);
      window.addEventListener("focus", handleFocus);
      return () => {
        window.removeEventListener("focus", handleFocus);
      };
    } else {
      setOpencodeConfig(null);
      setClaudecodeConfig(null);
      setAgyConfig(null);
    }
  }, [activeAgentModalId]);

  const handleToggleMcpEnable = (serverName: string) => {
    if (activeAgentModalId === "OpenCode" && opencodeConfig) {
      const server = opencodeConfig.mcpServers.find((s) => s.name === serverName);
      if (!server) return;
      const nextState = !server.enabled;

      setOpencodeConfig((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          mcpServers: prev.mcpServers.map((s) => {
            if (s.name === serverName) return { ...s, enabled: nextState };
            return s;
          }),
        };
      });

      invoke("toggle_mcp_server", {
        name: serverName,
        sourceFile: server.sourceFile,
        enabled: nextState,
      }).catch((err) => {
        console.error("Failed to sync MCP toggle:", err);
        setOpencodeConfig((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            mcpServers: prev.mcpServers.map((s) => {
              if (s.name === serverName) return { ...s, enabled: !nextState };
              return s;
            }),
          };
        });
      });
    } else if (activeAgentModalId === "ClaudeCode" && claudecodeConfig) {
      const server = claudecodeConfig.mcpServers.find((s) => s.name === serverName);
      if (!server) return;
      const nextState = !server.enabled;

      setClaudecodeConfig((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          mcpServers: prev.mcpServers.map((s) => {
            if (s.name === serverName) return { ...s, enabled: nextState };
            return s;
          }),
        };
      });

      invoke("toggle_claudecode_mcp_server", {
        name: serverName,
        sourceFile: server.sourceFile,
        enabled: nextState,
      }).catch((err) => {
        console.error("Failed to sync Claude Code MCP toggle:", err);
        setClaudecodeConfig((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            mcpServers: prev.mcpServers.map((s) => {
              if (s.name === serverName) return { ...s, enabled: !nextState };
              return s;
            }),
          };
        });
      });
    } else if (activeAgentModalId === "AGY" && agyConfig) {
      const server = agyConfig.mcpServers.find((s) => s.name === serverName);
      if (!server) return;
      const nextState = !server.enabled;

      setAgyConfig((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          mcpServers: prev.mcpServers.map((s) => {
            if (s.name === serverName) return { ...s, enabled: nextState };
            return s;
          }),
        };
      });

      invoke("toggle_agy_mcp_server", {
        name: serverName,
        sourceFile: server.sourceFile,
        enabled: nextState,
      }).catch((err) => {
        console.error("Failed to sync AGY MCP toggle:", err);
        setAgyConfig((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            mcpServers: prev.mcpServers.map((s) => {
              if (s.name === serverName) return { ...s, enabled: !nextState };
              return s;
            }),
          };
        });
      });
    }
  };

  const handleToggleSkillEnable = (skillId: string) => {
    if (activeAgentModalId === "OpenCode" && opencodeConfig) {
      const skill = opencodeConfig.skills.find((s) => s.id === skillId);
      if (!skill) return;
      const nextState = !skill.enabled;

      setOpencodeConfig((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          skills: prev.skills.map((s) => {
            if (s.id === skillId) return { ...s, enabled: nextState };
            return s;
          }),
        };
      });

      invoke("toggle_skill", {
        name: skill.name.toLowerCase(),
        enabled: nextState,
      }).catch((err) => {
        console.error("Failed to sync Skill toggle:", err);
        setOpencodeConfig((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            skills: prev.skills.map((s) => {
              if (s.id === skillId) return { ...s, enabled: !nextState };
              return s;
            }),
          };
        });
      });
    } else if (activeAgentModalId === "ClaudeCode" && claudecodeConfig) {
      const skill = claudecodeConfig.skills.find((s) => s.id === skillId);
      if (!skill) return;
      const nextState = !skill.enabled;

      setClaudecodeConfig((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          skills: prev.skills.map((s) => {
            if (s.id === skillId) return { ...s, enabled: nextState };
            return s;
          }),
        };
      });

      invoke("toggle_claudecode_skill", {
        id: skillId,
        enabled: nextState,
      }).catch((err) => {
        console.error("Failed to sync Claude Code Skill toggle:", err);
        setClaudecodeConfig((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            skills: prev.skills.map((s) => {
              if (s.id === skillId) return { ...s, enabled: !nextState };
              return s;
            }),
          };
        });
      });
    } else if (activeAgentModalId === "AGY" && agyConfig) {
      const skill = agyConfig.skills.find((s) => s.id === skillId);
      if (!skill) return;
      const nextState = !skill.enabled;

      setAgyConfig((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          skills: prev.skills.map((s) => {
            if (s.id === skillId) return { ...s, enabled: nextState };
            return s;
          }),
        };
      });

      invoke("toggle_agy_skill", {
        id: skillId,
        enabled: nextState,
      }).catch((err) => {
        console.error("Failed to sync AGY Skill toggle:", err);
        setAgyConfig((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            skills: prev.skills.map((s) => {
              if (s.id === skillId) return { ...s, enabled: !nextState };
              return s;
            }),
          };
        });
      });
    }
  };

  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  const toggleItemExpanded = (id: string) => {
    setExpandedItems((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };
  const [isMigrating, setIsMigrating] = useState(false);

  const handleMigrateConfig = () => {
    setIsMigrating(true);
    if (activeAgentModalId === "OpenCode") {
      invoke<string>("migrate_opencode_config")
        .then((msg) => {
          console.log(msg);
          invoke<any>("get_opencode_config")
            .then((data) => {
              const mappedSkills = (data.skills || []).map((sk: any) => ({
                ...sk,
                enabled: sk.enabled,
              }));
              setOpencodeConfig({
                configDir: data.configDir,
                mcpServers: data.mcpServers,
                skills: mappedSkills,
                isSymlink: data.isSymlink,
              });
            })
            .finally(() => setIsMigrating(false));
        })
        .catch((err) => {
          console.error("Migration failed:", err);
          setIsMigrating(false);
        });
    } else if (activeAgentModalId === "ClaudeCode") {
      invoke<string>("migrate_claudecode_config")
        .then((msg) => {
          console.log(msg);
          invoke<any>("get_claudecode_config")
            .then((data) => {
              const mappedSkills = (data.skills || []).map((sk: any) => ({
                ...sk,
                enabled: sk.enabled,
              }));
              setClaudecodeConfig({
                configDir: data.configDir,
                mcpServers: data.mcpServers,
                skills: mappedSkills,
                isSymlink: data.isSymlink,
              });
            })
            .finally(() => setIsMigrating(false));
        })
        .catch((err) => {
          console.error("Migration failed:", err);
          setIsMigrating(false);
        });
    } else if (activeAgentModalId === "AGY") {
      invoke<string>("migrate_agy_config")
        .then((msg) => {
          console.log(msg);
          invoke<any>("get_agy_config")
            .then((data) => {
              const mappedSkills = (data.skills || []).map((sk: any) => ({
                ...sk,
                enabled: sk.enabled,
              }));
              setAgyConfig({
                configDir: data.configDir,
                mcpServers: data.mcpServers,
                skills: mappedSkills,
                isSymlink: data.isSymlink,
              });
            })
            .finally(() => setIsMigrating(false));
        })
        .catch((err) => {
          console.error("Migration failed:", err);
          setIsMigrating(false);
        });
    }
  };

  const isGloballyShared = (name: string) => {
    const inOpenCode = opencodeConfig?.mcpServers.some((s) => s.name === name) ?? false;
    const inClaudeCode = claudecodeConfig?.mcpServers.some((s) => s.name === name) ?? false;
    const inAgy = agyConfig?.mcpServers.some((s) => s.name === name) ?? false;

    let count = 0;
    if (inOpenCode) count++;
    if (inClaudeCode) count++;
    if (inAgy) count++;

    return count > 1;
  };

  const handleToggleShareGlobally = async (srv: McpServerPayload, checked: boolean) => {
    if (!activeAgentModalId) return;
    try {
      await registerMcpOnAllAgents(srv, activeAgentModalId, checked);
      fetchConfig(true);
    } catch (err) {
      console.error("Failed to share MCP server globally:", err);
    }
  };

  const handleAddProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectPath.trim()) return;

    addSavedProject(newProjectPath.trim())
      .then(() => {
        setNewProjectPath("");
        setIsAddModalOpen(false);
        fetchProjects();
      })
      .catch((err) => console.error("Failed to add project:", err));
  };

  const handleRemoveProject = (path: string) => {
    removeSavedProject(path).then(() => fetchProjects());
  };

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
        {isLoadingProjects ? (
          <div className="flex flex-col justify-center items-center py-20 gap-3">
            <Loader variant="helix" size={24} className="text-primary" />
            <span className="text-xs text-muted-foreground font-medium">Loading projects...</span>
          </div>
        ) : (
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
                        {project.uacAdopted && (
                          <span className="text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                            UAC
                          </span>
                        )}
                      </h4>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5 line-clamp-1">{project.path}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-4 border-t md:border-t-0 border-border/40 pt-3 md:pt-0">
                    {/* Detected Agents */}
                    <div className="flex flex-col items-start md:items-end gap-1">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Agents</span>
                      <div className="flex gap-1 flex-wrap justify-end">
                        {project.detectedAgents.length > 0 ? project.detectedAgents.map((a) => (
                          <span
                            key={a}
                            className={`inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                              a === "OpenCode"
                                ? "bg-violet-500/5 text-violet-400 border-violet-500/10"
                                : a === "ClaudeCode"
                                ? "bg-amber-500/5 text-amber-400 border-amber-500/10"
                                : "bg-emerald-500/5 text-emerald-400 border-emerald-500/10"
                            }`}
                          >
                            {a === "ClaudeCode" ? "Claude" : a === "AGY" ? "AGY" : "OC"}
                          </span>
                        )) : (
                          <span className="text-[9px] text-muted-foreground/60 font-mono">None detected</span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 rounded-lg px-2.5 gap-1.5"
                        title="Copy UAC command to open this project"
                        onClick={() => handleCopyUacCommand(project.path, project.id)}
                      >
                        {copiedId === project.id ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        <span className="text-[10px] font-semibold">
                          {copiedId === project.id ? "Copied!" : "uac"}
                        </span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 rounded-lg p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                        title="Remove from list"
                        onClick={() => handleRemoveProject(project.path)}
                      >
                        <X className="h-3.5 w-3.5" />
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
                Add a project by path, or run <code className="text-xs bg-secondary px-1.5 py-0.5 rounded font-mono">uac /path/to/project</code> from the terminal.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
        )}
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
            <label htmlFor="proj-path" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Project Directory Path
            </label>
            <input
              id="proj-path"
              type="text"
              required
              placeholder="e.g. /home/mallubeast/Dev/my-project"
              value={newProjectPath}
              onChange={(e) => setNewProjectPath(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
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
                {agent.id === "OpenCode" || agent.id === "ClaudeCode" || agent.id === "AGY" ? (
                  (() => {
                    const currentAgentConfig = 
                      agent.id === "OpenCode" ? opencodeConfig :
                      agent.id === "ClaudeCode" ? claudecodeConfig :
                      agyConfig;
                    return (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                              <Folder className="h-3.5 w-3.5 text-primary" />
                              Global Config Location
                            </div>
                            {currentAgentConfig && (
                              currentAgentConfig.isSymlink ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  ✓ Synced via UAC
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                  ⚠ Legacy Path
                                </span>
                              )
                            )}
                          </div>
                          <div className="text-xs font-mono bg-secondary/50 border border-border/40 p-2.5 rounded-xl break-all select-all flex items-center justify-between gap-3">
                            <span className="truncate">{currentAgentConfig ? currentAgentConfig.configDir : "Loading..."}</span>
                            {currentAgentConfig && !currentAgentConfig.isSymlink && (
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={isMigrating}
                                onClick={handleMigrateConfig}
                                className="h-7 text-[10px] rounded-lg shrink-0 px-2.5 bg-amber-500/10 hover:bg-amber-500 hover:text-white border border-amber-500/20 hover:border-amber-500 text-amber-400 transition-all font-semibold"
                              >
                                {isMigrating ? (
                                  <span className="flex items-center gap-1.5">
                                    <Loader variant="helix" size={12} className="text-amber-400" />
                                    Migrating...
                                  </span>
                                ) : (
                                  "Migrate to UAC"
                                )}
                              </Button>
                            )}
                          </div>
                        </div>

                        <Tabs defaultValue="mcp" variant="underline" className="w-full mt-2">
                          <TabsList className="w-full justify-between items-center border-b border-border/40 pb-0 mb-4">
                            <div className="flex gap-2 -mb-px">
                              <TabsTrigger value="mcp" className="pb-2 pt-0 text-[11px] font-bold uppercase tracking-wider">
                                MCP Servers ({currentAgentConfig?.mcpServers.length ?? 0})
                              </TabsTrigger>
                              <TabsTrigger value="skills" className="pb-2 pt-0 text-[11px] font-bold uppercase tracking-wider">
                                Skills ({currentAgentConfig?.skills.length ?? 0})
                              </TabsTrigger>
                            </div>
                            <button
                              type="button"
                              onClick={() => fetchConfig()}
                              title="Refresh configuration"
                              className="pb-2 pt-0 px-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                            >
                              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                            </button>
                          </TabsList>

                          <TabsContent value="mcp" className="space-y-3 mt-0">
                            {currentAgentConfig ? (
                              currentAgentConfig.mcpServers.length > 0 ? (
                                <div className="space-y-2">
                                  {currentAgentConfig.mcpServers.map((srv) => {
                                    const isExpanded = !!expandedItems[`mcp-${srv.name}`];
                                    return (
                                      <div
                                        key={srv.name}
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
                                          <div className="flex items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
                                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                              Active state
                                            </span>
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

                                            <div className="flex items-center gap-2 pt-2 mt-2 border-t border-border/10">
                                              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider shrink-0">Active in:</span>
                                              {([
                                                { id: "OpenCode", cfg: opencodeConfig },
                                                { id: "ClaudeCode", cfg: claudecodeConfig },
                                                { id: "AGY", cfg: agyConfig },
                                              ] as const).map(({ id, cfg }) => {
                                                const peer = cfg?.mcpServers.find((p) => p.name === srv.name);
                                                if (!peer) {
                                                  return (
                                                    <span
                                                      key={id}
                                                      className="inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded border border-border/40 text-muted-foreground/60 bg-secondary/20"
                                                      title={`Not registered in ${id}`}
                                                    >
                                                      {id} —
                                                    </span>
                                                  );
                                                }
                                                const isCurrent = id === activeAgentModalId;
                                                return (
                                                  <span
                                                    key={id}
                                                    className={`inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                                                      peer.enabled
                                                        ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                                                        : "border-amber-500/30 text-amber-400 bg-amber-500/10"
                                                    } ${isCurrent ? "ring-1 ring-primary/40" : ""}`}
                                                    title={`${id}: ${peer.enabled ? "enabled" : "disabled"}${isCurrent ? " (this agent)" : ""}`}
                                                  >
                                                    {id} {peer.enabled ? "On" : "Off"}
                                                  </span>
                                                );
                                              })}
                                            </div>

                                            <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                                              <Checkbox
                                                checked={isGloballyShared(srv.name)}
                                                onCheckedChange={(checked) => handleToggleShareGlobally(srv, checked)}
                                                className="scale-90 origin-left"
                                                label="Share Globally"
                                              />
                                            </div>
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
                              <div className="flex flex-col justify-center items-center py-8 gap-3">
                                <Loader variant="helix" size={24} className="text-primary" />
                                <span className="text-xs text-muted-foreground font-medium">Loading configs...</span>
                              </div>
                            )}
                          </TabsContent>

                          <TabsContent value="skills" className="space-y-3 mt-0">
                            {currentAgentConfig ? (
                              currentAgentConfig.skills.length > 0 ? (
                                <div className="space-y-2">
                                  {currentAgentConfig.skills.map((sk) => {
                                    const isExpanded = !!expandedItems[`skill-${sk.id}`];
                                    return (
                                      <div
                                        key={sk.id}
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
                              <div className="flex flex-col justify-center items-center py-8 gap-3">
                                <Loader variant="helix" size={24} className="text-primary" />
                                <span className="text-xs text-muted-foreground font-medium">Loading configs...</span>
                              </div>
                            )}
                          </TabsContent>
                        </Tabs>
                      </div>
                    );
                  })()
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
