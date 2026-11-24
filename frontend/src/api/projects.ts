import axios from "axios";
import { api } from "./client";
import type { BookRecord } from "./books";
import type { RepositoryIndex } from "./github";

export type Project = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  pdfCount: number;
  repoCount: number;
};

export type ProjectRepository = RepositoryIndex & { id: number; name: string };

export type ProjectDetail = Omit<Project, "pdfCount" | "repoCount"> & {
  pdfs: BookRecord[];
  repositories: ProjectRepository[];
};

type ProjectAnswer = {
  answer: string;
  sources: { id: number; title: string; kind: string; url?: string; page?: number }[];
  unavailable: string[];
};

const projectsPath = "/api/projects";

export async function listProjects(signal?: AbortSignal) {
  const { data } = await api.get<Project[]>(projectsPath, { signal });
  if (!Array.isArray(data)) throw new Error("The project API is unavailable.");
  return data;
}

export async function createProject(name: string, description: string) {
  return (await api.post<Project>(projectsPath, { name, description })).data;
}

export async function loadProject(id: string, signal?: AbortSignal) {
  const { data } = await api.get<ProjectDetail>(`${projectsPath}/${id}`, { signal });
  if (!Array.isArray(data?.pdfs) || !Array.isArray(data.repositories)) throw new Error("The project API is unavailable.");
  return data;
}

export async function uploadProjectPdf(id: string, file: File) {
  const data = new FormData();
  data.append("file", file);
  return (await api.post<BookRecord>(`${projectsPath}/${id}/pdfs`, data, {
    headers: { "Content-Type": undefined },
  })).data;
}

export async function attachProjectRepository(id: string, input: string, refresh = false) {
  const repository = input.trim().replace(/^https:\/\/github\.com\//i, "").replace(/\/$/, "").replace(/\.git$/i, "");
  return (await api.post<ProjectRepository>(`${projectsPath}/${id}/repositories`, { repository, refresh })).data;
}

export async function askProject(projectId: string, question: string, previousQuestions: string[]) {
  const { data } = await api.post<ProjectAnswer>(`${projectsPath}/${projectId}/chat`, {
    question, previous_questions: previousQuestions,
  });
  const sources = data.sources.map((source) => {
    const label = `[${source.id}] ${source.title.replace(/[[\]\\*_`\r\n]/g, " ")}`;
    if (source.url?.startsWith("https://github.com/")) {
      return `- ${label} · [Open on GitHub](<${source.url.replace(/[<>]/g, "")}>)`;
    }
    return `- ${label}${source.page ? ` · page ${source.page}` : ""}`;
  });
  return [
    data.answer,
    sources.length ? `**Sources**\n\n${sources.join("\n")}` : "",
    data.unavailable.length ? `Unavailable GitHub sources: ${data.unavailable.join(", ")}.` : "",
  ].filter(Boolean).join("\n\n");
}

export function projectError(error: unknown) {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data;
    if (typeof body?.detail === "string") return body.detail;
    if (typeof body === "object" && body) {
      const message = Object.values(body).find((value) => Array.isArray(value) && typeof value[0] === "string");
      if (Array.isArray(message)) return message[0];
    }
    if (error.response?.status === 404 || typeof body === "string") {
      return "Project unavailable. If this persists, check that the project API is deployed.";
    }
  }
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}
