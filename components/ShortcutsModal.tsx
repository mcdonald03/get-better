"use client";
import { useEffect, useRef } from "react";
import { MOD } from "@/lib/app";

const rows: [string, string[]][] = [
  ["Run code", [MOD, "↵"]],
  ["Submit and run tests", [MOD, "⇧", "↵"]],
  ["Toggle this sheet", [MOD, "/"]],
  ["Close", ["Esc"]],
];

export default function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fade-in fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onMouseDown={onClose}>
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-white/[0.08] bg-[#1f1f23] p-5 shadow-2xl shadow-black/50 outline-none"
      >
        <h2 className="mb-4 text-sm font-medium tracking-tight text-zinc-100">Keyboard shortcuts</h2>
        <ul className="space-y-3">
          {rows.map(([label, keys]) => (
            <li key={label} className="flex items-center justify-between text-sm text-zinc-400">
              {label}
              <span className="flex gap-1">
                {keys.map((k) => (
                  <kbd
                    key={k}
                    className="min-w-6 rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-center font-mono text-[0.6875rem] text-zinc-300"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}