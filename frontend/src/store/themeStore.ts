import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "dark" | "light";

type ThemeState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "light",
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      toggleTheme: () => {
        const next = get().theme === "dark" ? "light" : "dark";
        applyTheme(next);
        set({ theme: next });
      },
    }),
    {
      name: "reszvault-theme",
      onRehydrateStorage: () => (state) => {
        if (state?.theme) applyTheme(state.theme);
      },
    },
  ),
);

/** Call once before React render to avoid flash */
export function initTheme() {
  const stored = localStorage.getItem("reszvault-theme");
  let theme: Theme = "light";
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as { state?: { theme?: Theme } };
      if (parsed.state?.theme) theme = parsed.state.theme;
    } catch {
      /* use default */
    }
  }
  applyTheme(theme);
}
