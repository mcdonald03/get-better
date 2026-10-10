import type { Case, Result } from "@/lib/review";

const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";

// Pyodide lives in its own worker so heavy or runaway Python can't freeze the page.
// Run mode streams stdout lines; test mode (cases) executes the code once, then evals each call
// and compares JSON strings, so True/False/None/list/str all line up with the JSON in test_cases.
const SRC = `
importScripts("${PYODIDE}pyodide.js");
const boot = loadPyodide({ indexURL: "${PYODIDE}" }).then((p) => { postMessage({ type: "ready" }); return p; });
boot.catch((err) => postMessage({ type: "fatal", text: String(err) }));
const lastLine = (err) => String((err && err.message) || err).trim().split("\\n").pop();

onmessage = async (e) => {
  const { id, code, cases } = e.data;
  const py = await boot;
  const out = (text) => postMessage({ id, type: "out", text });
  const ns = py.toPy({});
  try {
    if (!cases) {
      py.setStdout({ batched: out });
      py.setStderr({ batched: out });
      try { await py.runPythonAsync(code, { globals: ns }); } catch (err) { out("Error: " + lastLine(err)); }
      postMessage({ id, type: "done", results: null });
      return;
    }
    py.setStdout({ batched: () => {} });
    py.setStderr({ batched: () => {} });
    let fail = null;
    try { await py.runPythonAsync(code, { globals: ns }); } catch (err) { fail = lastLine(err); }
    const results = [];
    for (const c of cases) {
      if (fail) { results.push({ ok: false, got: "Error: " + fail }); continue; }
      try {
        const got = py.runPython(
          "__import__('json').dumps(eval(" + JSON.stringify(c.call) + ", globals()), separators=(',', ':'), ensure_ascii=False, default=repr)",
          { globals: ns }
        );
        results.push({ ok: got === JSON.stringify(c.expect), got });
      } catch (err) { results.push({ ok: false, got: "Error: " + lastLine(err) }); }
    }
    postMessage({ id, type: "done", results });
  } finally { ns.destroy(); }
};
`;

let worker: Worker | null = null;
let ready: Promise<void> | null = null;
let isReady = false;
let seq = 0;

// Kills the worker (the only way to stop an infinite loop); the next run boots a fresh one.
const reset = () => { worker?.terminate(); worker = null; ready = null; isReady = false; };

function boot() {
  const w = new Worker(URL.createObjectURL(new Blob([SRC], { type: "text/javascript" })));
  worker = w;
  ready = new Promise<void>((resolve, reject) => {
    w.addEventListener("message", (e) => {
      if (e.data.type === "ready") { isReady = true; resolve(); }
      else if (e.data.type === "fatal") reject(new Error(e.data.text));
    });
    w.addEventListener("error", (e) => reject(new Error(e.message || "could not load Python")));
  });
  ready.catch(() => {}); // callers that await it handle failure; this only silences the unhandled-rejection warning
}

// Start the ~10 MB download early (e.g. when a Python challenge opens) so the first Run is fast.
export const preloadPython = () => { if (!worker) boot(); };

type Hooks = { line: (s: string) => void; loading: () => void; loaded: () => void };

// Resolves to per-case results in test mode, null in run mode (or on failure).
export async function runPython(
  payload: { code: string; cases?: Case[] },
  hooks: Hooks,
  timeoutMs = 5000,
): Promise<Result[] | null> {
  if (!worker) boot();
  const w = worker!;
  if (!isReady) hooks.loading();
  try {
    await ready;
  } catch (err) {
    reset();
    hooks.line("Error: could not load Python (" + (err as Error).message + "). Check your connection and try again.");
    return null;
  }
  hooks.loaded();

  return new Promise<Result[] | null>((resolve) => {
    const id = ++seq;
    const finish = (r: Result[] | null) => { clearTimeout(t); w.removeEventListener("message", onMsg); resolve(r); };
    // The clock starts after Pyodide is loaded, so slow downloads never count against the code.
    const t = setTimeout(() => { reset(); hooks.line("Error: timed out after " + timeoutMs / 1000 + "s"); finish(null); }, timeoutMs);
    const onMsg = (e: MessageEvent) => {
      const m = e.data;
      if (m.id !== id) return;
      if (m.type === "out") hooks.line(m.text);
      else if (m.type === "done") finish(m.results);
    };
    w.addEventListener("message", onMsg);
    w.postMessage({ id, ...payload });
  });
}