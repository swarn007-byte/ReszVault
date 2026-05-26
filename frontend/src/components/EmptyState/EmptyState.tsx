import { motion } from "framer-motion";
import { InputBar } from "../InputBar/InputBar";

const SUGGESTIONS = [
  {
    label: "Summarize vault",
    prompt: "Summarize all project sources with concise, source-grounded bullets.",
  },
  {
    label: "Find key points",
    prompt: "What are the most important points across the project sources?",
  },
  {
    label: "Make notes",
    prompt: "Turn the project sources into clean study notes with headings.",
  },
];

type Props = { onSend: (text: string) => void; disabled?: boolean };

export function EmptyState({ onSend, disabled }: Props) {
  return (
    <div className="flex h-full flex-1 flex-col justify-end overflow-y-auto bg-[#f4f6f9] px-4 pb-7 pt-8 md:px-8">
      <motion.div
        className="mx-auto flex w-full max-w-[980px] flex-1 flex-col justify-end"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="mb-8 text-center">
          <img
            src="/github-avatar.png"
            alt=""
            className="mx-auto mb-4 h-12 w-12 rounded-full object-cover shadow-sm"
          />
          <h1 className="text-xl font-semibold tracking-[-0.01em] text-[#242731] md:text-2xl">
            ReszVault
          </h1>
          <p className="mt-1 text-sm text-[#727884]">Chat with source-grounded context.</p>
        </div>

        <div className="mx-auto mb-4 grid w-full max-w-[620px] gap-2 sm:grid-cols-3">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              type="button"
              disabled={disabled}
              onClick={() => onSend(s.prompt)}
              className="rounded-lg border border-[#e4e6eb] bg-white px-3 py-3 text-left text-sm font-medium text-[#4d535f] shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition hover:bg-[#f8f9fb] disabled:opacity-50"
            >
              {s.label}
            </button>
          ))}
        </div>

        <InputBar onSend={onSend} disabled={disabled} autoFocus />
        <p className="mt-2 text-center text-xs text-[#777d88]">
          ReszVault can make mistakes. Check important source details.
        </p>
      </motion.div>
    </div>
  );
}
