import { useEffect, useRef } from "react";
import { MessageBubble } from "../MessageBubble/MessageBubble";
import { InputBar } from "../InputBar/InputBar";
import type { Chat } from "../../store/chatStore";

type Props = {
  chat: Chat;
  onSend: (text: string) => void;
  isSending: boolean;
  streamingMessageId?: string;
  disabled?: boolean;
  placeholder?: string;
  statusNotice?: { title: string; detail: string; tone?: "info" | "warning" | "error" } | null;
};

export function ChatWindow({
  chat,
  onSend,
  isSending,
  streamingMessageId,
  disabled,
  placeholder,
  statusNotice,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages, isSending]);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-[#f6f4f1]">
      {/* Messages */}
      <div className="min-w-0 flex-1 overflow-y-auto px-4 pb-6 pt-8 md:px-10">
        <div className="mx-auto flex w-full max-w-[980px] min-w-0 flex-col gap-7">
          {statusNotice && (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm ${
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
          {chat.messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isStreaming={msg.id === streamingMessageId}
            />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input bar */}
      <div className="shrink-0 border-t border-[#eee2d6] bg-[#f8f6f3] px-4 pb-6 pt-3 md:px-10">
        <div className="mx-auto w-full max-w-[980px] min-w-0">
          <InputBar
            onSend={onSend}
            disabled={disabled ?? isSending}
            placeholder={placeholder}
          />
          <p className="mt-2 text-center text-xs text-[#777d88]">
            ReszVault can make mistakes. Check important source details.
          </p>
        </div>
      </div>
    </div>
  );
}
