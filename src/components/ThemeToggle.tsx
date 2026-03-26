import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";

function getInitialTheme(): "dark" | "light" {
    const stored = localStorage.getItem("ecscope-theme");
    if (stored === "light" || stored === "dark") return stored;
    return "dark";
}

export function ThemeToggle() {
    const [theme, setTheme] = useState<"dark" | "light">(getInitialTheme);

    useEffect(() => {
        document.documentElement.classList.toggle("dark", theme === "dark");
        localStorage.setItem("ecscope-theme", theme);
    }, [theme]);

    // Set initial class on mount
    useEffect(() => {
        document.documentElement.classList.toggle("dark", getInitialTheme() === "dark");
    }, []);

    return (
        <button
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
        >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
    );
}
