import { useBookStore } from "../store/bookStore";
import { useChatStore } from "../store/chatStore";
import type { VaultProject } from "../store/projectStore";

export function exportVault(project: VaultProject) {
  const books = useBookStore.getState().projectBooks(project.id);
  const chats = useChatStore
    .getState()
    .chats.filter((chat) => chat.projectId === project.id);
  const content = [
    `# ${project.name}`,
    project.description,
    "## Notes",
    project.notes?.trim() || "No notes yet.",
    "## Sources",
    ...books.map(
      (book) =>
        `- [[${book.title}]] — ${book.chunkCount} chunks (${book.status})`,
    ),
    "## Conversations",
    ...chats.map(
      (chat) =>
        `### ${chat.title}\n\n${chat.messages.map((message) => `**${message.role === "user" ? "You" : "ReszVault"}**\n\n${message.content}`).join("\n\n")}`,
    ),
  ].join("\n\n");
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/markdown;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${
    project.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "vault"
  }.md`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
