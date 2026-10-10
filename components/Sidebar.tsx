import { Calendar, Timer, NotebookPen, TrendingUp, Flame, Keyboard } from "lucide-react";
import type { View } from "@/lib/app";

const nav: { key: View; label: string; icon: typeof Calendar }[] = [
  { key: "today", label: "Today", icon: Calendar },
  { key: "sprints", label: "Sprints", icon: Timer },
  { key: "notes", label: "Notes", icon: NotebookPen },
  { key: "progress", label: "Progress", icon: TrendingUp },
];
const week = ["M", "T", "W", "T", "F", "S", "S"];

const sectionLabel = "px-3 pb-2 text-[0.6875rem] font-medium uppercase tracking-wider text-zinc-500";
const row =
  "relative flex w-full items-center rounded-lg px-3 py-2.5 text-left text-sm text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-zinc-100 motion-reduce:transition-none";
const active =
  "bg-white/[0.07] text-zinc-100 after:absolute after:inset-y-2 after:right-0 after:w-0.5 after:rounded-full after:bg-indigo-500";

export default function Sidebar({
  streak, tracks, trackId, view, onNav, onSelectTrack, onHelp,
}: {
  streak: number;
  tracks: { id: string; name: string }[];
  trackId: string | null;
  view: View;
  onNav: (v: View) => void;
  onSelectTrack: (id: string) => void;
  onHelp: () => void;
}) {
  return (
    <aside className="flex min-h-0 flex-col overflow-y-auto border-r border-white/[0.06] bg-[#161618] p-3">
      <div className="flex items-center gap-2.5 px-3 pb-6 pt-1">
        <span className="grid size-6 place-items-center rounded-md border border-white/[0.08] bg-white/[0.04] font-mono text-[0.6875rem] text-indigo-400">
          &gt;_
        </span>
        <span className="text-sm font-semibold tracking-tight text-zinc-100">Get Better</span>
      </div>

      <nav className="flex flex-col gap-0.5">
        {nav.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => onNav(key)}
            aria-current={view === key ? "page" : undefined}
            className={`${row} gap-3 ${view === key ? active : ""}`}
          >
            <Icon size={16} strokeWidth={1.75} />
            {label}
          </button>
        ))}
      </nav>

      <div className="mt-7">
        <p className={sectionLabel}>Tracks</p>
        {tracks.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelectTrack(t.id)}
            aria-current={view === "hub" && t.id === trackId ? "true" : undefined}
            className={`${row} ${view === "hub" && t.id === trackId ? active : ""}`}
          >
            {t.name}
          </button>
        ))}
      </div>

      <button type="button" onClick={onHelp} className={`${row} mt-auto gap-3`}>
        <Keyboard size={16} strokeWidth={1.75} />
        Keyboard shortcuts
      </button>

      <div className="mt-2 rounded-xl border border-white/[0.06] bg-[#1c1c20] p-3">
        <div className="mb-3 flex items-center gap-2 text-sm text-zinc-200">
          <Flame size={15} strokeWidth={1.75} className="text-zinc-400" />
          {streak} day streak
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {week.map((d, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <span className={`h-1.5 w-full rounded-full ${i < streak ? "bg-indigo-500" : "bg-white/[0.08]"}`} />
              <span className="font-mono text-[0.625rem] text-zinc-500">{d}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}