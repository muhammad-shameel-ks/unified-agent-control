import { invoke } from "@tauri-apps/api/core";
import type { McpServerPayload } from "./mcpActions";

export interface ProjectMcpEntry {
  name: string;
  type: string;
  url?: string;
  command?: string[];
  env?: any;
  enabled: boolean;
  agents: string[];
}

export interface ProjectSkillEntry {
  id: string;
  name: string;
  description: string;
  path: string;
  enabled: boolean;
}

export interface ProjectConfig {
  projectRoot: string;
  isAdopted: boolean;
  uacSkillsDir: string;
  mcpServers: ProjectMcpEntry[];
  skills: ProjectSkillEntry[];
}

export async function getProjectConfig(root: string): Promise<ProjectConfig> {
  return invoke<ProjectConfig>("get_project_config", { projectRoot: root });
}

export async function adoptProject(root: string): Promise<string> {
  return invoke<string>("adopt_project", { projectRoot: root });
}

export async function upsertProjectMcp(root: string, srv: McpServerPayload): Promise<void> {
  await invoke("upsert_project_mcp", {
    projectRoot: root,
    payload: {
      name: srv.name,
      type: srv.type,
      url: srv.url,
      command: srv.command,
      env: srv.env,
      headers: srv.headers,
      enabled: srv.enabled ?? true,
    },
  });
}

export async function removeProjectMcp(root: string, name: string): Promise<void> {
  await invoke("remove_project_mcp", { projectRoot: root, name });
}

export async function toggleProjectMcpAgent(
  root: string,
  name: string,
  agent: string,
  srv: McpServerPayload
): Promise<void> {
  await invoke("toggle_project_mcp_agent", {
    projectRoot: root,
    name,
    agent,
    payload: {
      name: srv.name,
      type: srv.type,
      url: srv.url,
      command: srv.command,
      env: srv.env,
      headers: srv.headers,
      enabled: srv.enabled ?? true,
    },
  });
}

export async function toggleProjectSkill(root: string, id: string, enabled: boolean): Promise<void> {
  await invoke("toggle_project_skill", { projectRoot: root, id, enabled });
}

export async function createProjectSkill(
  root: string,
  id: string,
  name: string,
  description: string,
  body: string
): Promise<void> {
  await invoke("create_project_skill", { projectRoot: root, id, name, description, body });
}

export async function updateProjectSkill(
  root: string,
  id: string,
  name: string,
  description: string,
  body: string
): Promise<void> {
  await invoke("update_project_skill", { projectRoot: root, id, name, description, body });
}

export async function deleteProjectSkill(root: string, id: string): Promise<void> {
  await invoke("delete_project_skill", { projectRoot: root, id });
}

// ── Saved Projects List ──────────────────────────────────────────────

export interface SavedProject {
  id: string;
  name: string;
  path: string;
  detectedAgents: string[];
  uacAdopted: boolean;
}

export async function getSavedProjects(): Promise<SavedProject[]> {
  return invoke<SavedProject[]>("get_saved_projects");
}

export async function addSavedProject(path: string): Promise<SavedProject> {
  return invoke<SavedProject>("add_saved_project", { path });
}

export async function removeSavedProject(path: string): Promise<void> {
  await invoke("remove_saved_project", { path });
}

export async function scanDirectoryForProjects(dirPath: string): Promise<SavedProject[]> {
  return invoke<SavedProject[]>("scan_directory_for_projects", { dirPath });
}

// ── Project Adoption Preview ─────────────────────────────────────────

export interface ProjectPreview {
  projectRoot: string;
  detectedAgents: string[];
  opencodeMcpCount: number;
  claudecodeMcpCount: number;
  agyMcpCount: number;
  existingSkills: string[];
  isAdopted: boolean;
}

export async function getProjectPreview(root: string): Promise<ProjectPreview> {
  return invoke<ProjectPreview>("get_project_preview", { projectRoot: root });
}
