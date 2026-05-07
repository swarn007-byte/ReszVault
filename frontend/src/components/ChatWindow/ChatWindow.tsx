import { useEffect, useRef } from "react";
import { MessageBubble } from "../MessageBubble/MessageBubble";
import { InputBar } from "../InputBar/InputBar";
import type { Chat } from "../../store/chatStore";

type Props = {
  chat: Chat;
  onSend: (text: string) => void;
  isSending: boolean;
  streamingMessageId?: string;
};

export function ChatWindow({
  chat,
  onSend,
  isSending,
  streamingMessageId,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages, isSending]);

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(200,124,90,0.08),transparent_38%),linear-gradient(rgba(255,255,255,0.022)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.022)_1px,transparent_1px),#08090b] bg-[length:auto,44px_44px,44px_44px]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
        <div className="mx-auto flex max-w-[880px] flex-col gap-5">
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
      <div className="shrink-0 border-t border-white/[0.08] bg-[#101114]/95 px-4 py-4 backdrop-blur md:px-8">
        <div className="mx-auto max-w-[880px]">
          <InputBar onSend={onSend} disabled={isSending} />
        </div>
      </div>
    </div>
  );
}
