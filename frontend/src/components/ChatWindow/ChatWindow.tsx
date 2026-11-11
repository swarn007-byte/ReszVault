import { useEffect, useRef } from "react";
import { MessageBubble } from "../MessageBubble/MessageBubble";
import { InputBar } from "../InputBar/InputBar";
import type { Chat } from "../../store/chatStore";

type Props = {
  chat: Chat;
  onSend: (text: string) => void;
  onSave: (text: string) => void;
  onStop: () => void;
  isSending: boolean;
  streamingMessageId?: string;
  disabled?: boolean;
  placeholder?: string;
  statusNotice?: { title: string; detail: string } | null;
};
export function ChatWindow({
  chat,
  onSend,
  onSave,
  onStop,
  isSending,
  streamingMessageId,
  disabled,
  placeholder,
  statusNotice,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: isSending ? "instant" : "smooth",
      block: "end",
    });
  }, [chat.messages, isSending]);
  return (
    <div className="chat-thread">
      <div className="messages-scroll">
        <div className="messages-inner">
          {statusNotice && (
            <div className="notice" role="status">
              <strong>{statusNotice.title}</strong>
              <span>{statusNotice.detail}</span>
            </div>
          )}
          {chat.messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              isStreaming={message.id === streamingMessageId}
              onSave={onSave}
            />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="chat-composer">
        {isSending && (
          <button className="stop-response" onClick={onStop}>
            <span />
            Stop response
          </button>
        )}
        <InputBar
          onSend={onSend}
          disabled={disabled ?? isSending}
          placeholder={placeholder}
        />
        <p>Check important details against the original source.</p>
      </div>
    </div>
  );
}
