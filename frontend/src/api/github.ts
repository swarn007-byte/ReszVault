import axios from "axios";
import { getSessionToken } from "../lib/auth-client";

const githubApi = axios.create({ timeout: 60000, withCredentials: true });
githubApi.interceptors.request.use((config) => {
  const token = getSessionToken();
  if (token) config.headers.set("x-session-token", token);
  return config;
});

export async function getGitHubAccess() {
  const { data } = await githubApi.get<{ installationUrl: string }>("/api/github/access");
  return data.installationUrl;
}

export async function authorizeRepository(repository: string) {
  const parts = repository.trim().replace(/^https:\/\/github\.com\//i, "").replace(/\/$/, "").split("/");
  if (parts.length !== 2 || !/^[a-z\d][a-z\d-]*$/i.test(parts[0]) || !/^[a-z\d_.-]+$/i.test(parts[1])) {
    throw new Error("Enter a GitHub repository as owner/name.");
  }
  const path = parts.map(encodeURIComponent).join("/");
  const { data } = await githubApi.get<{ repository: string }>(`/api/github/repositories/${path}`);
  return data.repository;
}

export async function askGitHub(repository: string, question: string) {
  const { data } = await githubApi.post<{
    answer: string;
    sources: { id: number; title: string; url: string; kind: string }[];
  }>("/api/github/chat", { repository, question });
  const links = data.sources.map(({ id, url, kind }) => `[${id} · ${kind}](${url})`).join(" · ");
  return links ? `${data.answer}\n\nSources: ${links}` : data.answer;
}

export function githubError(error: unknown) {
  if (axios.isAxiosError(error) && typeof error.response?.data?.detail === "string") {
    return error.response.data.detail;
  }
  return error instanceof Error ? error.message : "GitHub request failed. Try again.";
}

export type RepositoryIndex = {
  state: "missing" | "syncing" | "ready" | "stale" | "failed";
  sourceCount: number;
  syncedAt: number | null;
};

export async function loadRepositoryIndex(repository: string, action: "status" | "start" | "refresh") {
  const path = repository.split("/").map(encodeURIComponent).join("/");
  const url = `/api/github/repositories/${path}/index`;
  const { data } = action === "status"
    ? await githubApi.get<RepositoryIndex>(url)
    : await githubApi.post<RepositoryIndex>(url, undefined, { params: { force: action === "refresh" } });
  return data;
}
