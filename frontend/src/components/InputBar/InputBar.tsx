import { useRef, useState, type KeyboardEvent } from "react";

type Props = {
  onSend: (text: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
};

export function InputBar({ onSend, disabled, autoFocus }: Props) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const handleSend = () => {
    const t = value.trim();
    if (!t || disabled) return;
    onSend(t);
    setValue("");
    if (ref.current) ref.current.style.height = "auto";
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = Boolean(value.trim()) && !disabled;

  return (
    <div className="w-full">
      <div className="rounded-xl border border-white/[0.12] bg-[#222222] px-3 py-3 shadow-[0_18px_55px_rgba(0,0,0,0.18)] transition-colors focus-within:border-[#c87c5a]/60 focus-within:ring-2 focus-within:ring-[#c87c5a]/15">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            adjustHeight();
          }}
          onKeyDown={onKeyDown}
          onInput={adjustHeight}
          rows={1}
          autoFocus={autoFocus}
          disabled={disabled}
          placeholder="Ask a grounded question about the active vault..."
          className="max-h-40 min-h-[34px] w-full resize-none bg-transparent px-1 py-1 text-sm leading-relaxed text-[#f1efe9] placeholder:text-[#8f8b84] focus:outline-none disabled:opacity-50"
        />
        <div className="mt-2 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-2">
          <p className="truncate text-[10px] text-[#8f8b84]">
            Enter to send · Shift+Enter for new line
          </p>
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all ${
              canSend
                ? "bg-[#c87c5a] text-[#181818] shadow-sm hover:bg-[#d89270]"
                : "bg-[#2a2a2a] text-[#77736c]"
            }`}
            aria-label="Send"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
