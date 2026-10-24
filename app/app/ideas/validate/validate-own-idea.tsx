"use client";

import { track } from "@vercel/analytics";
import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import styles from "../lab/start/first-project-start.module.css";

type ProjectStatus = "developing" | "validating" | "building" | "launched" | "archived";
type WorkspacePayload = {
  projects?: { items?: Array<{ status: ProjectStatus }>; total?: number };
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
    // Product analytics must never interrupt validation setup.
  }
}

export function ValidateOwnIdea() {
  const router = useRouter();
  const { getAccessToken } = usePrivy();
  const [title, setTitle] = useState("");
  const [problemDefinition, setProblemDefinition] = useState("");
  const [targetCustomer, setTargetCustomer] = useState("");
  const [validationTest, setValidationTest] = useState("");
  const [checking, setChecking] = useState(true);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [resumeAvailable, setResumeAvailable] = useState(false);
  const [showForm, setShowForm] = useState(false);
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
        if (!response.ok) throw new Error(payload.error || "Validation workspace could not load");
        if (!active) return;

        const canResume = (payload.projects?.items ?? []).some((project) =>
          project.status === "developing" || project.status === "validating",
        );
        setResumeAvailable(canResume);
        setShowForm(!canResume);
        setWorkspaceReady(true);
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Validation workspace could not load");
        }
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [authenticatedFetch]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !workspaceReady) return;

    const cleanTitle = title.trim();
    const cleanProblem = problemDefinition.trim();
    const cleanCustomer = targetCustomer.trim();
    const cleanTest = validationTest.trim();
    if (!cleanTitle || !cleanProblem || !cleanCustomer || !cleanTest) {
      setError("Add the idea, problem, target customer, and first validation test.");
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
          targetCustomer: cleanCustomer,
          validationPlan: [cleanTest],
        }),
      });
      const payload = (await response.json()) as CreateProjectPayload;
      if (!response.ok || !payload.created) {
        throw new Error(payload.error || "Validation project could not be created");
      }

      safeTrack("project_created", {
        category: "general",
        source: "validation_intake",
      });
      router.push("/app/ideas/lab");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Validation project could not be created");
      setSubmitting(false);
    }
  }

  return (
    <div className={`os-page os-runtime-page idea-lab-v2 ${styles.page}`}>
      <section className={`idea-lab-glass ${styles.card}`} aria-labelledby="validate-own-idea-title">
        <span className="os-terminal-label">DAILY IDEAS · VALIDATION INTAKE</span>
        <div className={styles.mark} aria-hidden="true">✓</div>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>PROVE THE PROBLEM BEFORE THE BUILD</p>
          <h1 id="validate-own-idea-title">Validate the idea you already have.</h1>
          <p>
            Define the problem, who feels it, and the first real-world test. GWAP will put that context into the same Idea Lab project lifecycle you use to build and launch.
          </p>
        </div>

        {checking ? (
          <div className={styles.status} aria-live="polite">Checking your workspace…</div>
        ) : !workspaceReady ? (
          <div className={styles.status} aria-live="polite">
            <div>
              <p className={styles.error} role="alert">{error || "Validation workspace is unavailable."}</p>
              <button type="button" onClick={() => window.location.reload()}>Retry workspace check</button>
            </div>
          </div>
        ) : resumeAvailable && !showForm ? (
          <div className={styles.status}>
            <div>
              <strong>You already have a project ready to keep moving.</strong>
              <span>Resume the existing Idea Lab work first, or explicitly start validation for a different idea.</span>
              <div className={styles.actions}>
                <button type="button" onClick={() => router.push("/app/ideas/lab")}>Resume in Idea Lab</button>
                <button className={styles.secondaryAction} type="button" onClick={() => setShowForm(true)}>Validate a different idea</button>
              </div>
            </div>
          </div>
        ) : (
          <form className={styles.form} onSubmit={submit}>
            <label>
              <span>Idea or project name</span>
              <input
                autoComplete="off"
                maxLength={120}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="What are you considering building?"
                required
                value={title}
              />
            </label>
            <label>
              <span>Problem to validate</span>
              <textarea
                maxLength={1600}
                onChange={(event) => setProblemDefinition(event.target.value)}
                placeholder="What is painful, expensive, slow, risky, or missing today?"
                required
                rows={5}
                value={problemDefinition}
              />
            </label>
            <label>
              <span>Target customer</span>
              <textarea
                maxLength={900}
                onChange={(event) => setTargetCustomer(event.target.value)}
                placeholder="Who experiences this problem strongly enough that you should talk to them first?"
                required
                rows={3}
                value={targetCustomer}
              />
            </label>
            <label>
              <span>First validation test</span>
              <textarea
                maxLength={600}
                onChange={(event) => setValidationTest(event.target.value)}
                placeholder="Example: Interview 5 target users this week and ask how they solve the problem now, what it costs them, and what would make them switch."
                required
                rows={4}
                value={validationTest}
              />
            </label>

            {error ? <p className={styles.error} role="alert">{error}</p> : null}

            <div className={styles.actions}>
              <button type="submit" disabled={submitting}>
                {submitting ? "Preparing validation…" : "Prepare validation project"}
              </button>
              <Link href="/app/ideas">Need inspiration? Browse Daily Ideas</Link>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
