import { Sidebar } from "@/layout/Sidebar";
import { MainPanel } from "@/layout/MainPanel";
import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useConfigStore } from "@/store/config";

export default function App() {
    const theme = useConfigStore((s) => s.theme);

    useEffect(() => {
        getCurrentWindow().setTitle(`ECScope ${__APP_VERSION__}`);
    }, []);

    useEffect(() => {
        document.documentElement.classList.toggle("dark", theme === "dark");
    }, [theme]);

    return (
        <div className="flex h-screen w-screen">
            <Sidebar />
            <main className="flex-1 overflow-hidden">
                <MainPanel />
            </main>
        </div>
    );
}
