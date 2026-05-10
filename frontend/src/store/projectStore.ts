import { create } from "zustand";
import { persist } from "zustand/middleware";

export type VaultProject = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

type ProjectState = {
  projects: VaultProject[];
  activeProjectId: string | null;
  createProject: (input: { name: string; description?: string }) => string;
  selectDefaultProject: () => void;
  selectProject: (id: string) => void;
  activeProject: () => VaultProject | null;
};

const starterProjects: VaultProject[] = [
  {
    id: "default-research-vault",
    name: "Research Vault",
    description: "A general workspace for uploaded PDFs, summaries, and source-grounded chat.",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
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
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          projects: [project, ...state.projects],
          activeProjectId: id,
        }));
        return id;
      },

      selectDefaultProject: () => set({ activeProjectId: starterProjects[0].id }),
      selectProject: (id) => set({ activeProjectId: id }),

      activeProject: () => {
        const { projects, activeProjectId } = get();
        return projects.find((project) => project.id === activeProjectId) ?? null;
      },
    }),
    {
      name: "reszvault-projects",
    },
  ),
);
