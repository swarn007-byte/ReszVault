import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Sidebar } from "../Sidebar/Sidebar";
import { useChatStore } from "../../store/chatStore";
import { EmptyState } from "../EmptyState/EmptyState";
import { ChatWindow } from "../ChatWindow/ChatWindow";
import { streamQuestion } from "../../api/chat";
import { useBookStore } from "../../store/bookStore";
import { useAuth } from "../../hooks/useAuth";
import { useProjectStore } from "../../store/projectStore";

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id?: string }>();
  const {
    chats,
    activeChatId,
    sidebarOpen,
    isSending,
    setSidebarOpen,
    setHistoryLoading,
    setIsSending,
    setActiveChat,
    createChat,
    addMessage,
    appendToMessage,
    setMessageContent,
    getChat,
  } = useChatStore();
  const selectedBookId = useBookStore((s) => s.selectedBookId());
  const selectedLabel = useBookStore((s) => s.selectedLabel());
  const { user } = useAuth();
  const activeProject = useProjectStore((s) => s.activeProject());
  const isGuestRoute = location.pathname.startsWith("/guest");
  const chatBasePath = isGuestRoute ? "/guest" : "/app";

  useEffect(() => {
    setSidebarOpen(false);
    const t = setTimeout(() => setHistoryLoading(false), 400);
    return () => clearTimeout(t);
  }, [setHistoryLoading, setSidebarOpen]);

  useEffect(() => {
    if (id) {
      const exists = chats.some((c) => c.id === id);
      if (exists) setActiveChat(id);
    } else {
      setActiveChat(null);
    }
  }, [id, chats, setActiveChat]);

  const activeChat = activeChatId ? getChat(activeChatId) : undefined;
  const showEmpty = !activeChat || activeChat.messages.length === 0;

  const handleSend = async (text: string) => {
    let chatId = activeChatId;
    if (!chatId) {
      chatId = createChat();
      navigate(`${chatBasePath}/${chatId}`, { replace: true });
    }
    addMessage(chatId, { role: "user", content: text });
    const assistantId = addMessage(chatId, { role: "assistant", content: "" });
    setIsSending(true);

    let pending = "";
    let rafId: number | null = null;
    const flush = () => {
      if (pending) {
        appendToMessage(chatId!, assistantId, pending);
        pending = "";
      }
      rafId = null;
    };
    const scheduleFlush = () => {
      if (rafId === null) rafId = requestAnimationFrame(flush);
    };

    try {
      await streamQuestion(
        text,
        {
          onToken: (token) => {
            pending += token;
            scheduleFlush();
          },
          onReplace: (answer) => {
            if (rafId !== null) cancelAnimationFrame(rafId);
            pending = "";
            setMessageContent(chatId!, assistantId, answer);
          },
          onError: (message) => {
            throw new Error(message);
          },
        },
        { bookId: selectedBookId },
      );
      if (rafId !== null) cancelAnimationFrame(rafId);
      flush();
    } catch (err) {
      if (rafId !== null) cancelAnimationFrame(rafId);
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      setMessageContent(
        chatId,
        assistantId,
        `Sorry, ${message}`,
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-[#171717] text-[#e8e6e1]">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar activeChatId={activeChatId} />
      </div>

      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/30 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
            />
            <motion.div
              className="fixed inset-y-0 left-0 z-50 md:hidden"
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <Sidebar
                activeChatId={activeChatId}
                onCloseMobile={() => setSidebarOpen(false)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-white/[0.08] bg-[#101114]/95 px-4 backdrop-blur md:px-6">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-[#9a9790] hover:bg-[#2a2a2a] md:hidden"
            aria-label="Open menu"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="hidden h-2 w-2 shrink-0 rounded-full bg-[#75d083] shadow-[0_0_12px_rgba(117,208,131,0.8)] sm:inline-block" />
              <p className="truncate text-sm font-semibold text-[#f1efe9]">
              {activeChat?.title && activeChat.title !== "New chat"
                ? activeChat.title
                : "ReszVault chat"}
              </p>
            </div>
            <div className="mt-1 flex min-w-0 items-center gap-2 text-[11px] text-[#9a9790]">
              <span className="truncate">{activeProject?.name ?? "Project"}</span>
              <span className="text-[#5f5c57]">/</span>
              <span className="truncate">Source: {selectedLabel}</span>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden rounded-full border border-white/[0.08] bg-[#17181c] px-3 py-1.5 text-[11px] font-medium text-[#b8b4aa] sm:inline-flex">
              {user ? "Private vault" : "Guest vault"}
            </span>
            {user ? (
              <Link
                to="/settings"
                className="hidden rounded-md border border-white/[0.08] px-3 py-1.5 text-xs font-medium text-[#b8b4aa] transition-colors hover:border-[#c87c5a] hover:text-[#c87c5a] sm:block"
              >
                Account
              </Link>
            ) : (
              <Link
                to="/login"
                className="rounded-md bg-[#c87c5a] px-3 py-1.5 text-xs font-semibold text-[#181818] transition-colors hover:bg-[#d89270]"
              >
                Sign in
              </Link>
            )}
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <section className="min-w-0 flex-1">
            {showEmpty && !isSending ? (
              <EmptyState onSend={handleSend} disabled={isSending} />
            ) : activeChat ? (
              <ChatWindow
                chat={activeChat}
                onSend={handleSend}
                isSending={isSending}
                streamingMessageId={
                  isSending
                    ? activeChat.messages[activeChat.messages.length - 1]?.id
                    : undefined
                }
              />
            ) : (
              <EmptyState onSend={handleSend} disabled={isSending} />
            )}
          </section>

          <aside className="hidden w-[314px] shrink-0 border-l border-white/[0.08] bg-[#101114] p-4 xl:block">
            <div className="rounded-xl border border-white/[0.08] bg-[#17181c] p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#c87c5a]">
                Sources
              </p>
              <div className="mt-3 rounded-lg border border-white/[0.08] bg-[#0b0c0f] p-3">
                <div className="flex items-center justify-between gap-3">
                  <strong className="truncate text-sm text-[#f1efe9]">{selectedLabel}</strong>
                  <span className="h-2 w-2 rounded-full bg-[#75d083] shadow-[0_0_12px_rgba(117,208,131,0.8)]" />
                </div>
                <p className="mt-2 text-xs leading-relaxed text-[#8f8b84]">
                  Active retrieval scope. Answers use this source context when
                  the vault index is reachable.
                </p>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                {[
                  ["21", "docs"],
                  ["64", "runs"],
                  ["5", "top-k"],
                ].map(([value, label]) => (
                  <div key={label} className="rounded-lg border border-white/[0.08] bg-[#0b0c0f] px-2 py-3">
                    <strong className="block font-mono text-sm text-[#e8e6e1]">{value}</strong>
                    <span className="mt-1 block text-[10px] uppercase tracking-wider text-[#77736c]">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-white/[0.08] bg-[#17181c] p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#c87c5a]">
                Studio
              </p>
              <div className="mt-3 space-y-2">
                {["Briefing note", "Contradictions", "Obsidian outline"].map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="w-full rounded-lg border border-white/[0.08] bg-[#0b0c0f] px-3 py-2 text-left text-xs font-semibold text-[#c9c4ba] transition hover:border-[#c87c5a]/50 hover:text-[#f1efe9]"
                    onClick={() => handleSend(`Create a ${item.toLowerCase()} from the active source.`)}
                    disabled={isSending}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-[#75d083]/20 bg-[#75d083]/[0.06] p-4">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#75d083]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#75d083]" />
                Grounding live
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[#9a9790]">
                This rail follows NotebookLM’s source-first layout while the
                center chat keeps the darker live-agent feel.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
