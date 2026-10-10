"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror, { EditorView, Prec } from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { cpp } from "@codemirror/lang-cpp";
import { Play, Check, ArrowLeft, Timer, RotateCcw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { buildReview, type Case, type Result, type Review } from "@/lib/review";
import { clearDraft, loadDraft, saveDraft } from "@/lib/draft";
import { LANG, MOD, RUNNABLE } from "@/lib/app";
import { preloadPython, runPython } from "@/lib/pyrunner";
import { useToast } from "@/components/Toast";

type Challenge = {
  id: string; language: string; slug: string; title: string; prompt: string;
  starter_code: string; level: number; test_cases: Case[]; lesson: string | null;
};

const SPRINT_SECONDS = 15 * 60;
const fmt = (v: unknown) => (v === undefined ? "undefined" : JSON.stringify(v));
const noRunner = (lang: string) =>
  `${LANG[lang] ?? lang} can't run in the browser yet, so Run and Submit are off and nothing is recorded as solved. Your draft still saves.`;

// JavaScript runner: user code runs off the main thread so an infinite loop can't freeze the page.
// With `cases` it runs tests instead and replies with one {ok, got} per case. (Python lives in lib/pyrunner.ts.)
const WORKER = `onmessage = e => {
  const { code, cases } = e.data;
  const fmt = v => (v === undefined ? "undefined" : JSON.stringify(v));
  if (cases) {
    postMessage(cases.map(c => {
      try {
        const got = new Function(code + "\\nreturn " + c.call)();
        return { ok: fmt(got) === fmt(c.expect), got: fmt(got) };
      } catch (err) { return { ok: false, got: "Error: " + err.message } }
    }));
    return;
  }
  console.log = (...a) => postMessage(a.map(String).join(" "));
  try { new Function(code)() } catch (err) { postMessage("Error: " + err.message) }
  postMessage(null);
}`;

// Editor chrome only; token colours still come from theme="dark".
const chrome = Prec.highest(
  EditorView.theme(
    {
      "&": { backgroundColor: "#0d0d0e", fontSize: "0.8125rem" },
      "&.cm-focused": { outline: "none" },
      ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.7" },
      ".cm-content": { padding: "12px 0" },
      ".cm-gutters": { backgroundColor: "#0d0d0e", color: "#52525b", border: "none" },
      ".cm-lineNumbers .cm-gutterElement": { padding: "0 12px 0 16px" },
      ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "rgb(255 255 255 / 0.03)" },
    },
    { dark: true },
  ),
);

const tabs = ["prompt", "notes", "review"] as const;

const card = "overflow-hidden rounded-xl border border-white/[0.08] shadow-lg shadow-black/30";
const seg = "flex gap-0.5 rounded-lg bg-black/30 p-0.5";
const segBtn = (on: boolean) =>
  `rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors motion-reduce:transition-none ${
    on ? "bg-white/[0.09] text-zinc-100 shadow-sm shadow-black/40" : "text-zinc-400 hover:text-zinc-200"
  }`;
const codeChip = "rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[0.8125rem] text-zinc-200";
const heading = "mb-2 mt-5 text-[0.6875rem] font-medium uppercase tracking-wider text-zinc-500";
// `x` in text renders as an inline code chip
const chips = (s: string) => s.split("`").map((p, i) => (i % 2 ? <code key={i} className={codeChip}>{p}</code> : p));

