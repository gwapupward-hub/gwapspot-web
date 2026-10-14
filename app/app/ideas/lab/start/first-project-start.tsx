"use client";

import { track } from "@vercel/analytics";
import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import styles from "./first-project-start.module.css";

type WorkspacePayload = {
  projects?: { total?: number };
  error?: string;
};

type CreateProjectPayload = {
  created?: boolean;
  project?: { id: string };
  error?: string;
};

function safeTrack(name: string, properties: Record<string, string>) {
  try {
    track(name, properties);
  } catch {
    // Product analytics must never interrupt project creation.
  }
}

export function FirstProjectStart() {
  const router = useRouter();
  const { getAccessToken } = usePrivy();
  const [title, setTitle] = useState("");
  const [problemDefinition, setProblemDefinition] = useState("");
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authenticatedFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const token = await getAccessToken();
      const headers = new Headers(init?.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return fetch(input, { ...init, headers, credentials: "same-origin" });
    },
    [getAccessToken],
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await authenticatedFetch("/api/daily-ideas/workspace", {
          cache: "no-store",
        });
        const payload = (await response.json()) as WorkspacePayload;
        if (!response.ok) throw new Error(payload.error || "Idea Lab could not load");
        if (!active) return;
        if ((payload.projects?.total ?? 0) > 0) {
          router.replace("/app/ideas/lab");
          return;
        }
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Idea Lab could not load");
        }
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [authenticatedFetch, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const cleanTitle = title.trim();
    const cleanProblem = problemDefinition.trim();
    if (!cleanTitle || !cleanProblem) {
      setError("Add a project name and describe the problem you want to solve.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await authenticatedFetch("/api/daily-ideas/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-project",
          title: cleanTitle,
          problemDefinition: cleanProblem,
        }),
      });
      const payload = (await response.json()) as CreateProjectPayload;
      if (!response.ok || !payload.created) {
        throw new Error(payload.error || "Project could not be created");
      }
      safeTrack("project_created", {
        category: "general",
        source: "idea_lab_direct",
      });
      router.push("/app/ideas/lab");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Project could not be created");
      setSubmitting(false);
    }
  }

  return (
    <div className={`os-page os-runtime-page idea-lab-v2 ${styles.page}`}>
      <section className={`idea-lab-glass ${styles.card}`} aria-labelledby="first-project-title">
        <span className="os-terminal-label">IDEA LAB · FIRST PROJECT</span>
        <div className={styles.mark} aria-hidden="true">↗</div>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>START WITH WHAT YOU ALREADY KNOW</p>
          <h1 id="first-project-title">Turn your idea into a project.</h1>
          <p>
            Give GWAP the idea and the problem behind it. Idea Lab will create the project structure without pretending the unanswered parts are already proven.
          </p>
        </div>

        {checking ? (
          <div className={styles.status} aria-live="polite">Checking your workspace…</div>
        ) : (
          <form className={styles.form} onSubmit={submit}>
            <label>
              <span>Project name</span>
              <input
                autoComplete="off"
                maxLength={120}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="What are you building?"
                required
                value={title}
              />
            </label>
            <label>
              <span>Problem to solve</span>
              <textarea
                maxLength={1600}
                onChange={(event) => setProblemDefinition(event.target.value)}
                placeholder="Who has this problem, and what is frustrating, expensive, slow, risky, or missing today?"
                required
                rows={6}
                value={problemDefinition}
              />
            </label>

            {error ? <p className={styles.error} role="alert">{error}</p> : null}

            <div className={styles.actions}>
              <button type="submit" disabled={submitting}>
                {submitting ? "Creating project…" : "Create project"}
              </button>
              <Link href="/app/ideas">Need an idea? Discover opportunities</Link>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
