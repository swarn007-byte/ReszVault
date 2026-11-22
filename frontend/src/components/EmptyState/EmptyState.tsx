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

type StatusNotice = { title: string; detail: string; tone?: "info" | "warning" | "error" };

type EmptyStateProps = {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  statusNotice?: StatusNotice | null;
};

export function EmptyState({ onSend, disabled, placeholder, statusNotice }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-1 flex-col justify-center overflow-y-auto bg-[#f6f4f1] px-4 py-8 md:px-8">
      <motion.div
        className="mx-auto flex w-full max-w-[980px] flex-col justify-center"
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
          <p className="mt-1 text-sm text-[#666d78]">Chat with source-grounded context.</p>
        </div>

        {statusNotice && (
          <div
            className={`mx-auto mb-4 w-full max-w-[620px] rounded-2xl border px-4 py-3 text-sm ${
              statusNotice.tone === "error"
                ? "border-[#f0d0d0] bg-[#fff6f6] text-[#7b3838]"
                : statusNotice.tone === "warning"
                  ? "border-[#edd9c4] bg-[#fff8ef] text-[#85521d]"
                  : "border-[#e3ddd5] bg-[#fffdfa] text-[#5f584f]"
            }`}
          >
            <p className="font-semibold">{statusNotice.title}</p>
            <p className="mt-1 leading-relaxed opacity-90">{statusNotice.detail}</p>
          </div>
        )}

        <div className="mx-auto mb-5 grid w-full max-w-[620px] gap-2 sm:grid-cols-3">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              type="button"
              disabled={disabled}
              onClick={() => onSend(s.prompt)}
              className="rounded-lg border border-[#e3d7ca] bg-white px-3 py-3 text-left text-sm font-medium text-[#434a56] shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition hover:border-[#e8791a] hover:bg-[#fff7ef] disabled:opacity-50"
            >
              {s.label}
            </button>
          ))}
        </div>

        <InputBar onSend={onSend} disabled={disabled} autoFocus placeholder={placeholder} />
        <p className="mt-2 text-center text-xs text-[#777d88]">
          ReszVault can make mistakes. Check important source details.
        </p>
      </motion.div>
    </div>
  );
}