export default function Playground({
  uid, slug, sprint, backLabel, onBack, onSubmitted,
}: {
  uid: string | null; slug: string; sprint: boolean; backLabel: string;
  onBack: () => void; onSubmitted: () => void;
}) {
  const toast = useToast();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState("");
  const [out, setOut] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false); // true for the whole submit, so Back can't beat the DB write
  const [tab, setTab] = useState<(typeof tabs)[number]>("prompt");
  const [notes, setNotes] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [left, setLeft] = useState(SPRINT_SECONDS);
  const [frozen, setFrozen] = useState(false); // timer stops once the sprint challenge is passed
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const lang = challenge?.language;
  const canRun = !!challenge && RUNNABLE.includes(challenge.language);
  const langExt = useMemo(() => [lang === "py" ? python() : lang === "cpp" ? cpp() : javascript(), chrome], [lang]);

  useEffect(() => {
    if (!uid) return;
    let stale = false;
    setOut([]);
    setNotes("");
    setReview(null);
    setTab("prompt");
    (async () => {
      const { data, error } = await supabase.from("challenges").select("*").eq("slug", slug).single();
      if (stale) return;
      if (error) return setOut(["Error: " + error.message]);
      const c = data as Challenge;
      setChallenge(c);
      setCode(loadDraft(c.id) ?? c.starter_code); // saved draft wins over the stub
      if (c.language === "py") preloadPython(); // start the Pyodide download now so the first Run is fast
      if (!RUNNABLE.includes(c.language)) setOut([noRunner(c.language)]);
      const note = await supabase.from("notes").select("content").eq("challenge_id", c.id).maybeSingle();
      if (!stale && note.data) setNotes(note.data.content);
    })();
    return () => { stale = true; };
  }, [uid, slug]);

  // Sprint clock: resets on a new challenge / entering sprint mode, ticks once a second.
  useEffect(() => { setLeft(SPRINT_SECONDS); setFrozen(false); }, [sprint, slug]);
  useEffect(() => {
    if (!sprint || frozen) return;
    const id = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => clearInterval(id);
  }, [sprint, frozen]);
  useEffect(() => {
    if (sprint && !frozen && left === 120) toast("120s remaining");
  }, [sprint, frozen, left, toast]);

  const onCode = (v: string) => {
    setCode(v);
    if (challenge) saveDraft(challenge.id, v);
  };

  const reset = () => {
    if (!challenge || !window.confirm("Reset to the starter code? Your draft will be lost.")) return;
    clearDraft(challenge.id);
    setCode(challenge.starter_code);
  };

  // JavaScript: resolves to per-case results in test mode, otherwise null.
  const execJs = (payload: { code: string; cases?: Case[] }) =>
    new Promise<Result[] | null>((resolve) => {
      setOut([]);
      setRunning(true);
      const w = new Worker(URL.createObjectURL(new Blob([WORKER], { type: "text/javascript" })));
      const done = (r: Result[] | null) => { clearTimeout(t); w.terminate(); setRunning(false); resolve(r); };
      const t = setTimeout(() => { setOut((o) => [...o, "Error: timed out after 3s"]); done(null); }, 3000);
      w.onmessage = (e) =>
        Array.isArray(e.data) ? done(e.data) : e.data === null ? done(null) : setOut((o) => [...o, e.data]);
      w.onerror = (e) => { setOut((o) => [...o, "Error: " + e.message]); done(null); };
      w.postMessage(payload);
    });

  // Python via Pyodide: same contract as execJs.
  const execPy = async (payload: { code: string; cases?: Case[] }) => {
    setOut([]);
    setRunning(true);
    try {
      return await runPython(payload, {
        line: (l) => setOut((o) => [...o, l]),
        loading: () => setOut(["Loading Python… (the first run downloads about 10 MB)"]),
        loaded: () => setOut([]),
      });
    } finally {
      setRunning(false);
    }
  };

  const exec = (payload: { code: string; cases?: Case[] }) =>
    challenge?.language === "py" ? execPy(payload) : execJs(payload);

  const run = () => { if (!running && !saving && canRun) exec({ code }); };

  const submit = async () => {
    if (running || saving || !challenge || !uid || !canRun) return;
    setSaving(true);
    try {
      const cases = challenge.test_cases;
      const results = await exec({ code, cases });
      const ok = results !== null && results.every((r) => r.ok);
      const r = buildReview(code, results, cases, challenge.lesson, challenge.language);
      setOut((o) => [
        ...o,
        ...(results
          ? cases.map((c, i) =>
              results[i].ok
                ? `✓ Test ${i + 1} Passed: ${c.call}`
                : `✗ Test ${i + 1} Failed: ${c.call} — expected ${fmt(c.expect)} but got ${results[i].got}`,
            )
          : []),
        `${ok ? "Passed" : "Failed"} (${results ? results.filter((x) => x.ok).length : 0}/${cases.length})`,
      ]);
      setReview(r);
      setTab("review");
      if (ok) setFrozen(true);
      const { error } = await supabase
        .from("submissions")
        .insert({ challenge_id: challenge.id, code, status: ok ? "passed" : "failed", review_feedback: r });
      if (error) setOut((o) => [...o, "Error: could not save submission (" + error.message + ")"]);
      else onSubmitted(); // reloads the sidebar streak (and toasts if it went up); the hub refetches when it remounts
    } finally {
      setSaving(false);
    }
  };

  // Global shortcuts: Ctrl/Cmd+Enter runs, Ctrl/Cmd+Shift+Enter submits. Window + capture phase,
  // so they work from the editor, the notes box, or anywhere else, and the editor never sees them.
  const act = useRef({ run, submit });
  useEffect(() => { act.current = { run, submit }; });
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      if (e.shiftKey) act.current.submit();
      else act.current.run();
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, []);

  const onNotes = (v: string) => {
    setNotes(v);
    if (!challenge || !uid) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const { error } = await supabase.from("notes").upsert(
        { user_id: uid, challenge_id: challenge.id, content: v, updated_at: new Date().toISOString() },
        { onConflict: "user_id,challenge_id" },
      );
      if (error) {
        console.error("note not saved:", error.message);
        toast("Notes not saved", true);
      } else toast("Notes saved to cloud");
    }, 800);
  };

  const offTip = canRun ? undefined : "Execution isn't available for this language yet";

  return (
    <main className="flex min-h-0 min-w-0 flex-col gap-3 bg-[#101012] p-3">
      <div className="flex h-9 shrink-0 items-center justify-between gap-3 px-1">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onBack}
            disabled={saving}
            className="flex shrink-0 items-center gap-1.5 rounded-full py-1 pl-1.5 pr-2.5 text-xs text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100 disabled:opacity-40 motion-reduce:transition-none"
          >
            <ArrowLeft size={13} strokeWidth={1.75} />
            {backLabel}
          </button>
          <span className="h-4 w-px shrink-0 bg-white/[0.08]" />
          <span className="truncate font-mono text-xs text-zinc-500">
            {lang ? LANG[lang] : "…"} <span className="text-zinc-700">/</span>{" "}
            <span className="text-zinc-300">{challenge?.slug ?? slug}</span>
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {sprint && (
            <div className="mr-1 flex items-center gap-2">
              <span className="rounded-full bg-indigo-500/15 px-2.5 py-1 text-[0.625rem] font-semibold uppercase tracking-wider text-indigo-300 shadow-[0_0_12px_rgb(99_102_241/0.35)] ring-1 ring-indigo-500/30">
                Sprint Active
              </span>
              <span
                className={`flex items-center gap-1.5 rounded-full bg-white/[0.04] px-3 py-1.5 font-mono text-xs tabular-nums ${
                  left === 0 ? "text-red-400" : "text-zinc-300"
                }`}
              >
                <Timer size={12} strokeWidth={1.75} />
                {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
              </span>
            </div>
          )}
          <button
            onClick={submit}
            disabled={running || saving || !canRun}
            title={offTip}
            className="flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] py-1.5 pl-3.5 pr-2 text-xs font-medium text-zinc-200 transition-[transform,background-color] hover:bg-white/[0.08] active:scale-[0.97] disabled:opacity-40 motion-reduce:transition-none"
          >
            <Check size={12} strokeWidth={2.25} />
            Submit
            <kbd className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.625rem] text-zinc-400">{MOD} ⇧ ↵</kbd>
          </button>
          <button
            onClick={run}
            disabled={running || saving || !canRun}
            title={offTip}
            className="flex items-center gap-2 rounded-full bg-[linear-gradient(to_bottom,#7a7cf8,#5457e6)] py-1.5 pl-3.5 pr-2 text-xs font-medium text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_1px_2px_rgb(0_0_0/0.4)] transition-[transform,filter] hover:brightness-110 active:scale-[0.97] disabled:opacity-50 motion-reduce:transition-none"
          >
            <Play size={11} fill="currentColor" strokeWidth={0} />
            {running ? "Running" : "Run"}
            <kbd className="rounded bg-black/20 px-1.5 py-0.5 font-mono text-[0.625rem] text-white/80">{MOD} ↵</kbd>
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        <aside className={`${card} flex w-80 shrink-0 flex-col bg-[#1f1f23]`}>
          <div className="border-b border-white/[0.06] p-2.5">
            <div className={`${seg} w-fit`}>
              {tabs.map((t) => (
                <button key={t} onClick={() => setTab(t)} className={segBtn(tab === t)}>{t}</button>
              ))}
            </div>
          </div>

          {tab === "prompt" && (
            <div className="overflow-auto p-5">
              {challenge ? (
                <>
                  <p className="mb-3 font-mono text-[0.6875rem] text-zinc-500">
                    {LANG[challenge.language]} · Level {challenge.level}
                  </p>
                  <h1 className="mb-2 text-base font-medium tracking-tight text-zinc-100">{challenge.title}</h1>
                  <p className="text-sm leading-relaxed text-zinc-400">{chips(challenge.prompt)}</p>
                </>
              ) : (
                <p className="text-sm text-zinc-500">Loading…</p>
              )}
            </div>
          )}

          {tab === "notes" && (
            <textarea
              value={notes}
              onChange={(e) => onNotes(e.target.value)}
              placeholder="Markdown notes…"
              className="min-h-0 flex-1 resize-none bg-transparent p-5 font-mono text-xs leading-relaxed text-zinc-200 outline-none placeholder:text-zinc-600"
            />
          )}

          {tab === "review" && (
            <div className="overflow-auto p-5">
              {review ? (
                <>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ${
                      review.passed ? "bg-indigo-500/15 text-indigo-300" : "bg-red-500/15 text-red-300"
                    }`}
                  >
                    {review.passed ? "Passed" : "Failed"}
                  </span>
                  <h2 className={heading}>Code review</h2>
                  <ul className="space-y-2 text-sm leading-relaxed text-zinc-400">
                    {review.bullets.map((b, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-zinc-600">–</span>
                        <span>{chips(b)}</span>
                      </li>
                    ))}
                  </ul>
                  {review.lesson && (
                    <>
                      <h2 className={heading}>Micro-lesson</h2>
                      <p className="text-sm leading-relaxed text-zinc-400">{chips(review.lesson)}</p>
                    </>
                  )}
                </>
              ) : (
                <p className="text-sm text-zinc-500">
                  {canRun ? "Submit your solution to get a review." : "Reviews need a runnable language."}
                </p>
              )}
            </div>
          )}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <section className={`${card} flex min-h-0 flex-1 flex-col bg-[#0d0d0e]`}>
            <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#121214] pl-4 pr-2 font-mono text-xs text-zinc-400">
              solution.{lang ?? "js"}
              <button
                onClick={reset}
                disabled={!challenge}
                title="Reset to starter code"
                className="flex items-center gap-1.5 rounded-md px-2 py-1 font-sans text-xs text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200 disabled:opacity-40 motion-reduce:transition-none"
              >
                <RotateCcw size={11} strokeWidth={1.75} />
                Reset
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <CodeMirror
                value={code}
                onChange={onCode}
                theme="dark"
                extensions={langExt}
                basicSetup={{ foldGutter: false }}
                height="100%"
                style={{ height: "100%" }}
              />
            </div>
          </section>

          <section className={`${card} flex h-48 shrink-0 flex-col bg-[#161618]`}>
            <div className="flex items-center justify-between border-b border-white/[0.06] p-2.5">
              <div className={seg}><span className={segBtn(true)}>Console</span></div>
              <span className="flex items-center gap-2 pr-1.5 text-xs text-zinc-500">
                <span className={`size-1.5 rounded-full ${running ? "bg-indigo-400" : "bg-zinc-600"}`} />
                {running ? "Running" : "Idle"}
              </span>
            </div>
            <pre className="flex-1 overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-xs leading-relaxed">
              {out.length ? (
                out.map((l, i) => (
                  <div
                    key={i}
                    className={
                      l.startsWith("Error:") || l.startsWith("✗") || l.startsWith("Failed") ? "text-red-400" : "text-zinc-300"
                    }
                  >
                    <span className="select-none text-zinc-600">› </span>{l}
                  </div>
                ))
              ) : (
                <span className="text-zinc-600">Output appears here</span>
              )}
            </pre>
          </section>
        </div>
      </div>
    </main>
  );
}