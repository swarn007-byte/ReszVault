import { motion } from "framer-motion";
import { useThemeStore } from "../store/themeStore";

type ThemeToggleProps = {
  className?: string;
};

export function ThemeToggle({ className = "" }: ThemeToggleProps) {
  const { theme, toggleTheme } = useThemeStore();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`group relative flex h-9 w-9 items-center justify-center rounded-full border border-border/80 bg-elevated/80 text-text-muted transition-colors hover:border-accent/40 hover:text-text ${className}`}
      aria-label={isDark ? "Turn on the light" : "Turn off the light"}
      title={isDark ? "Turn on the light — extinguish the lamp" : "Turn off the light — light the lamp"}
    >
      <motion.span
        key={theme}
        initial={{ opacity: 0, rotate: -30, scale: 0.8 }}
        animate={{ opacity: 1, rotate: 0, scale: 1 }}
        transition={{ duration: 0.25 }}
        className="text-sm"
      >
        {isDark ? "☀" : "☾"}
      </motion.span>
    </button>
  );
}
