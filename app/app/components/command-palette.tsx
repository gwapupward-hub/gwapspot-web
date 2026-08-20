"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

const commands = [
  { label: "Build my reputation", path: "/app/score", hint: "GwapScore · trust · reputation · credibility" },
  { label: "Verify my identity", path: "/app/identity", hint: "GNS · .gwap · identity · name" },
  { label: "Strengthen my profile", path: "/app/profile", hint: "profile · bio · public identity" },
  { label: "Understand my portfolio", path: "/app", hint: "wallet · balance · tokens · assets · portfolio" },
  { label: "Find an opportunity", path: "/app/ideas", hint: "Daily Ideas · discover · build · launch" },
  { label: "Turn trust into work", path: "/app/marketplace", hint: "Marketplace · hire · freelance · client · work" },
  { label: "Prove something privately", path: "/app/vault", hint: "Proof Vault · proof · credential · evidence" },
  { label: "Integrate GWAP", path: "/app/developer", hint: "Developer API · API key · integrate · builders" },
  { label: "Open GWAP OS home", path: "/app", hint: "home · dashboard · overview" },
  { label: "Open settings", path: "/app/settings", hint: "settings · preferences · account" },
] as const;

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return commands;
    const terms = value.split(/\s+/).filter(Boolean);
    return commands.filter((command) => {
      const searchable = `${command.label} ${command.hint}`.toLowerCase();
      return terms.every((term) => searchable.includes(term));
    });
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
    setQuery("");
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
        aria-label="GWAP OS action bar"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="os-command-search">
          <span aria-hidden="true">✦</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="What do you want to do in GWAP OS?"
            aria-label="Search GWAP actions"
          />
          <kbd>ESC</kbd>
        </div>
        <div className="os-command-list">
          {filtered.map((command) => (
            <button
              type="button"
              key={`${command.path}-${command.label}`}
              onClick={() => {
                onOpenChange(false);
                router.push(command.path);
              }}
            >
              <span>{command.label}</span>
              <small>{command.hint}</small>
            </button>
          ))}
          {!filtered.length ? (
            <p>No action matches that request yet. Try identity, reputation, wallet, proof, opportunity, marketplace, or API.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
