import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthPage } from "./pages/AuthPage";
import { ChatPage } from "./pages/Chat";
import { Settings } from "./pages/Settings";
import { Home } from "./pages/Home";
import { ProjectsPage } from "./pages/Projects";

export default function App() {
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  );
}
