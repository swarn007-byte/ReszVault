import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "../../store/chatStore";
import { Brand, Icon } from "../Icon";

type Props = {
  message: Message;
  isStreaming?: boolean;
  onSave: (text: string) => void;
};
export function MessageBubble({ message, isStreaming, onSave }: Props) {
  const [copyState, setCopyState] = useState("");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopyState("Copied");
    } catch {
      setCopyState("Copy unavailable");
    }
    setTimeout(() => setCopyState(""), 2200);
  };
  const isUser = message.role === "user";
  return (
    <article
      className={`message ${isUser ? "user-message" : "assistant-message"}`}
    >
      <div className="message-heading">
        {isUser ? (
          <span className="user-message-icon">Y</span>
        ) : (
          <Brand compact />
        )}
        <strong>{isUser ? "You" : "ReszVault"}</strong>
        <time>
          {new Date(message.createdAt).toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
      </div>
      {message.content ? (
        <div className="markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
          {isStreaming && <span className="stream-cursor" />}
        </div>
      ) : isStreaming ? (
        <div
          className="thinking"
          role="status"
          aria-label="Reading your sources"
        >
          <i />
          <i />
          <i />
          <span>Reading your sources…</span>
        </div>
      ) : null}
      {!isUser && message.content && !isStreaming && (
        <div className="message-actions">
          {Boolean(message.sourcesUsed) && (
            <span className="reference-badge">
              <Icon name="file" size={12} />
              {message.sourcesUsed} reference
              {message.sourcesUsed === 1 ? "" : "s"}
            </span>
          )}
          <button onClick={() => void copy()}>
            <Icon name="copy" size={13} />
            {copyState || "Copy"}
          </button>
          <button onClick={() => onSave(message.content)}>
            <Icon name="note" size={13} />
            Save to notebook
          </button>
        </div>
      )}
    </article>
  );
}
