import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useProjectStore } from "./projectStore";

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  sourcesUsed?: number;
};

export type Chat = {
  id: string;
  projectId: string;
  title: string;
  messages: Message[];
  updatedAt: string;
  createdAt: string;
};

type ChatState = {
  chats: Chat[];
  activeChatId: string | null;
  sidebarOpen: boolean;
  historyLoading: boolean;
  isSending: boolean;
  setSidebarOpen: (open: boolean) => void;
  setHistoryLoading: (loading: boolean) => void;
  setIsSending: (sending: boolean) => void;
  setActiveChat: (id: string | null) => void;
  createChat: (projectId?: string) => string;
  deleteChat: (id: string) => void;
  addMessage: (chatId: string, message: Omit<Message, "id" | "createdAt">) => string;
  appendToMessage: (chatId: string, messageId: string, delta: string) => void;
  setMessageContent: (chatId: string, messageId: string, content: string) => void;
  setMessageSources: (chatId: string, messageId: string, sourcesUsed: number) => void;
  getChat: (id: string) => Chat | undefined;
};

function generateTitle(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "New chat";
  if (/summarize (all )?project sources|summarize the active source/i.test(trimmed)) return "Project summary";
  if (/most important points|key points/i.test(trimmed)) return "Key points";
  if (/clean study notes|make notes/i.test(trimmed)) return "Study notes";
  return trimmed.length > 32 ? `${trimmed.slice(0, 32)}…` : trimmed;
}

function cleanPersistedChats(chats: Chat[] = []) {
  return chats
    .map((chat) => {
      const messages = chat.messages;
      const firstUser = messages.find((message) => message.role === "user");
      return {
        ...chat,
        projectId: chat.projectId ?? "default-research-vault",
        title: firstUser ? generateTitle(firstUser.content) : chat.title,
        messages,
      };
    });
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      chats: [],
      activeChatId: null,
      sidebarOpen: false,
      historyLoading: true,
      isSending: false,

      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setHistoryLoading: (loading) => set({ historyLoading: loading }),
      setIsSending: (sending) => set({ isSending: sending }),
      setActiveChat: (id) => set({ activeChatId: id }),

      createChat: (projectId) => {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const chat: Chat = {
          id,
          projectId: projectId ?? useProjectStore.getState().activeProjectId ?? "default-research-vault",
          title: "New chat",
          messages: [],
          updatedAt: now,
          createdAt: now,
        };
        set((state) => ({
          chats: [chat, ...state.chats],
          activeChatId: id,
        }));
        return id;
      },

      deleteChat: (id) =>
        set((state) => {
          const chats = state.chats.filter((c) => c.id !== id);
          const activeChatId =
            state.activeChatId === id ? (chats[0]?.id ?? null) : state.activeChatId;
          return { chats, activeChatId };
        }),

      addMessage: (chatId, message) => {
        const newMessage: Message = {
          ...message,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          chats: state.chats.map((chat) => {
            if (chat.id !== chatId) return chat;
            const isFirstUser =
              message.role === "user" && chat.messages.length === 0;
            return {
              ...chat,
              title: isFirstUser ? generateTitle(message.content) : chat.title,
              messages: [...chat.messages, newMessage],
              updatedAt: new Date().toISOString(),
            };
          }),
        }));
        return newMessage.id;
      },

      appendToMessage: (chatId, messageId, delta) =>
        set((state) => ({
          chats: state.chats.map((chat) => {
            if (chat.id !== chatId) return chat;
            return {
              ...chat,
              messages: chat.messages.map((m) =>
                m.id === messageId ? { ...m, content: m.content + delta } : m,
              ),
              updatedAt: new Date().toISOString(),
            };
          }),
        })),

      setMessageContent: (chatId, messageId, content) =>
        set((state) => ({
          chats: state.chats.map((chat) => {
            if (chat.id !== chatId) return chat;
            return {
              ...chat,
              messages: chat.messages.map((m) =>
                m.id === messageId ? { ...m, content } : m,
              ),
              updatedAt: new Date().toISOString(),
            };
          }),
        })),

      getChat: (id) => get().chats.find((c) => c.id === id),

      setMessageSources: (chatId, messageId, sourcesUsed) => set((state) => ({
        chats: state.chats.map((chat) => chat.id !== chatId ? chat : {
          ...chat,
          messages: chat.messages.map((message) => message.id === messageId ? { ...message, sourcesUsed } : message),
        }),
      })),
    }),
    {
      name: "reszvault-chats",
      version: 3,
      migrate: (persisted) => {
        const state = persisted as Partial<ChatState> | undefined;
        if (!state) return persisted;
        const chats = cleanPersistedChats(state.chats);
        const activeChatId = chats.some((chat) => chat.id === state.activeChatId)
          ? state.activeChatId
          : (chats[0]?.id ?? null);
        return { ...state, chats, activeChatId };
      },
      partialize: (state) => ({
        chats: cleanPersistedChats(state.chats),
        activeChatId: state.activeChatId,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setSidebarOpen(false);
        state?.setHistoryLoading(false);
        state?.setIsSending(false);
      },
    },
  ),
);
