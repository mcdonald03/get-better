"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, NotebookPen } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Row = {
  challenge_id: string;
  content: string;
  updated_at: string;
  challenges: { title: string; slug: string; language: string };
};

const saveNote = (uid: string, challengeId: string, content: string) =>
  supabase.from("notes").upsert(
    { user_id: uid, challenge_id: challengeId, content, updated_at: new Date().toISOString() },
    { onConflict: "user_id,challenge_id" },
  );

function NoteCard({ row, uid, onOpen }: { row: Row; uid: string; onOpen: (slug: string, lang: string) => void }) {
  const [text, setText] = useState(row.content);
  const [status, setStatus] = useState<"" | "saving" | "saved" | "error">("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<string | null>(null); // unsaved text, flushed if you leave within the debounce window
  const cid = row.challenge_id;

  useEffect(() => () => {
    clearTimeout(timer.current);
    if (pending.current !== null) saveNote(uid, cid, pending.current).then(() => {});
  }, [uid, cid]);

  const edit = (v: string) => {
    setText(v);
    setStatus("saving");
    pending.current = v;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const { error } = await saveNote(uid, cid, v);
      if (!error) pending.current = null;
      setStatus(error ? "error" : "saved");
    }, 800);
  };

  const c = row.challenges;
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-[#1f1f23] p-4 shadow-lg shadow-black/30">
      <div className="flex items-center justify-between gap-3">
        <h2 className="truncate text-[0.9375rem] font-medium tracking-tight text-zinc-100">{c.title}</h2>
        <span className={`shrink-0 text-xs ${status === "error" ? "text-red-400" : "text-zinc-500"}`}>
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Not saved" : ""}
        </span>
      </div>
      <textarea
        value={text}
        onChange={(e) => edit(e.target.value)}
        rows={6}
        className="w-full resize-y rounded-lg border border-white/[0.06] bg-black/20 p-3 font-mono text-xs leading-relaxed text-zinc-200 outline-none focus:border-white/[0.16]"
      />
      <div className="flex items-center justify-between">
        <span className="font-mono text-[0.6875rem] text-zinc-500">
          {new Date(row.updated_at).toLocaleDateString()}
        </span>
        <button
          onClick={() => onOpen(c.slug, c.language)}
          className="flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1 text-xs font-medium text-zinc-200 transition-[transform,background-color] hover:bg-white/[0.08] active:scale-[0.97] motion-reduce:transition-none"
        >
          Open challenge
          <ArrowRight size={12} strokeWidth={2} />
        </button>
      </div>
    </article>
  );
}

export default function NotesHub({
  uid, tracks, onOpen,
}: {
  uid: string | null;
  tracks: { id: string; name: string }[];
  onOpen: (slug: string, lang: string) => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null); // null = loading
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    let stale = false;
    (async () => {
      const { data, error } = await supabase
        .from("notes")
        .select("challenge_id,content,updated_at,challenges(title,slug,language)")
        .neq("content", "")
        .order("updated_at", { ascending: false });
      if (stale) return;
      if (error) return setError(error.message);
      setRows(((data ?? []) as unknown as Row[]).filter((r) => r.challenges));
    })();
    return () => { stale = true; };
  }, [uid]);

  return (
    <main className="min-h-0 min-w-0 overflow-auto bg-[#101012] p-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-8 text-xl font-semibold tracking-tight text-zinc-100">My Notes</h1>

        {error ? (
          <p className="py-12 text-center text-sm text-red-400">Error: {error}</p>
        ) : !uid || !rows ? (
          <p className="py-12 text-center text-sm text-zinc-500">Loading…</p>
        ) : (
          tracks.map((t) => {
            const items = rows.filter((r) => r.challenges.language === t.id);
            return (
              <section key={t.id} className="mb-8">
                <h2 className="mb-3 text-[0.6875rem] font-medium uppercase tracking-wider text-zinc-500">{t.name}</h2>
                {items.length ? (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-3">
                    {items.map((r) => (
                      <NoteCard key={r.challenge_id} row={r} uid={uid} onOpen={onOpen} />
                    ))}
                  </div>
                ) : (
                  <div className="flex items-start gap-3 rounded-xl border border-dashed border-white/[0.1] bg-[#1f1f23]/40 p-5">
                    <NotebookPen size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-zinc-500" />
                    <p className="text-sm leading-relaxed text-zinc-500">
                      No notes for {t.name} yet. Jot down takeaways inside any challenge workspace.
                    </p>
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>
    </main>
  );
}