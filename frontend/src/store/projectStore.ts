import { create } from "zustand";
import { persist } from "zustand/middleware";

export type VaultProject = {
  id: string;
  name: string;
  description: string;
  sourceCount: number;
  graphNodes: number;
  createdAt: string;
  updatedAt: string;
  notes?: string;
  color?: "blue" | "sage" | "sand" | "lilac";
  pinned?: boolean;
};

type ProjectState = {
  projects: VaultProject[];
  activeProjectId: string | null;
  createProject: (input: { name: string; description?: string }) => string;
  selectDefaultProject: () => void;
  selectProject: (id: string) => void;
  activeProject: () => VaultProject | null;
  updateProject: (id: string, update: Partial<Pick<VaultProject, "name" | "description" | "notes" | "color" | "pinned">>) => void;
};

const starterProjects: VaultProject[] = [
  {
    id: "default-research-vault",
    name: "Research Vault",
    description: "A general workspace for uploaded PDFs, summaries, and source-grounded chat.",
    sourceCount: 0,
    graphNodes: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    color: "blue",
  },
];

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: starterProjects,
      activeProjectId: null,

      createProject: ({ name, description }) => {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const project: VaultProject = {
          id,
          name: name.trim(),
          description:
            description?.trim() ||
            "A focused notebook for documents, questions, and grounded answers.",
          sourceCount: 0,
          graphNodes: 0,
          createdAt: now,
          updatedAt: now,
          color: (["blue", "sage", "sand", "lilac"] as const)[get().projects.length % 4],
        };
        set((state) => ({
          projects: [project, ...state.projects],
          activeProjectId: id,
        }));
        return id;
      },

      selectDefaultProject: () => set({ activeProjectId: starterProjects[0].id }),
      selectProject: (id) => set({ activeProjectId: id }),
      updateProject: (id, update) => set((state) => ({
        projects: state.projects.map((project) => project.id === id
          ? { ...project, ...update, updatedAt: new Date().toISOString() }
          : project),
      })),

      activeProject: () => {
        const { projects, activeProjectId } = get();
        return projects.find((project) => project.id === activeProjectId) ?? null;
      },
    }),
    {
      name: "reszvault-projects",
      version: 1,
      migrate: (persisted) => {
        const state = persisted as Partial<ProjectState> | undefined;
        if (!state?.projects) return persisted;
        return {
          ...state,
          projects: state.projects.map((project) => ({
            ...project,
            sourceCount: project.sourceCount ?? 0,
            graphNodes: project.graphNodes ?? 0,
          })),
        };
      },
    },
  ),
);
