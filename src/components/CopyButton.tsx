import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CopyButton({ text, title = "Copy value" }: { text: string; title?: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
            }}
            className="ml-1 inline-flex items-center rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            title={title}
        >
            {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
        </button>
    );
}
