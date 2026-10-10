export type View = "hub" | "today" | "sprints" | "notes" | "progress";

export const LANG: Record<string, string> = { js: "JavaScript", py: "Python", cpp: "C++" };

// Languages that can actually execute in the browser today.
// JavaScript runs in a Web Worker, Python via Pyodide. C++ still needs a server-side sandbox.
export const RUNNABLE = ["js", "py"];

// Modifier key label for shortcut hints. Only render it in client-only UI
// (Playground, ShortcutsModal), never in anything server-rendered, or hydration will complain.
export const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl";