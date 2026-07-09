import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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

    // Listen for second-instance path pushes (single-instance plugin)
    const unlisten = listen<string>("cli-path-changed", (event) => {
      const p = event.payload;
      if (p) {
        setActiveProjectPath(p);
        setCurrentView("projects");
        addSavedProject(p).catch(() => {});
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />
      <main className="ml-64 flex flex-1 flex-col h-screen overflow-hidden">
        <WindowControls />
        {currentView === "dashboard" ? (
          <Dashboard
            onNavigateToSettings={() => setCurrentView("settings")}
            onOpenProject={(path) => { setActiveProjectPath(path); setCurrentView("projects"); }}
          />
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
