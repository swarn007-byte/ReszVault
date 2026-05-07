import { formatDistanceToNow } from "date-fns";
import type { Chat } from "../../store/chatStore";

type Props = {
  chat: Chat;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
};

export function ChatListItem({ chat, isActive, onSelect, onDelete }: Props) {
  const time = formatDistanceToNow(new Date(chat.updatedAt), {
    addSuffix: true,
  });
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      className={`group flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors ${
        isActive
          ? "border border-[#c87c5a]/20 bg-[#2a2a2a]"
          : "border border-transparent hover:bg-[#2a2a2a]"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-medium ${isActive ? "text-[#c87c5a]" : "text-[#e8e6e1]"}`}
        >
          {chat.title}
        </p>
        <p className="mt-0.5 text-[10px] text-[#7a7875]">{time}</p>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="shrink-0 rounded p-1 text-[#7a7875] opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
        aria-label="Delete chat"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
        </svg>
      </button>
    </div>
  );
}
