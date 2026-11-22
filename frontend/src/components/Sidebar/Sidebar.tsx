import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useChatStore } from "../../store/chatStore";
import { useProjectStore } from "../../store/projectStore";
import { BookPicker } from "./BookPicker";

type SidebarProps = {
  activeChatId: string | null;
  onCloseMobile?: () => void;
};

export function Sidebar({ activeChatId, onCloseMobile }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [logoutError, setLogoutError] = useState("");
  const { chats, createChat, setActiveChat } = useChatStore();
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const projects = useProjectStore((state) => state.projects);
  const createProject = useProjectStore((state) => state.createProject);
  const isGuestRoute = location.pathname.startsWith("/guest");
  const chatBasePath = isGuestRoute ? "/guest" : "/app";
  const repositoryChats = isGuestRoute || !user ? [] : chats.filter(
    (chat) => chat.repository && chat.ownerId === user.id,
  );

  const handleNewChat = () => {
    if (!isGuestRoute) {
      setActiveChat(null);
      navigate("/app");
    } else {
      const id = createChat();
      navigate(`${chatBasePath}/${id}`);
    }
    onCloseMobile?.();
  };

  const handleNewProject = () => {
    if (user) {
      navigate("/projects?manage=1");
      onCloseMobile?.();
      return;
    }

    createProject({
      name: `Project ${projects.length + 1}`,
      description: "A focused workspace for sources and grounded answers.",
    });
    const id = createChat();
    setActiveChat(id);
    navigate(`${chatBasePath}/${id}`);
    onCloseMobile?.();
  };

  const displayName = user?.name ?? user?.email?.split("@")[0] ?? "Guest";
  const initial = displayName.charAt(0).toUpperCase();
  const userAvatar = user?.image;

  return (
    <aside className="flex h-full w-[300px] shrink-0 overflow-hidden border-r border-[#e8ddd0] bg-[#fffdfa] text-[#242731]">
      <div className="flex h-full w-full shrink-0 flex-col bg-[#fffdfa]">
        <div className="px-6 pb-4 pt-7">
          <div className="flex items-center gap-3">
            <img
              src="/github-avatar.png"
              alt=""
              className="h-10 w-10 rounded-full object-cover shadow-sm"
            />
            <div>
              <p className="text-xl font-semibold tracking-[-0.01em] text-[#181a20]">
                ReszVault
              </p>
              <p className="mt-1 text-sm text-[#7b7268]">Chat with your sources.</p>
            </div>
          </div>
        </div>

        <div className="px-6 pb-4">
          <button
            type="button"
            onClick={handleNewChat}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#e8ddd0] bg-white px-4 py-2.5 text-sm font-medium text-[#2b2e36] shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-[#e8791a] hover:bg-[#fff7ef]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New Chat
          </button>
        </div>

        <div className="px-6 pb-4">
          <BookPicker projectId={activeProjectId} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <button
            type="button"
            onClick={handleNewProject}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#ead9c8] bg-[#fffdfa] px-4 py-2.5 text-xs font-semibold text-[#6b6258] transition hover:border-[#e8791a] hover:bg-[#fff7ef]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Project
          </button>
          {repositoryChats.length > 0 && (
            <nav className="mt-4 grid gap-1" aria-label="Repository chats">
              {repositoryChats.map((chat) => (
                <Link key={chat.id} to={`/app/${chat.id}`} onClick={onCloseMobile}
                  aria-current={activeChatId === chat.id ? "page" : undefined}
                  className="rounded-lg px-3 py-2 text-sm hover:bg-[#fbf3eb] aria-[current=page]:bg-[#fbf3eb]">
                  <span className="block truncate">{chat.title}</span>
                  <small className="block truncate text-[#7b7268]">{chat.repository}</small>
                </Link>
              ))}
            </nav>
          )}
        </div>

        <div className="border-t border-[#e8ddd0] p-4">
          {logoutError && <p className="text-sm text-red-700" role="alert">{logoutError}</p>}
          {user ? (
            <div className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-[#fbf3eb]">
              {userAvatar ? (
                <img
                  src={userAvatar}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-8 w-8 shrink-0 rounded-full object-cover shadow-sm"
                />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f7ede5] text-xs font-semibold text-[#8f5c24]">
                  {initial}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[#24262d]">
                  {displayName}
                </p>
                <p className="truncate text-[10px] text-[#8b909a]">{user.email}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLogoutError("");
                  void logout().catch((error: Error) => setLogoutError(error.message));
                }}
                className="shrink-0 rounded-lg p-1.5 text-[#8b909a] transition-colors hover:bg-[#f4eee8] hover:text-[#24262d]"
                aria-label="Sign out"
                title="Sign out"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
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
              className="flex w-full items-center justify-center rounded-lg border border-[#e8ddd0] bg-white py-2.5 text-xs font-medium text-[#5d5144] transition-colors hover:border-[#e8791a] hover:bg-[#fff7ef]"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}
