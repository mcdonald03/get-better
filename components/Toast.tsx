"use client";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type Item = { id: number; text: string; error: boolean };

const Ctx = createContext<(text: string, error?: boolean) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const seq = useRef(0);

  // Stable identity, so effects that depend on it never re-fire.
  const toast = useCallback((text: string, error = false) => {
    const id = ++seq.current;
    // Same text replaces the old toast instead of stacking; at most 3 on screen.
    setItems((l) => [...l.filter((t) => t.text !== text), { id, text, error }].slice(-3));
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), 3500);
  }, []);

  return (
    <Ctx.Provider value={toast}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className="fade-in flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-[#1f1f23] px-4 py-2.5 text-sm text-zinc-200 shadow-lg shadow-black/30"
          >
            <span className={`size-1.5 shrink-0 rounded-full ${t.error ? "bg-red-400" : "bg-indigo-400"}`} />
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}