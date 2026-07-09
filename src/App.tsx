import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Sidebar } from "@/components/sidebar";
import { WindowControls } from "@/components/window-controls";
import { Dashboard } from "@/components/dashboard";
import { GlobalSettings } from "@/components/global-settings";
import { ProjectView } from "@/components/project-view";
import { addSavedProject } from "@/lib/projectActions";

function App() {
  const [currentView, setCurrentView] = useState<"dashboard" | "settings" | "projects">("dashboard");
  const [activeProjectPath, setActiveProjectPath] = useState<string | null>(null);

  useEffect(() => {
    invoke<string | null>("get_cli_args").then((p) => {
      if (p) {
        setActiveProjectPath(p);
        setCurrentView("projects");
        addSavedProject(p).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />
      <main className="ml-64 flex flex-1 flex-col h-screen overflow-hidden">
        <WindowControls />
        {currentView === "dashboard" ? (
          <Dashboard onNavigateToSettings={() => setCurrentView("settings")} />
        ) : currentView === "projects" ? (
          <ProjectView
            projectPath={activeProjectPath ?? ""}
            onClearProject={() => { setActiveProjectPath(null); setCurrentView("dashboard"); }}
          />
        ) : (
          <GlobalSettings />
        )}
      </main>
    </div>
  );
}

export default App;
