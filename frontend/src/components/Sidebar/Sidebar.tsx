import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useChatStore } from "../../store/chatStore";
import { useProjectStore } from "../../store/projectStore";
import { ChatListItem } from "./ChatListItem";
import { BookPicker } from "./BookPicker";

type SidebarProps = {
  activeChatId: string | null;
  onCloseMobile?: () => void;
};

export function Sidebar({ activeChatId, onCloseMobile }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { chats, historyLoading, createChat, deleteChat, setActiveChat } =
    useChatStore();
  const activeProject = useProjectStore((s) => s.activeProject());
  const isGuestRoute = location.pathname.startsWith("/guest");
  const chatBasePath = isGuestRoute ? "/guest" : "/app";

  const handleNewChat = () => {
    const id = createChat();
    setActiveChat(id);
    navigate(`${chatBasePath}/${id}`);
    onCloseMobile?.();
  };

  const handleSelect = (id: string) => {
    setActiveChat(id);
    navigate(`${chatBasePath}/${id}`);
    onCloseMobile?.();
  };

  const handleDelete = (id: string) => {
    deleteChat(id);
    const nextId = useChatStore.getState().activeChatId;
    if (nextId) navigate(`${chatBasePath}/${nextId}`);
    else navigate(chatBasePath);
  };

  const displayName = user?.name ?? user?.email?.split("@")[0] ?? "Guest";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <aside className="flex h-full w-[286px] shrink-0 flex-col border-r border-white/[0.08] bg-[#101114]">
      {/* Brand */}
      <div className="border-b border-white/[0.08] px-4 py-4">
        <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#c87c5a] text-[#181818]">
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
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-bold text-[#f1efe9]">ReszVault</p>
          <p className="text-[10px] text-[#9a9790]">Grounded research OS</p>
        </div>
        </div>
        <div className="mt-4 rounded-lg border border-white/[0.08] bg-[#17181c] px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-xs font-semibold text-[#e8e6e1]">
              {activeProject?.name ?? "Default vault"}
            </p>
            <span className="shrink-0 rounded-full bg-[#75d083]/10 px-2 py-0.5 text-[10px] font-semibold text-[#75d083]">
              Live
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-[#9a9790]">
            {user
              ? "Notebook sources, chats, and retrieval context."
              : "Guest access with the default notebook vault."}
          </p>
        </div>
      </div>

      {/* New chat button */}
      <div className="px-3 pb-2 pt-3">
        <button
          type="button"
          onClick={handleNewChat}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#c87c5a] px-4 py-2.5 text-sm font-semibold text-[#181818] shadow-sm transition-colors hover:bg-[#d89270]"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Chat
        </button>
      </div>

      {/* Book picker */}
      <div className="px-3 pb-2">
        <BookPicker />
      </div>

      {/* Chat history */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
        {historyLoading ? (
          <div className="space-y-2 px-2 pt-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-lg bg-[#2a2a2a]"
              />
            ))}
          </div>
        ) : chats.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-[#7a7875]">
            No chats yet. Start one above.
          </p>
        ) : (
          <>
            <p className="px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-widest text-[#9a9790]">
              Recent
            </p>
            <div className="space-y-0.5">
              {chats.map((chat) => (
                <ChatListItem
                  key={chat.id}
                  chat={chat}
                  isActive={chat.id === activeChatId}
                  onSelect={() => handleSelect(chat.id)}
                  onDelete={() => handleDelete(chat.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* User footer */}
      <div className="border-t border-white/[0.08] p-3">
        {user ? (
          <div className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-[#2a2a2a]">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#c87c5a]/20 bg-[#c87c5a]/10 text-xs font-bold text-[#c87c5a]">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[#e8e6e1]">
                {displayName}
              </p>
              <p className="truncate text-[10px] text-[#7a7875]">
                {user.email}
              </p>
            </div>
            <button
              type="button"
              onClick={() => logout()}
              className="shrink-0 rounded-lg p-1.5 text-[#7a7875] transition-colors hover:bg-[#2a2a2a] hover:text-[#c87c5a]"
              aria-label="Sign out"
              title="Sign out"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        ) : (
          <Link
            to="/login"
            onClick={onCloseMobile}
            className="flex w-full items-center justify-center rounded-lg bg-[#c87c5a] py-2.5 text-xs font-bold uppercase tracking-wider text-[#181818] shadow-sm transition-colors hover:bg-[#d89270]"
          >
            Sign in / Create account
          </Link>
        )}
      </div>
    </aside>
  );
}
