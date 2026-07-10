import { invoke } from "@tauri-apps/api/core";

export interface RevertAgentStatus {
  ok: string | null;
  error: string | null;
}

export interface RevertReport {
  opencode: RevertAgentStatus;
  claudecode: RevertAgentStatus;
  agy: RevertAgentStatus;
}

export async function revertGlobalConfig(): Promise<RevertReport> {
  return invoke<RevertReport>("revert_global_config");
}

export function hasAnySymlink(report: RevertReport | null): boolean {
  if (!report) return false;
  return Boolean(report.opencode.ok || report.claudecode.ok || report.agy.ok);
}
