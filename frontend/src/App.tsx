import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

const Home = lazy(() =>
  import("./pages/Home").then((module) => ({ default: module.Home })),
);
const ProjectsPage = lazy(() =>
  import("./pages/Projects").then((module) => ({
    default: module.ProjectsPage,
  })),
);
const ChatPage = lazy(() =>
  import("./pages/Chat").then((module) => ({ default: module.ChatPage })),
);
const Settings = lazy(() =>
  import("./pages/Settings").then((module) => ({ default: module.Settings })),
);
const AuthPage = lazy(() => import("./pages/AuthPage"));

export default function App() {
  return (
    <BrowserRouter>
      <Suspense
        fallback={
          <div
            className="rv-auth-page"
            role="status"
            aria-label="Opening your workspace"
          >
            <span className="spinner" />
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<AuthPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/guest" element={<ChatPage allowGuest />} />
          <Route path="/guest/:id" element={<ChatPage allowGuest />} />
          <Route path="/app" element={<ChatPage />} />
          <Route path="/app/:id" element={<ChatPage />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
