import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";

interface PlatformInfo {
  os: string;
  windowManager: string;
}

export function WindowControls() {
  const [info, setInfo] = useState<PlatformInfo | null>(null);

  useEffect(() => {
    invoke<PlatformInfo>("get_platform_info")
      .then((data) => setInfo(data))
      .catch((err) => console.error("Failed to get platform info:", err));
  }, []);

  if (!info || info.os !== "linux") {
    return null;
  }

  const appWindow = getCurrentWindow();
  const isHyprland = info.windowManager === "hyprland";

  const handleDoubleClick = () => {
    if (!isHyprland) {
      appWindow.toggleMaximize().catch((err) =>
        console.error("Failed to toggle maximize:", err)
      );
    }
  };

  return (
    <header
      className="flex h-10 w-full items-center justify-end px-4 border-b border-border bg-sidebar/30 backdrop-blur-md select-none transition-colors duration-200"
      data-tauri-drag-region
      onDoubleClick={handleDoubleClick}
    >
      <div className="flex items-center gap-1.5">
        {!isHyprland && (
          <>
            <button
              type="button"
              onClick={() => appWindow.minimize().catch(console.error)}
              className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-150 active:scale-95"
              aria-label="Minimize"
              title="Minimize"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => appWindow.toggleMaximize().catch(console.error)}
              className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-150 active:scale-95"
              aria-label="Maximize"
              title="Maximize"
            >
              <Square className="h-3 w-3" />
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => appWindow.close().catch(console.error)}
          className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-destructive hover:text-destructive-foreground text-muted-foreground transition-all duration-150 active:scale-95"
          aria-label="Close"
          title="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}
