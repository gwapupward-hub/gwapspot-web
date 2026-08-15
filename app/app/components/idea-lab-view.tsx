"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useGwapOs } from "./os-provider";
import type { IdeaProject } from "../lib/os-state";

const fields: [
  keyof Pick<
    IdeaProject,
    | "problem"
    | "targetUser"
    | "businessModel"
    | "technicalPlan"
    | "estimatedCost"
    | "mvpRoadmap"
    | "notes"
  >,
  string,
  string,
][] = [
  ["problem", "Problem", "What exact pain or inefficiency are you solving?"],
  ["targetUser", "Target user", "Who feels this problem most strongly?"],
  ["businessModel", "Business model", "How could this create sustainable value or revenue?"],
  ["technicalPlan", "Technical plan", "Core stack, integrations, data and architecture."],
  ["estimatedCost", "Estimated cost", "MVP budget, infrastructure and major cost drivers."],
  ["mvpRoadmap", "MVP roadmap", "Validation steps and the smallest credible launch sequence."],
  ["notes", "Research / notes", "Evidence, assumptions, competitors, risks and open questions."],
];

function compactWallet(wallet: string) {
  return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
}

export function IdeaLabView() {
  const {
    account,
    gnsIdentity,
    state,
    updateIdeaProject,
    removeIdeaProject,
    syncStatus,
  } = useGwapOs();
  const [selectedId, setSelectedId] = useState(state.ideaProjects[0]?.id ?? "");
  const selected = useMemo(
    () => state.ideaProjects.find((project) => project.id === selectedId) ?? state.ideaProjects[0] ?? null,
    [selectedId, state.ideaProjects],
  );

  const owner = gnsIdentity.fullName || compactWallet(account.verifiedWallet);
  const score = gnsIdentity.score ?? "Unscored";
  const tier = gnsIdentity.scoreTier ?? gnsIdentity.tier ?? "—";

  if (!selected) {
    return (
      <div className="os-page os-runtime-page">
        <header className="os-runtime-heading">
          <span className="os-terminal-label">~/ideas/lab</span>
          <h1>Idea Lab.</h1>
          <p>Develop a saved Daily Idea into a concrete validation and MVP plan.</p>
        </header>
        <section className="os-runtime-panel">
          <h2>No active projects.</h2>
          <p>Open Daily Ideas, save an opportunity, then choose Develop Idea to start its workspace.</p>
          <Link href="/app/ideas">Open Daily Ideas</Link>
        </section>
      </div>
    );
  }

  return (
    <div className="os-page os-runtime-page">
      <header className="os-runtime-heading">
        <span className="os-terminal-label">~/ideas/lab · {syncStatus}</span>
        <h1>Idea Lab.</h1>
        <p>Move an opportunity from interesting to executable. Your live GWAP identity travels with the project context.</p>
      </header>

      <section className="os-runtime-grid">
        <aside className="os-runtime-panel os-runtime-note">
          <span className="os-terminal-label">PROJECTS · {state.ideaProjects.length}/8</span>
          {state.ideaProjects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => setSelectedId(project.id)}
              aria-pressed={project.id === selected.id}
            >
              <strong>{project.title}</strong><br />
              <small>{project.status}</small>
            </button>
          ))}

          <div className="os-console-chrome">
            <span>gwappass.identity</span>
            <span>{gnsIdentity.status.toUpperCase()}</span>
          </div>
          <p><strong>{owner}</strong></p>
          <p>GwapScore: <strong>{score}</strong> · Tier: <strong>{tier}</strong></p>
          <p>This attribution is resolved live from the authenticated GWAP identity layer rather than copied into project state.</p>
          <div>
            <Link href="/app/identity">Open Identity</Link>{" · "}
            <Link href="/app/score">View Score</Link>
            {gnsIdentity.profileUrl ? <> · <a href={gnsIdentity.profileUrl}>Public Profile</a></> : null}
          </div>
        </aside>

        <article className="os-runtime-panel">
          <div className="os-console-chrome">
            <span>idea-lab.workspace</span>
            <span>{selected.status.toUpperCase()}</span>
          </div>

          <label>
            Project title
            <input
              value={selected.title}
              maxLength={120}
              onChange={(event) => updateIdeaProject(selected.id, { title: event.target.value })}
            />
          </label>
          <label>
            Status
            <select
              value={selected.status}
              onChange={(event) => updateIdeaProject(selected.id, { status: event.target.value as IdeaProject["status"] })}
            >
              <option>Exploring</option>
              <option>Validating</option>
              <option>Building</option>
            </select>
          </label>

          {fields.map(([key, label, placeholder]) => (
            <label key={key}>
              {label}
              <textarea
                value={selected[key]}
                placeholder={placeholder}
                rows={key === "technicalPlan" || key === "mvpRoadmap" ? 6 : 4}
                onChange={(event) => updateIdeaProject(selected.id, { [key]: event.target.value })}
              />
            </label>
          ))}

          <section className="os-runtime-note">
            <span className="os-terminal-label">ECOSYSTEM HANDOFF</span>
            <h2>Move this project into execution.</h2>
            <p>Use the Marketplace for services and collaborators, or open the developer surface when the project is ready for GWAP APIs.</p>
            <div>
              <Link href="/app/marketplace">Open Marketplace</Link>{" · "}
              <Link href="/app/developer">Developer APIs</Link>{" · "}
              <Link href="/app/ideas">Back to Daily Ideas</Link>
            </div>
          </section>

          <button
            type="button"
            onClick={() => {
              removeIdeaProject(selected.id);
              setSelectedId("");
            }}
          >
            Archive project
          </button>
        </article>
      </section>
    </div>
  );
}
