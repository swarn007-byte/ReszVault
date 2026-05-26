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
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-[#f4f6f9]">
      {/* Messages */}
      <div className="min-w-0 flex-1 overflow-y-auto px-4 pb-6 pt-8 md:px-10">
        <div className="mx-auto flex w-full max-w-[980px] min-w-0 flex-col gap-7">
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
      <div className="shrink-0 bg-[#f4f6f9] px-4 pb-6 pt-2 md:px-10">
        <div className="mx-auto w-full max-w-[980px] min-w-0">
          <InputBar onSend={onSend} disabled={isSending} />
          <p className="mt-2 text-center text-xs text-[#777d88]">
            ReszVault can make mistakes. Check important source details.
          </p>
        </div>
      </div>
    </div>
  );
}
