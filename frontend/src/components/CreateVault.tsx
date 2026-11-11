import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useProjectStore } from "../store/projectStore";
import { Icon } from "./Icon";

export function CreateVault({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const createProject = useProjectStore((state) => state.createProject);
  const { user } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    createProject({ name: name.trim(), description });
    onClose();
    navigate(user ? "/app" : "/guest");
  };
  return (
    <dialog
      ref={dialog}
      className="modal"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      aria-labelledby="create-vault-title"
    >
      <div className="modal-card">
        <div className="modal-heading">
          <span className="soft-icon">
            <Icon name="folder" size={24} />
          </span>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <Icon name="close" />
          </button>
        </div>
        <h2 id="create-vault-title">A space for your next idea.</h2>
        <p>Keep related documents, questions, and notes in one vault.</p>
        <form onSubmit={submit}>
          <label>
            Vault name
            <input
              autoFocus
              required
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name your vault"
            />
          </label>
          <label>
            Description <span className="muted">(optional)</span>
            <textarea
              rows={3}
              maxLength={300}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What are you exploring?"
            />
          </label>
          <div className="modal-footer">
            <button type="button" className="button" onClick={onClose}>
              Cancel
            </button>
            <button className="button primary" disabled={!name.trim()}>
              Create vault <Icon name="arrow" size={16} />
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
