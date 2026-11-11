import type { ReactNode } from "react";
import { useChatStore } from "../../store/chatStore";
import { Sidebar } from "../Sidebar/Sidebar";
import { Icon } from "../Icon";

export function WorkspaceFrame({
  children,
  aside,
  className = "",
}: {
  children: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`workspace ${className}`}>
      <div className="workspace-frame">
        <Sidebar />
        <main className="workspace-main" id="main-content">
          {children}
        </main>
        {aside}
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  actions,
}: {
  title: ReactNode;
  actions?: ReactNode;
}) {
  const setSidebarOpen = useChatStore((state) => state.setSidebarOpen);
  return (
    <header className="page-header">
      <div className="breadcrumb">
        <button
          className="icon-button mobile-menu"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open navigation"
        >
          <Icon name="menu" />
        </button>
        <span className="breadcrumb-root">
          <Icon name="folder" /> Workspace
        </span>
        <Icon name="chevron" size={13} />
        <span className="breadcrumb-current">{title}</span>
      </div>
      <div className="header-actions">{actions}</div>
    </header>
  );
}
