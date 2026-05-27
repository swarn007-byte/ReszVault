import { useRef, useState, type KeyboardEvent } from "react";

type SpeechRecognitionConstructor = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<{
    0?: {
      transcript?: string;
    };
  }>;
};

type SpeechWindow = Window &
  typeof globalThis & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

type Props = {
  onSend: (text: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
};

export function InputBar({ onSend, disabled, autoFocus }: Props) {
  const [value, setValue] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<InstanceType<SpeechRecognitionConstructor> | null>(null);

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

  const startVoiceInput = () => {
    if (disabled) return;
    setVoiceError(null);

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      (window as SpeechWindow).SpeechRecognition ??
      (window as SpeechWindow).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceError("Voice input is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-IN";
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (!transcript) return;
      setValue((current) => {
        const next = current.trim() ? `${current.trim()} ${transcript}` : transcript;
        window.requestAnimationFrame(adjustHeight);
        return next;
      });
      ref.current?.focus();
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => {
      setIsListening(false);
      setVoiceError("Could not hear that. Try again.");
    };

    setIsListening(true);
    recognition.start();
  };

  return (
    <div className="min-w-0 w-full">
      <div className="rounded-2xl border border-[#dfe2e7] bg-white shadow-[0_10px_28px_rgba(35,39,47,0.08)] transition-colors focus-within:border-[#c7ccd5]">
        <div className="flex min-w-0 items-end gap-3 px-4 py-3">
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
            placeholder="Type your message here..."
            className="max-h-40 min-h-[36px] min-w-0 flex-1 resize-none bg-transparent px-1 py-1.5 text-[15px] leading-relaxed text-[#242731] placeholder:text-[#969ca6] focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={startVoiceInput}
            disabled={disabled}
            className={`mb-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl transition ${
              isListening
                ? "bg-[#242731] text-white"
                : "bg-[#f1f3f6] text-[#7c828d] hover:bg-[#e8ebf0]"
            } disabled:opacity-50`}
            aria-label={isListening ? "Stop voice input" : "Start voice input"}
            title={isListening ? "Stop voice input" : "Start voice input"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z" />
              <path d="M19 11a7 7 0 0 1-14 0" />
              <path d="M12 18v3" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className={`mb-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-all ${
              canSend
                ? "bg-[#242731] text-white hover:bg-[#111318]"
                : "bg-[#f1f3f6] text-[#9aa0aa]"
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
      {voiceError && (
        <p className="mt-1 px-2 text-[11px] text-[#8b909a]">{voiceError}</p>
      )}
    </div>
  );
}
