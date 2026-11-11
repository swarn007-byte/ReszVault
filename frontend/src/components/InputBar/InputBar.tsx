import { useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "../Icon";

type Props = {
  onSend: (text: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
};
export function InputBar({ onSend, disabled, autoFocus, placeholder }: Props) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const send = () => {
    if (!value.trim() || disabled) return;
    onSend(value.trim());
    setValue("");
    if (ref.current) ref.current.style.height = "auto";
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      send();
    }
  };
  return (
    <div className="composer-input">
      <textarea
        ref={ref}
        value={value}
        aria-label="Ask your sources"
        rows={1}
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder ?? "Ask anything about your sources…"}
        onChange={(event) => {
          setValue(event.target.value);
          event.target.style.height = "auto";
          event.target.style.height = `${Math.min(event.target.scrollHeight, 150)}px`;
        }}
        onKeyDown={keyDown}
      />
      <div className="composer-bottom">
        <span>
          <Icon name="sparkle" size={13} /> Source-grounded answers
        </span>
        <div>
          <kbd>↵</kbd>
          <button
            onClick={send}
            disabled={disabled || !value.trim()}
            aria-label="Send question"
          >
            <Icon name="arrow" size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}
