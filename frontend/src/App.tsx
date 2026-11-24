import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthPage } from "./pages/AuthPage";
import { ChatPage } from "./pages/Chat";
import { Settings } from "./pages/Settings";
import { Home } from "./pages/Home";
import { ProjectsPage } from "./pages/Projects";
import { WorkspacesPage } from "./pages/Workspaces";
import { ProjectWorkspacePage } from "./pages/ProjectWorkspace";
import "./workspaces.css";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/workspaces" element={<WorkspacesPage />} />
        <Route path="/workspaces/:projectId" element={<ProjectWorkspacePage />} />
        <Route path="/workspaces/:projectId/:chatId" element={<ProjectWorkspacePage />} />
        <Route path="/guest" element={<ChatPage allowGuest />} />
        <Route path="/guest/:id" element={<ChatPage allowGuest />} />
        <Route path="/app" element={<ChatPage />} />
        <Route path="/app/:id" element={<ChatPage />} />
        <Route path="/app/pdfs" element={<ChatPage pdfWorkspace />} />
        <Route path="/app/pdfs/:id" element={<ChatPage pdfWorkspace />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
