import { Sidebar } from "@/layout/Sidebar";
import { MainPanel } from "@/layout/MainPanel";
import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export default function App() {
  useEffect(() => {
    getCurrentWindow().setTitle(`ECScope ${__APP_VERSION__}`);
  }, []);

  return (
    <div className="flex h-screen w-screen">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        <MainPanel />
      </main>
    </div>
  );
}
