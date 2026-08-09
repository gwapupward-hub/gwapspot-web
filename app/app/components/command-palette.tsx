"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

const commands = [
  { label: "Open Home", path: "/app", hint: "~/home" },
  { label: "Open Marketplace", path: "/app/marketplace", hint: "~/marketplace/browse" },
  { label: "Open Identity / GNS", path: "/app/identity", hint: "~/identity" },
  { label: "Open Private Proof Vault", path: "/app/vault", hint: "~/vault" },
  { label: "Open GwapScore", path: "/app/score", hint: "~/score" },
  { label: "Open Settings", path: "/app/settings", hint: "~/settings" },
] as const;

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return commands;
    return commands.filter((command) =>
      `${command.label} ${command.hint}`.toLowerCase().includes(value),
    );
  }, [query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, open]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  return (
    <div className="os-command-backdrop" role="presentation" onMouseDown={() => onOpenChange(false)}>
      <section
        className="os-command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="GWAP OS command palette"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="os-command-search">
          <span aria-hidden="true">$</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Type a command..."
            aria-label="Search commands"
          />
          <kbd>ESC</kbd>
        </div>
        <div className="os-command-list">
          {filtered.map((command) => (
            <button
              type="button"
              key={command.path}
              onClick={() => {
                onOpenChange(false);
                router.push(command.path);
              }}
            >
              <span>{command.label}</span>
              <small>{command.hint}</small>
            </button>
          ))}
          {!filtered.length ? <p>No command matches that query.</p> : null}
        </div>
      </section>
    </div>
  );
}
