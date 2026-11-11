import { Icon } from "../Icon";
import { InputBar } from "../InputBar/InputBar";

type Props = {
  onSend: (text: string) => void;
  onUpload: () => void;
  sourceCount: number;
  disabled?: boolean;
  placeholder?: string;
  statusNotice?: { title: string; detail: string } | null;
};
const prompts = [
  {
    icon: "file",
    title: "Get the big picture",
    caption: "A summary of your sources",
    text: "Summarize all project sources with clear, source-grounded points.",
  },
  {
    icon: "search",
    title: "Know your sources",
    caption: "See what's in this vault",
    text: "List all uploaded source documents.",
  },
  {
    icon: "note",
    title: "Make it memorable",
    caption: "Turn research into notes",
    text: "Summarize all project sources as structured study notes.",
  },
];
export function EmptyState({
  onSend,
  onUpload,
  sourceCount,
  disabled,
  placeholder,
  statusNotice,
}: Props) {
  return (
    <div className="empty-chat">
      <div className="empty-chat-content">
        <span className="research-symbol">
          <Icon name="sparkle" size={30} />
        </span>
        <span className="eyebrow">A LITTLE CONTEXT. A NEW PERSPECTIVE.</span>
        <h2>
          Good questions
          <br />
          start here<span className="title-dot">.</span>
        </h2>
        <p>
          {sourceCount
            ? "Your sources are ready. Follow a thought and see where it takes you."
            : "Bring your documents together. Find the ideas that connect them."}
        </p>
        {!sourceCount && (
          <button
            className="button primary"
            onClick={onUpload}
            disabled={disabled}
          >
            <Icon name="upload" size={16} /> Add your first source
          </button>
        )}
        {statusNotice && (
          <div className="notice" role="status">
            <strong>{statusNotice.title}</strong>
            <span>{statusNotice.detail}</span>
          </div>
        )}
        <div className="prompt-grid">
          {prompts.map((prompt) => (
            <button
              key={prompt.title}
              disabled={disabled || !sourceCount}
              onClick={() => onSend(prompt.text)}
            >
              <Icon name={prompt.icon} size={20} />
              <strong>{prompt.title}</strong>
              <span>{prompt.caption}</span>
              <Icon name="arrow" size={15} />
            </button>
          ))}
        </div>
      </div>
      <div className="chat-composer">
        <InputBar
          onSend={onSend}
          disabled={disabled || !sourceCount}
          placeholder={placeholder}
        />
        <p>
          Answers stay grounded in your sources. Your curiosity sets the
          direction.
        </p>
      </div>
    </div>
  );
}
