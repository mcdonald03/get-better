"use client";
import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { RUNNABLE } from "@/lib/app";

type Stats = Record<string, { solved: number; total: number }>;

const card = "rounded-xl border border-white/[0.08] bg-[#1f1f23] p-5 shadow-lg shadow-black/30";
const label = "text-[0.6875rem] font-medium uppercase tracking-wider text-zinc-500";

export default function ProgressHub({
  uid, tracks, streak,
}: { uid: string | null; tracks: { id: string; name: string }[]; streak: number }) {
  const [stats, setStats] = useState<Stats | null>(null); // null = loading
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    let stale = false;
    (async () => {
      const [c, s] = await Promise.all([
        supabase.from("challenges").select("id,language"),
        supabase.from("submissions").select("challenge_id").eq("status", "passed"),
      ]);
      if (stale) return;
      const err = c.error ?? s.error;
      if (err) return setError(err.message);
      const done = new Set((s.data ?? []).map((r: { challenge_id: string }) => r.challenge_id));
      const out: Stats = {};
      for (const r of (c.data ?? []) as { id: string; language: string }[]) {
        const e = (out[r.language] ??= { solved: 0, total: 0 });
        e.total++;
        if (done.has(r.id)) e.solved++;
      }
      setStats(out);
    })();
    return () => { stale = true; };
  }, [uid]);

  const solved = stats ? Object.values(stats).reduce((n, v) => n + v.solved, 0) : 0;
  const total = stats ? Object.values(stats).reduce((n, v) => n + v.total, 0) : 0;

  return (
    <main className="min-h-0 min-w-0 overflow-auto bg-[#101012] p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-8 text-xl font-semibold tracking-tight text-zinc-100">Progress</h1>

        {error ? (
          <p className="py-12 text-center text-sm text-red-400">Error: {error}</p>
        ) : !uid || !stats ? (
          <p className="py-12 text-center text-sm text-zinc-500">Loading…</p>
        ) : solved === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/[0.1] bg-[#1f1f23]/40 px-6 py-14 text-center">
            <TrendingUp size={20} strokeWidth={1.75} className="mb-1 text-zinc-500" />
            <p className="text-sm font-medium text-zinc-300">Nothing solved yet</p>
            <p className="max-w-xs text-sm leading-relaxed text-zinc-500">
              Pass your first challenge and your solved count, streak and language breakdown show up here.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-2 gap-3">
              <div className={card}>
                <p className={label}>Solved</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-100">{solved}</p>
                <p className="mt-1 text-xs text-zinc-500">of {total} challenges</p>
              </div>
              <div className={card}>
                <p className={label}>Current streak</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-100">{streak}</p>
                <p className="mt-1 text-xs text-zinc-500">{streak === 1 ? "day" : "days"}</p>
              </div>
            </div>

            <div className={card}>
              <p className={`${label} mb-4`}>By language</p>
              <div className="space-y-5">
                {tracks.map((t) => {
                  const v = stats[t.id] ?? { solved: 0, total: 0 };
                  const pct = v.total ? Math.round((v.solved / v.total) * 100) : 0;
                  return (
                    <div key={t.id}>
                      <div className="mb-2 flex items-baseline justify-between text-sm">
                        <span className="text-zinc-200">
                          {t.name}
                          {!RUNNABLE.includes(t.id) && (
                            <span className="ml-2 text-xs text-zinc-500">can&apos;t be submitted yet</span>
                          )}
                        </span>
                        <span className="font-mono text-xs text-zinc-400">{v.solved} / {v.total}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}