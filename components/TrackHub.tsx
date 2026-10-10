"use client";
import { useEffect, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Row = { id: string; slug: string; title: string; level: number };
type Data = { rows: Row[]; done: Set<string> };

const note = (text: string, err = false) => (
  <p className={`py-12 text-center text-sm ${err ? "text-red-400" : "text-zinc-500"}`}>{text}</p>
);

export default function TrackHub({
  track, uid, onStart,
}: {
  track: { id: string; name: string } | null;
  uid: string | null;
  onStart: (slug: string) => void;
}) {
  const [data, setData] = useState<Data | null>(null); // null = loading
  const [error, setError] = useState<string | null>(null);
  const id = track?.id;

  // Mounts fresh every time you come back from the IDE, so completion badges are always current.
  useEffect(() => {
    if (!uid || !id) return;
    let stale = false;
    setData(null);
    setError(null);
    (async () => {
      const [c, s] = await Promise.all([
        supabase.from("challenges").select("id,slug,title,level").eq("language", id).order("level").order("title"),
        supabase.from("submissions").select("challenge_id").eq("status", "passed"),
      ]);
      if (stale) return;
      const err = c.error ?? s.error;
      if (err) return setError(err.message);
      setData({
        rows: (c.data ?? []) as Row[],
        done: new Set((s.data ?? []).map((r: { challenge_id: string }) => r.challenge_id)),
      });
    })();
    return () => { stale = true; };
  }, [uid, id]);

  const rows = data?.rows ?? [];
  const finished = data ? rows.filter((r) => data.done.has(r.id)).length : 0;
  const pending = data ? rows.filter((r) => !data.done.has(r.id)) : [];
  // Current level = lowest level that still has an unfinished challenge (top level once all are done).
  const level = pending.length
    ? Math.min(...pending.map((r) => r.level))
    : rows.length ? Math.max(...rows.map((r) => r.level)) : 1;
  const pct = rows.length ? Math.round((finished / rows.length) * 100) : 0;

  return (
    <main className="min-h-0 min-w-0 overflow-auto bg-[#101012] p-8">
      <div className="mx-auto max-w-5xl">
        {track && (
          <header className="mb-8">
            <h1 className="text-xl font-semibold tracking-tight text-zinc-100">{track.name}</h1>
            {data && rows.length > 0 && (
              <>
                <p className="mt-1 font-mono text-xs text-zinc-500">
                  Level {level} · {finished} of {rows.length} completed
                </p>
                <div className="mt-4 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-white/[0.08]">
                  <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                </div>
              </>
            )}
          </header>
        )}

        {!track ? note("Select a track in the sidebar.")
          : error ? note("Error: " + error, true)
          : !data ? note("Loading…")
          : !rows.length ? note(`No challenges in ${track.name} yet.`)
          : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-3">
              {rows.map((r) => {
                const ok = data.done.has(r.id);
                return (
                  <article
                    key={r.id}
                    className="flex flex-col gap-5 rounded-xl border border-white/[0.08] bg-[#1f1f23] p-5 shadow-lg shadow-black/30"
                  >
                    <div className="flex items-center justify-between">
                      <span className="rounded-md bg-white/[0.05] px-1.5 py-0.5 font-mono text-[0.6875rem] text-zinc-400">
                        Level {r.level}
                      </span>
                      <span
                        className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ${
                          ok ? "bg-indigo-500/15 text-indigo-300" : "bg-white/[0.05] text-zinc-400"
                        }`}
                      >
                        {ok && <Check size={11} strokeWidth={2.5} />}
                        {ok ? "Completed" : "Incomplete"}
                      </span>
                    </div>
                    <h2 className="text-[0.9375rem] font-medium tracking-tight text-zinc-100">{r.title}</h2>
                    <button
                      onClick={() => onStart(r.slug)}
                      className="mt-auto flex w-fit items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-zinc-200 transition-[transform,background-color] hover:bg-white/[0.08] active:scale-[0.97] motion-reduce:transition-none"
                    >
                      Start Challenge
                      <ArrowRight size={12} strokeWidth={2} />
                    </button>
                  </article>
                );
              })}
            </div>
          )}
      </div>
    </main>
  );
}