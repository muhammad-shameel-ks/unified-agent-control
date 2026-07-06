import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { ThemeProvider } from "@/components/theme-provider";

// Prevent dragging images and links
document.addEventListener("dragstart", (e) => {
  const target = e.target as HTMLElement;
  if (target && (target.tagName === "IMG" || target.tagName === "A")) {
    e.preventDefault();
  }
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
