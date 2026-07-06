import { User, LayoutGrid, Settings } from "lucide-react";
import { Button } from "@/components/motion/button/base";
import { ThemeToggle } from "@/components/motion/theme-toggle";

interface SidebarProps {
  currentView: "dashboard" | "settings";
  onViewChange: (view: "dashboard" | "settings") => void;
}

export function Sidebar({ currentView, onViewChange }: SidebarProps) {
  return (
    <aside className="fixed left-0 top-0 z-10 flex h-screen w-64 flex-col border-r bg-sidebar p-4 justify-between">
      <div className="flex flex-col gap-6">
        {/* Brand header */}
        <div className="flex items-center gap-2.5 px-2 py-1">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-black text-sm">
            U
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground leading-none">Unified Control</h1>
            <p className="text-[10px] text-muted-foreground mt-0.5">Global Agent Manager</p>
          </div>
        </div>

        {/* Navigation list */}
        <nav className="flex flex-col gap-1.5">
          <Button
            variant={currentView === "dashboard" ? "primary" : "ghost"}
            size="md"
            onClick={() => onViewChange("dashboard")}
            className="w-full justify-start gap-2.5 px-4 rounded-xl h-10 text-sm"
          >
            <LayoutGrid className="h-4 w-4" />
            Dashboard
          </Button>

          <Button
            variant={currentView === "settings" ? "primary" : "ghost"}
            size="md"
            onClick={() => onViewChange("settings")}
            className="w-full justify-start gap-2.5 px-4 rounded-xl h-10 text-sm"
          >
            <Settings className="h-4 w-4" />
            Global Config
          </Button>
        </nav>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="secondary" size="md" className="flex-1 gap-2 rounded-xl bg-background border-border">
          <User className="h-4 w-4" />
          Profiles
        </Button>
        <ThemeToggle
          variant="rectangle"
          start="bottom-up"
          className="rounded-xl border border-border bg-background p-2.5"
          iconClassName="h-5 w-5"
        />
      </div>
    </aside>
  );
}
