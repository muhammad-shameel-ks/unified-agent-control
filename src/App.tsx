import { useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { WindowControls } from "@/components/window-controls";
import { Dashboard } from "@/components/dashboard";
import { GlobalSettings } from "@/components/global-settings";

function App() {
  const [currentView, setCurrentView] = useState<"dashboard" | "settings">("dashboard");

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />
      <main className="ml-64 flex flex-1 flex-col h-screen overflow-hidden">
        <WindowControls />
        {currentView === "dashboard" ? (
          <Dashboard onNavigateToSettings={() => setCurrentView("settings")} />
        ) : (
          <GlobalSettings />
        )}
      </main>
    </div>
  );
}

export default App;
