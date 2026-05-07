import { motion } from "framer-motion";
import { InputBar } from "../InputBar/InputBar";

const SUGGESTIONS = [
  {
    label: "Summarize evidence",
    prompt: "Summarize the key evidence in this vault with source-grounded bullets.",
  },
  {
    label: "Find contradictions",
    prompt: "Highlight contradictions or weak claims across the available sources.",
  },
  {
    label: "Draft Obsidian note",
    prompt: "Draft an Obsidian-ready note from the strongest ideas in this vault.",
  },
  {
    label: "Reveal gaps",
    prompt: "Show the most important research gaps and what to read next.",
  },
];

type Props = { onSend: (text: string) => void; disabled?: boolean };

export function EmptyState({ onSend, disabled }: Props) {
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center overflow-y-auto bg-[radial-gradient(circle_at_50%_0%,rgba(200,124,90,0.12),transparent_34%),linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px),#08090b] bg-[length:auto,44px_44px,44px_44px] px-4 py-8">
      <motion.div
        className="w-full max-w-[880px]"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#c87c5a] text-[#181818] shadow-sm shadow-[#c87c5a]/20">
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </div>
          <div className="mb-3 flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#9a9790]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#75d083] shadow-[0_0_12px_rgba(117,208,131,0.75)]" />
            Source-grounded chat
          </div>
          <h1 className="text-2xl font-semibold text-[#f1efe9] md:text-[34px]">
            Ask the notebook. Watch the vault think.
          </h1>
          <p className="mx-auto mt-3 max-w-[560px] text-sm leading-relaxed text-[#aaa69d]">
            Query the active workspace, retrieve relevant context, and turn
            documents into useful notes without leaving the research flow.
          </p>
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-3">
          {[
            ["Traceable", "Answers stay tied to the selected source."],
            ["Notebook-ready", "Prompts are shaped for Obsidian notes."],
            ["Fast recall", "Ask follow-ups without rebuilding context."],
          ].map(([title, copy]) => (
            <div
              key={title}
              className="rounded-lg border border-white/[0.08] bg-[#202020]/82 px-4 py-3 text-left shadow-sm"
            >
              <p className="text-sm font-semibold text-[#e8e6e1]">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-[#8f8b84]">
                {copy}
              </p>
            </div>
          ))}
        </div>

        <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              type="button"
              disabled={disabled}
              onClick={() => onSend(s.prompt)}
              className="rounded-lg border border-white/[0.08] bg-[#202020] px-3 py-3 text-left text-sm font-medium text-[#c9c4ba] shadow-sm transition hover:border-[#c87c5a]/40 hover:bg-[#262626] hover:text-[#f1efe9] disabled:opacity-50"
            >
              {s.label}
            </button>
          ))}
        </div>

        <InputBar onSend={onSend} disabled={disabled} autoFocus />
      </motion.div>
    </div>
  );
}
