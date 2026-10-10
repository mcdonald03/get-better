"use client";
import { useCallback, useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import TrackHub from "@/components/TrackHub";
import NotesHub from "@/components/NotesHub";
import ProgressHub from "@/components/ProgressHub";
import Playground from "@/components/Playground";
import ShortcutsModal from "@/components/ShortcutsModal";
import { ToastProvider, useToast } from "@/components/Toast";
import { getUserId, supabase } from "@/lib/supabase";
import { LANG, RUNNABLE, type View } from "@/lib/app";

type Track = { id: string; name: string };

function Shell() {
  const toast = useToast();
  const [uid, setUid] = useState<string | null>(null);
  const [authFailed, setAuthFailed] = useState(false);
  const [streak, setStreak] = useState(0);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [trackId, setTrackId] = useState<string | null>(null);
  const [view, setView] = useState<View>("hub");
  const [slug, setSlug] = useState<string | null>(null); // set = IDE, regardless of view
  const [help, setHelp] = useState(false);
  const closeHelp = useCallback(() => setHelp(false), []);

  // Ctrl/Cmd + / toggles the cheat sheet from anywhere. Capture phase so it beats the editor's comment toggle.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "/") { e.preventDefault(); e.stopPropagation(); setHelp((o) => !o); }
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, []);

  const loadStreak = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("streak,last_active_at").single();
    if (!data) return 0;
    // The stored streak only changes on a pass, so a 2+ day gap has to read as 0 here.
    const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    const last: string | null = data.last_active_at;
    const s = last && last.slice(0, 10) >= yesterday ? data.streak : 0;
    setStreak(s);
    return s;
  }, []);

  useEffect(() => {
    (async () => {
      const id = await getUserId();
      if (!id) return setAuthFailed(true);
      setUid(id);
      loadStreak();
      const { data, error } = await supabase.from("tracks").select("id,name");
      if (error) return console.error("tracks:", error.message);
      const order = Object.keys(LANG); // js, py, cpp
      const list = ((data ?? []) as Track[]).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      setTracks(list);
      // shortcut: default to JS; let the user's own tracks (user_tracks) decide once there's a picker
      setTrackId((list.find((t) => t.id === "js") ?? list[0])?.id ?? null);
    })();
  }, [loadStreak]);

  // Called after every submission. Toasts only when the streak number actually went up.
  const onSubmitted = async () => {
    const before = streak;
    const after = await loadStreak();
    if (after > before) toast(`Streak Updated! ${after} day${after === 1 ? "" : "s"}`);
  };

  const go = (v: View) => { setView(v); setSlug(null); }; // leaves the IDE
  const selectTrack = (id: string) => { setTrackId(id); go("hub"); };
  // Keeps the current view (Notes), so Back returns there instead of to a track hub.
  const openChallenge = (s: string, lang: string) => { setTrackId(lang); setSlug(s); };
  const track = tracks.find((t) => t.id === trackId) ?? null;

  // Sprint = random unfinished challenge (random from all if everything is done).
  // Only runnable languages, since a timed session you can't submit is pointless.
  const startSprint = async () => {
    if (!uid || !trackId) return;
    const lang = RUNNABLE.includes(trackId) ? trackId : "js";
    const [c, s] = await Promise.all([
      supabase.from("challenges").select("id,slug").eq("language", lang),
      supabase.from("submissions").select("challenge_id").eq("status", "passed"),
    ]);
    const done = new Set((s.data ?? []).map((r: { challenge_id: string }) => r.challenge_id));
    const rows = c.data ?? [];
    const pool = rows.filter((r) => !done.has(r.id));
    const list = pool.length ? pool : rows;
    const pick = list[Math.floor(Math.random() * list.length)];
    if (!pick) return go("hub"); // nothing to run: show the hub's empty state
    setTrackId(lang);
    setView("sprints");
    setSlug(pick.slug);
    toast("Sprint Active · 15:00 on the clock");
  };

  // Today = one challenge per UTC day, the same all day (and the same on every device).
  const openToday = async () => {
    if (!uid) return;
    const { data } = await supabase
      .from("challenges").select("slug,language").in("language", RUNNABLE).order("level").order("slug");
    if (!data?.length) return go("hub");
    const pick = data[Math.floor(Date.now() / 864e5) % data.length];
    setTrackId(pick.language);
    setView("today");
    setSlug(pick.slug);
  };

  const onNav = (v: View) => (v === "today" ? openToday() : v === "sprints" ? startSprint() : go(v));

  const back = () => (view === "notes" ? setSlug(null) : go("hub"));
  const backLabel =
    view === "notes" ? "Back to Notes"
    : view === "today" ? "Back to Dashboard"
    : view === "sprints" ? "End Sprint"
    : `Back to ${LANG[trackId ?? ""] ?? "Challenges"} Track`;

  const paneKey = slug ? `ide:${slug}` : view === "hub" ? `hub:${trackId}` : view; // new key = remount = fade-in

  return (
    <div className="grid h-screen grid-cols-[14rem_1fr]">
      <Sidebar
        streak={streak} tracks={tracks} trackId={trackId} view={view}
        onNav={onNav} onSelectTrack={selectTrack} onHelp={() => setHelp(true)}
      />
      <div key={paneKey} className="fade-in flex min-h-0 min-w-0 flex-col *:min-h-0 *:flex-1">
        {authFailed ? (
          <main className="grid place-items-center bg-[#101012] p-8 text-center text-sm text-zinc-400">
            Couldn&apos;t start a session. Enable anonymous sign-ins in Supabase (Authentication → Sign In / Providers) and reload.
          </main>
        ) : slug ? (
          <Playground
            uid={uid} slug={slug} sprint={view === "sprints"}
            backLabel={backLabel} onBack={back} onSubmitted={onSubmitted}
          />
        ) : view === "notes" ? (
          <NotesHub uid={uid} tracks={tracks} onOpen={openChallenge} />
        ) : view === "progress" ? (
          <ProgressHub uid={uid} tracks={tracks} streak={streak} />
        ) : (
          <TrackHub track={track} uid={uid} onStart={setSlug} />
        )}
      </div>
      <ShortcutsModal open={help} onClose={closeHelp} />
    </div>
  );
}

export default function Home() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}