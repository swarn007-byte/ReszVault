import { create } from "zustand";
import { persist } from "zustand/middleware";

type EditorStyle = { paper: string; font: string; fontSize: number };
export const useEditorStore = create<
  EditorStyle & { update: (style: Partial<EditorStyle>) => void }
>()(
  persist(
    (set) => ({
      paper: "paper",
      font: "serif",
      fontSize: 17,
      update: (style) => set(style),
    }),
    { name: "reszvault-editor" },
  ),
);
