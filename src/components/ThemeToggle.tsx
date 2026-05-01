import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";
import { useConfigStore } from "@/store/config";

function getInitialTheme(configDefault: "dark" | "light"): "dark" | "light" {
    const stored = localStorage.getItem("ecscope-theme");
    if (stored === "light" || stored === "dark") return stored;
    return configDefault;
}

export function ThemeToggle() {
    const configTheme = useConfigStore((s) => s.theme);
    const [theme, setTheme] = useState<"dark" | "light">(() => getInitialTheme(configTheme));

    useEffect(() => {
        document.documentElement.classList.toggle("dark", theme === "dark");
        localStorage.setItem("ecscope-theme", theme);
    }, [theme]);

    return (
        <button
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
    );
}
