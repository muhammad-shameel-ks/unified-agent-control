"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Plus,
  RefreshCw,
  Cpu,
  Sparkles,
  X,
  ChevronDown,
  AlertTriangle,
  Check,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/motion/button/base";
import { MorphingModal } from "@/components/motion/morphing-modal";
import { Switch } from "@/components/motion/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/motion/tabs";
import { Loader } from "@/components/motion/loader";
import {
  getProjectConfig,
  adoptProject,
  upsertProjectMcp,
  removeProjectMcp,
  toggleProjectMcpAgent,
  toggleProjectSkill,
  createProjectSkill,
  deleteProjectSkill,
  getProjectPreview,
  type ProjectConfig,
  type ProjectMcpEntry,
  type ProjectPreview,
} from "@/lib/projectActions";
import type { McpServerPayload } from "@/lib/mcpActions";

interface ProjectViewProps {
  projectPath: string;
  onClearProject?: () => void;
}

export function ProjectView({ projectPath, onClearProject }: ProjectViewProps) {
  const [config, setConfig] = useState<ProjectConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAdopting, setIsAdopting] = useState(false);
  const [activeTab, setActiveTab] = useState<"mcp" | "skills">("mcp");
  const [preview, setPreview] = useState<ProjectPreview | null>(null);
  const [showAdoptDialog, setShowAdoptDialog] = useState(false);

  // MCP form state
  const [newMcpName, setNewMcpName] = useState("");
  const [newMcpCommand, setNewMcpCommand] = useState("");
  const [newMcpArgs, setNewMcpArgs] = useState("");
  const [newMcpEnv, setNewMcpEnv] = useState("");
  const [newMcpUrl, setNewMcpUrl] = useState("");
  const [newMcpType, setNewMcpType] = useState<"command" | "remote">("command");
  const [isAddingMcp, setIsAddingMcp] = useState(false);
  const [editingMcp, setEditingMcp] = useState<string | null>(null);

  // Skill form state
  const [newSkillId, setNewSkillId] = useState("");
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillDesc, setNewSkillDesc] = useState("");
  const [newSkillBody, setNewSkillBody] = useState("");
  const [isAddingSkill, setIsAddingSkill] = useState(false);
  const [editingSkill, setEditingSkill] = useState<string | null>(null);

  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  const fetchConfig = useCallback(
    (silent = false) => {
      if (silent) setIsRefreshing(true);
      else setIsLoading(true);
      getProjectConfig(projectPath)
        .then((cfg) => {
          setConfig(cfg);
          if (!cfg.isAdopted) {
            getProjectPreview(projectPath).then(setPreview).catch(() => {});
          } else {
            setPreview(null);
          }
        })
        .catch((err) => {
          console.error("Failed to load project config:", err);
        })
        .finally(() => {
          setIsLoading(false);
          setIsRefreshing(false);
        });
    },
    [projectPath]
  );

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // ── Adopt ────────────────────────────────────────────────────────────
  const handleAdopt = async () => {
    setIsAdopting(true);
    try {
      await adoptProject(projectPath);
      setShowAdoptDialog(false);
      setPreview(null);
      await fetchConfig();
    } catch (err) {
      console.error("Adopt failed:", err);
    } finally {
      setIsAdopting(false);
    }
  };

  // ── MCP ──────────────────────────────────────────────────────────────
  const handleRegisterNewMcp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMcpName.trim()) return;

    let envObj: Record<string, string> = {};
    if (newMcpEnv.trim()) {
      newMcpEnv.split(",").forEach((pair) => {
        const parts = pair.split("=");
        if (parts.length === 2) envObj[parts[0].trim()] = parts[1].trim();
      });
    }

    const cmdArr: string[] = [];
    if (newMcpType === "command" && newMcpCommand.trim()) {
      cmdArr.push(newMcpCommand.trim());
      if (newMcpArgs.trim()) {
        newMcpArgs.split(" ").forEach((a) => { if (a.trim()) cmdArr.push(a.trim()); });
      }
    }

    const payload: McpServerPayload = {
      name: newMcpName.trim(),
      type: newMcpType,
      url: newMcpType === "remote" ? newMcpUrl.trim() : undefined,
      command: cmdArr.length > 0 ? cmdArr : undefined,
      env: Object.keys(envObj).length > 0 ? envObj : undefined,
      enabled: true,
    };

    upsertProjectMcp(projectPath, payload)
      .then(() => {
        setNewMcpName(""); setNewMcpCommand(""); setNewMcpArgs("");
        setNewMcpEnv(""); setNewMcpUrl(""); setNewMcpType("command");
        setIsAddingMcp(false); setEditingMcp(null);
        fetchConfig(true);
      })
      .catch((err) => console.error("Failed to register MCP:", err));
  };

  const handleToggleMcp = (name: string, enabled: boolean) => {
    const srv = config?.mcpServers.find((s) => s.name === name);
    if (!srv) return;
    upsertProjectMcp(projectPath, {
      name: srv.name, type: srv.type, url: srv.url,
      command: srv.command, env: srv.env, enabled,
    }).then(() => fetchConfig(true));
  };

  const handleDeleteMcp = (name: string) => {
    removeProjectMcp(projectPath, name).then(() => fetchConfig(true));
  };

  const handleToggleMcpAgent = (srv: ProjectMcpEntry, agent: string) => {
    const isRegistered = srv.agents.includes(agent);
    toggleProjectMcpAgent(projectPath, srv.name, agent, {
      name: srv.name,
      type: srv.type,
      url: srv.url,
      command: srv.command,
      env: srv.env,
      enabled: !isRegistered,
    }).then(() => fetchConfig(true));
  };

  const openEditMcp = (srv: ProjectMcpEntry) => {
    setEditingMcp(srv.name);
    setNewMcpName(srv.name);
    setNewMcpType(srv.type === "remote" ? "remote" : "command");
    setNewMcpUrl(srv.url ?? "");
    if (srv.command) {
      setNewMcpCommand(srv.command[0] ?? "");
      setNewMcpArgs(srv.command.slice(1).join(" "));
    } else {
      setNewMcpCommand(""); setNewMcpArgs("");
    }
    setNewMcpEnv(srv.env ? JSON.stringify(srv.env) : "");
    setIsAddingMcp(true);
  };

  // ── Skills ───────────────────────────────────────────────────────────
  const handleCreateSkill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSkillId.trim() || !newSkillName.trim()) return;
    createProjectSkill(projectPath, newSkillId.trim(), newSkillName.trim(), newSkillDesc.trim(), newSkillBody)
      .then(() => {
        setNewSkillId(""); setNewSkillName(""); setNewSkillDesc(""); setNewSkillBody("");
        setIsAddingSkill(false); setEditingSkill(null);
        fetchConfig(true);
      })
      .catch((err) => console.error("Failed to create skill:", err));
  };

  const handleToggleSkill = (id: string, enabled: boolean) => {
    toggleProjectSkill(projectPath, id, enabled).then(() => fetchConfig(true));
  };

  const handleDeleteSkill = (id: string) => {
    deleteProjectSkill(projectPath, id).then(() => fetchConfig(true));
  };

  // ── Render ───────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex-1 w-full p-6 flex flex-col items-center justify-center gap-3">
        <Loader variant="helix" size={36} className="text-primary" />
        <span className="text-sm text-muted-foreground font-medium">Loading project config...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full p-6 flex flex-col gap-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-left">
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <FolderOpen className="h-6 w-6 text-primary" />
            Project Config
          </h1>
          <p className="text-sm text-muted-foreground mt-1 font-mono break-all">{projectPath}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchConfig()}
            title="Refresh configuration"
            className="p-2 rounded-xl border border-border hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
          {onClearProject && (
            <Button variant="ghost" size="sm" onClick={onClearProject} className="rounded-xl gap-1.5">
              <X className="h-4 w-4" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Adoption prompt */}
      {config && !config.isAdopted && (
        <div className="flex items-center justify-between p-4 rounded-2xl border border-amber-500/20 bg-amber-500/5">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
            <div>
              <p className="text-sm font-bold text-foreground">This project isn't unified yet</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Unify to place project-level skills in <code>.uac/skills/</code> and sync MCP entries across all agents.
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowAdoptDialog(true)}
            className="shrink-0 rounded-xl gap-1.5"
          >
            <Check className="h-4 w-4" />
            Unify Project
          </Button>
        </div>
      )}

      {/* Adopted status */}
      {config?.isAdopted && (
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
          Unified &mdash; skills in <code>.uac/skills/</code>, MCPs in all three agent files
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "mcp" | "skills")} variant="underline" className="w-full">
        <TabsList className="w-full justify-between items-center border-b border-border/40 pb-0 mb-4">
          <div className="flex gap-2 -mb-px">
            <TabsTrigger value="mcp" className="pb-2 pt-0 text-[11px] font-bold uppercase tracking-wider">
              MCP Servers ({config?.mcpServers.length ?? 0})
            </TabsTrigger>
            <TabsTrigger value="skills" className="pb-2 pt-0 text-[11px] font-bold uppercase tracking-wider">
              Skills ({config?.skills.length ?? 0})
            </TabsTrigger>
          </div>
        </TabsList>

        {/* ── MCP Servers Tab ──────────────────────────────────────── */}
        <TabsContent value="mcp" className="space-y-3 mt-0">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">Project MCP Servers</h2>
            <Button onClick={() => { setEditingMcp(null); setIsAddingMcp(true); }} variant="primary" size="sm" className="rounded-xl gap-1.5">
              <Plus className="h-4 w-4" /> Add Server
            </Button>
          </div>

          {!config?.isAdopted ? (
            <p className="text-xs text-muted-foreground italic text-center py-8 border border-dashed border-border rounded-xl">
              Adopt this project first to view and manage MCP servers.
            </p>
          ) : config.mcpServers.length > 0 ? (
            <div className="space-y-2">
              {config.mcpServers.map((srv) => {
                const isExpanded = !!expandedItems[`mcp-${srv.name}`];
                return (
                  <div
                    key={srv.name}
                    onClick={() => setExpandedItems((p) => ({ ...p, [`mcp-${srv.name}`]: !p[`mcp-${srv.name}`] }))}
                    className="flex flex-col p-3 rounded-xl border border-border/60 bg-background/50 text-xs gap-1.5 hover:border-primary/20 transition-all duration-150 cursor-pointer text-left"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-0" : "-rotate-90"}`} />
                        <span className="font-bold text-foreground">{srv.name}</span>
                        <span className="text-[9px] font-mono font-bold bg-secondary px-1.5 py-0.5 rounded text-muted-foreground uppercase">
                          {srv.type}
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Active state</span>
                        <Switch checked={srv.enabled} onCheckedChange={() => handleToggleMcp(srv.name, !srv.enabled)} />
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
                        <div className="flex items-center gap-2 pt-2 mt-2 border-t border-border/10" onClick={(e) => e.stopPropagation()}>
                          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider shrink-0">Registered in:</span>
                          {["OpenCode", "ClaudeCode", "AGY"].map((a) => {
                            const registered = srv.agents.includes(a);
                            return (
                              <button
                                key={a}
                                onClick={() => handleToggleMcpAgent(srv, a)}
                                className={`inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded border cursor-pointer transition-all duration-150 hover:opacity-80 ${
                                  registered
                                    ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                                    : "border-border/40 text-muted-foreground/60 bg-secondary/20 hover:border-amber-500/30 hover:text-amber-400 hover:bg-amber-500/10"
                                }`}
                                title={registered ? `Click to unregister from ${a}` : `Click to register on ${a}`}
                              >
                                {a} {registered ? "Yes" : "No"}
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" className="h-7 text-[10px] rounded-lg px-2" onClick={() => openEditMcp(srv)}>
                            Edit
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-[10px] rounded-lg px-2 text-destructive hover:bg-destructive/10" onClick={() => handleDeleteMcp(srv.name)}>
                            Delete
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic text-center py-8 border border-dashed border-border rounded-xl">
              No MCP servers in this project yet. Click Add Server to register one.
            </p>
          )}
        </TabsContent>

        {/* ── Skills Tab ───────────────────────────────────────────── */}
        <TabsContent value="skills" className="space-y-3 mt-0">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">Project Skills</h2>
            <Button onClick={() => { setEditingSkill(null); setIsAddingSkill(true); }} variant="primary" size="sm" className="rounded-xl gap-1.5">
              <Plus className="h-4 w-4" /> Add Skill
            </Button>
          </div>

          {!config?.isAdopted ? (
            <p className="text-xs text-muted-foreground italic text-center py-8 border border-dashed border-border rounded-xl">
              Adopt this project first to manage skills.
            </p>
          ) : config.skills.length > 0 ? (
            <div className="space-y-2">
              {config.skills.map((sk) => {
                const isExpanded = !!expandedItems[`skill-${sk.id}`];
                return (
                  <div
                    key={sk.id}
                    onClick={() => setExpandedItems((p) => ({ ...p, [`skill-${sk.id}`]: !p[`skill-${sk.id}`] }))}
                    className="flex flex-col p-3 rounded-xl border border-border/60 bg-background/50 text-xs gap-1.5 hover:border-primary/20 transition-all duration-150 cursor-pointer text-left"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-0" : "-rotate-90"}`} />
                        <span className="font-bold text-foreground capitalize">{sk.name}</span>
                        <span className="text-[9px] font-mono font-bold bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">{sk.id}</span>
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <Switch checked={sk.enabled} onCheckedChange={() => handleToggleSkill(sk.id, !sk.enabled)} />
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-1 space-y-1.5 border-t border-border/20 pt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                        <p className="text-[11px] text-muted-foreground leading-relaxed">{sk.description}</p>
                        <div className="text-[9px] font-mono text-muted-foreground/80 break-all bg-secondary/20 p-1.5 rounded border border-border/10">
                          Path: {sk.path}
                        </div>
                        <div className="flex items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" className="h-7 text-[10px] rounded-lg px-2 text-destructive hover:bg-destructive/10" onClick={() => handleDeleteSkill(sk.id)}>
                            Delete
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic text-center py-8 border border-dashed border-border rounded-xl">
              No skills in this project yet. Click Add Skill to create one.
            </p>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Adoption Preview Dialog ────────────────────────────────── */}
      <MorphingModal viewId={showAdoptDialog ? "adopt-preview" : null} onClose={() => setShowAdoptDialog(false)} placement="center" className="max-w-lg">
        <div className="flex items-center justify-between pb-4 border-b border-border/60">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" />
            Unify Project
          </h3>
          <button onClick={() => setShowAdoptDialog(false)} className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="py-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            UAC will unify your agent configuration for <span className="font-mono font-semibold text-foreground">{projectPath.split("/").pop()}</span>.
          </p>

          {/* Detected Agents */}
          {preview && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Detected Agents</h4>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "OpenCode", label: "OpenCode", color: "violet" },
                  { id: "ClaudeCode", label: "Claude Code", color: "amber" },
                  { id: "AGY", label: "Antigravity", color: "emerald" },
                ].map((a) => {
                  const detected = preview.detectedAgents.includes(a.id);
                  return (
                    <div key={a.id} className={`flex flex-col items-center p-2.5 rounded-xl border text-center gap-1 ${
                      detected
                        ? `border-${a.color}-500/30 bg-${a.color}-500/5`
                        : "border-border/40 bg-secondary/20 opacity-40"
                    }`}>
                      <span className={`text-xs font-bold ${detected ? "text-foreground" : "text-muted-foreground"}`}>{a.label}</span>
                      {detected ? (
                        <span className="text-[10px] text-emerald-400 font-semibold">Detected</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">Not found</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Existing MCPs */}
              {(preview.opencodeMcpCount > 0 || preview.claudecodeMcpCount > 0 || preview.agyMcpCount > 0) && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Existing MCP Servers</h4>
                  <div className="flex flex-col gap-1 text-xs">
                    {preview.opencodeMcpCount > 0 && (
                      <span className="text-muted-foreground">OpenCode: <span className="font-semibold text-foreground">{preview.opencodeMcpCount}</span> server{preview.opencodeMcpCount !== 1 ? "s" : ""}</span>
                    )}
                    {preview.claudecodeMcpCount > 0 && (
                      <span className="text-muted-foreground">Claude Code: <span className="font-semibold text-foreground">{preview.claudecodeMcpCount}</span> server{preview.claudecodeMcpCount !== 1 ? "s" : ""}</span>
                    )}
                    {preview.agyMcpCount > 0 && (
                      <span className="text-muted-foreground">Antigravity: <span className="font-semibold text-foreground">{preview.agyMcpCount}</span> server{preview.agyMcpCount !== 1 ? "s" : ""}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Existing Skills */}
              {preview.existingSkills.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Existing Skills</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {preview.existingSkills.map((s) => (
                      <span key={s} className="text-[10px] font-mono font-semibold bg-secondary px-2 py-0.5 rounded-md text-muted-foreground border border-border/40">{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Nothing found */}
              {preview.opencodeMcpCount === 0 && preview.claudecodeMcpCount === 0 && preview.agyMcpCount === 0 && preview.existingSkills.length === 0 && (
                <div className="p-3 rounded-xl border border-border/40 bg-secondary/20">
                  <p className="text-xs text-muted-foreground text-center">
                    No MCP servers or skills found in this project yet. You can add them after unifying.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* What will happen */}
          <div className="p-3 rounded-xl border border-primary/20 bg-primary/5 space-y-1.5">
            <h4 className="text-xs font-bold text-primary uppercase tracking-wider">What happens</h4>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>Creates <code className="text-foreground">.uac/skills/</code> and moves existing skills there</li>
              <li>Replaces <code className="text-foreground">.opencode/skills</code>, <code className="text-foreground">.claude/skills</code>, <code className="text-foreground">.agents/skills</code> with symlinks to the unified location</li>
              <li>Syncs MCP entries across <code className="text-foreground">.opencode/opencode.json</code>, <code className="text-foreground">.mcp.json</code>, and <code className="text-foreground">.agents/mcp_config.json</code></li>
              <li>Adds the three symlinks to <code className="text-foreground">.gitignore</code></li>
            </ul>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/40">
          <Button variant="outline" size="sm" onClick={() => setShowAdoptDialog(false)} className="rounded-lg h-9 px-4">
            Not Now
          </Button>
          <Button variant="primary" size="sm" onClick={handleAdopt} disabled={isAdopting} className="rounded-lg h-9 px-4 gap-1.5">
            {isAdopting ? (
              <>
                <Loader variant="helix" size={14} className="text-primary-foreground" />
                Unifying...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Unify
              </>
            )}
          </Button>
        </div>
      </MorphingModal>

      {/* ── Add/Edit MCP Modal ─────────────────────────────────────── */}
      <MorphingModal viewId={isAddingMcp ? "add-mcp" : null} onClose={() => { setIsAddingMcp(false); setEditingMcp(null); }} placement="center" className="max-w-md">
        <div className="flex items-center justify-between pb-4 border-b border-border/60">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Cpu className="h-5 w-5 text-primary" />
            {editingMcp ? "Edit MCP Server" : "Register MCP Server"}
          </h3>
          <button onClick={() => { setIsAddingMcp(false); setEditingMcp(null); }} className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleRegisterNewMcp} className="space-y-4 pt-4 text-left">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Server Name</label>
            <input required placeholder="e.g. postgres-mcp" value={newMcpName} onChange={(e) => setNewMcpName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</label>
            <select value={newMcpType} onChange={(e) => setNewMcpType(e.target.value as "command" | "remote")}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all">
              <option value="command">Command (stdio)</option>
              <option value="remote">Remote (HTTP/SSE)</option>
            </select>
          </div>

          {newMcpType === "command" ? (
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1 space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Command</label>
                <input required placeholder="e.g. npx" value={newMcpCommand} onChange={(e) => setNewMcpCommand(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Arguments</label>
                <input placeholder="e.g. -y @modelcontextprotocol/server-postgres" value={newMcpArgs} onChange={(e) => setNewMcpArgs(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Server URL</label>
              <input required placeholder="e.g. https://mcp.example.com/sse" value={newMcpUrl} onChange={(e) => setNewMcpUrl(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Environment Variables (comma separated KEY=VAL)</label>
            <input placeholder="e.g. API_KEY=abc, DB_PATH=/tmp" value={newMcpEnv} onChange={(e) => setNewMcpEnv(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/40 mt-6">
            <Button type="button" variant="outline" size="sm" onClick={() => { setIsAddingMcp(false); setEditingMcp(null); }} className="rounded-lg h-9 px-4">
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" className="rounded-lg h-9 px-4">
              {editingMcp ? "Update" : "Register"}
            </Button>
          </div>
        </form>
      </MorphingModal>

      {/* ── Add Skill Modal ────────────────────────────────────────── */}
      <MorphingModal viewId={isAddingSkill ? "add-skill" : null} onClose={() => { setIsAddingSkill(false); setEditingSkill(null); }} placement="center" className="max-w-lg">
        <div className="flex items-center justify-between pb-4 border-b border-border/60">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {editingSkill ? "Edit Skill" : "Add Skill"}
          </h3>
          <button onClick={() => { setIsAddingSkill(false); setEditingSkill(null); }} className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleCreateSkill} className="space-y-4 pt-4 text-left">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Skill ID</label>
              <input required placeholder="e.g. postgres-helper" value={newSkillId} onChange={(e) => setNewSkillId(e.target.value)}
                disabled={!!editingSkill}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:opacity-50" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Display Name</label>
              <input required placeholder="e.g. Postgres Helper" value={newSkillName} onChange={(e) => setNewSkillName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description</label>
            <input placeholder="Short description of what this skill does" value={newSkillDesc} onChange={(e) => setNewSkillDesc(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Skill Body (Markdown)</label>
            <textarea value={newSkillBody} onChange={(e) => setNewSkillBody(e.target.value)}
              placeholder="# Skill Instructions&#10;&#10;Write the instructions here..."
              className="w-full h-48 px-3 py-2 text-sm rounded-lg border border-border bg-background/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none font-mono" />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/40 mt-6">
            <Button type="button" variant="outline" size="sm" onClick={() => { setIsAddingSkill(false); setEditingSkill(null); }} className="rounded-lg h-9 px-4">
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" className="rounded-lg h-9 px-4">
              {editingSkill ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </MorphingModal>
    </div>
  );
}
