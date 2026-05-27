import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Sidebar } from "../Sidebar/Sidebar";
import { useChatStore } from "../../store/chatStore";
import { EmptyState } from "../EmptyState/EmptyState";
import { ChatWindow } from "../ChatWindow/ChatWindow";
import { streamQuestion } from "../../api/chat";
import { useBookStore } from "../../store/bookStore";
import { useProjectStore } from "../../store/projectStore";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64) || "reszvault";
}

function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

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
  const activeProject = useProjectStore((s) => s.activeProject());
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const books = useBookStore((s) => s.books);
  const projectBookIds = useBookStore((s) => s.projectBookIds);
  const fetchBooks = useBookStore((s) => s.fetchBooks);
  const [connectState, setConnectState] = useState<"idle" | "done">("idle");
  const scopedBooks = useMemo(() => {
    if (!activeProjectId) return books;
    const ids = projectBookIds[activeProjectId];
    const hasAnyProjectMap = Object.values(projectBookIds).some((bookIds) => bookIds.length > 0);
    if (!ids && !hasAnyProjectMap) return books;
    if (!ids) return [];
    const idSet = new Set(ids);
    return books.filter((book) => idSet.has(book.id));
  }, [activeProjectId, books, projectBookIds]);
  const selectedBookIds = useMemo(() => {
    return scopedBooks
      .filter((book) => book.status === "ready")
      .map((book) => book.id);
  }, [scopedBooks]);
  const isGuestRoute = location.pathname.startsWith("/guest");
  const chatBasePath = isGuestRoute ? "/guest" : "/app";

  useEffect(() => {
    setSidebarOpen(false);
    const t = setTimeout(() => setHistoryLoading(false), 400);
    return () => clearTimeout(t);
  }, [setHistoryLoading, setSidebarOpen]);

  useEffect(() => {
    void fetchBooks(activeProjectId);
  }, [activeProjectId, fetchBooks]);

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

  const handleConnectVault = () => {
    const readyBooks = scopedBooks.filter((book) => book.status === "ready");
    const projectName = activeProject?.name ?? "Research Vault";
    const chatMessages = activeChat?.messages ?? [];
    const markdown = [
      "---",
      "source: reszvault",
      `project: ${projectName}`,
      `exported: ${new Date().toISOString()}`,
      "---",
      "",
      `# ${projectName}`,
      "",
      "## Sources",
      readyBooks.length
        ? readyBooks
            .map((book) => `- [[${book.title}]] - ${book.chunkCount} indexed chunks`)
            .join("\n")
        : "- No PDFs uploaded yet.",
      "",
      "## Source Graph",
      readyBooks.length
        ? readyBooks
            .map((book) => `- [[${projectName}]] -> [[${book.title}]]`)
            .join("\n")
        : "- Upload PDFs to build the project graph.",
      "",
      "## Current Chat",
      chatMessages.length
        ? chatMessages
            .map((message) => {
              const speaker = message.role === "user" ? "User" : "ReszVault";
              return `### ${speaker}\n\n${message.content || "_Streaming..._"}`;
            })
            .join("\n\n")
        : "_No chat messages yet._",
      "",
    ].join("\n");

    const filename = `${slugify(projectName)}-reszvault.md`;
    downloadMarkdown(filename, markdown);

    const obsidianUrl = `obsidian://new?name=${encodeURIComponent(
      filename.replace(/\.md$/i, ""),
    )}&content=${encodeURIComponent(markdown.slice(0, 14000))}`;
    window.setTimeout(() => {
      window.location.href = obsidianUrl;
    }, 80);

    setConnectState("done");
    window.setTimeout(() => setConnectState("idle"), 2200);
  };

  const handleSend = async (text: string) => {
    let chatId = activeChatId;
    if (!chatId) {
      chatId = createChat();
      navigate(`${chatBasePath}/${chatId}`, { replace: true });
    }
    addMessage(chatId, { role: "user", content: text });
    const assistantId = addMessage(chatId, { role: "assistant", content: "" });

    if (selectedBookIds.length === 0) {
      setMessageContent(
        chatId,
        assistantId,
        "Upload one or more PDFs first, then I can answer from your sources.",
      );
      return;
    }

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
        { bookIds: selectedBookIds },
      );
      if (rafId !== null) cancelAnimationFrame(rafId);
      flush();
    } catch (err) {
      if (rafId !== null) cancelAnimationFrame(rafId);
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      const friendlyMessage =
        /database connection|vault index|No book context|Sources not found/i.test(message)
          ? "I could not reach a source for this chat. Upload a PDF or choose an indexed project source."
          : message;
      setMessageContent(
        chatId,
        assistantId,
        friendlyMessage,
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="rv-chat-shell h-[100dvh] overflow-hidden bg-[#dfe3e9] p-0 text-[#242731]">
      <div className="mx-auto flex h-full w-full overflow-hidden bg-[#f7f8fa]">
        {/* Desktop sidebar */}
        <div className="hidden md:flex">
          <Sidebar activeChatId={activeChatId} />
        </div>

        {/* Mobile overlay */}
        <AnimatePresence>
          {sidebarOpen && (
            <>
              <motion.div
                className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm md:hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSidebarOpen(false)}
              />
              <motion.div
                className="fixed inset-y-0 left-0 z-50 md:hidden"
                initial={{ x: -300 }}
                animate={{ x: 0 }}
                exit={{ x: -300 }}
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
        <header className="flex min-h-[92px] shrink-0 items-center gap-4 border-b border-[#eceef2] bg-white px-5 md:px-9">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-[#6f7480] hover:bg-[#f1f3f6] md:hidden"
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
          <img
            src="/github-avatar.png"
            alt=""
            className="h-11 w-11 shrink-0 rounded-full object-cover shadow-sm"
          />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-lg font-semibold tracking-[-0.01em] text-[#1f222a]">
                {activeChat?.title && activeChat.title !== "New chat"
                  ? activeChat.title
                  : "ReszVault"}
              </p>
            </div>
            <p className="mt-0.5 truncate text-sm text-[#6e737d]">
              Source-grounded workspace
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={handleConnectVault}
              className="hidden h-11 items-center gap-2 rounded-xl border border-[#e4e6eb] bg-white px-4 text-sm font-semibold text-[#4d535f] transition hover:bg-[#f8f9fb] sm:inline-flex"
              aria-label="Connect Obsidian"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M7 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM17 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM17 14a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
                <path d="m10.3 9.3 3.9-1.5M10.4 14.8l3.5 1.3" />
              </svg>
              <span>{connectState === "done" ? "Exported" : "Connect"}</span>
            </button>
          </div>
        </header>

        <section className="min-h-0 min-w-0 flex-1">
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
        </main>
      </div>
    </div>
  );
}
