"use client";

import Link from "next/link";
import { useMemo } from "react";
import { getTrustHomeOpportunityReadiness } from "../../lib/trust-home-opportunity-readiness";
import { getProfileCompletion } from "../lib/os-state";
import { GwapGradientLink } from "./gwap-gradient-button";
import { useGwapOs } from "./os-provider";

function plural(count: number, singular: string, pluralValue = `${singular}s`) {
  return count === 1 ? singular : pluralValue;
}

export function TrustHomeOpportunityReadiness() {
  const { gnsIdentity, migrationAvailable, state } = useGwapOs();
  const profileCompletion = getProfileCompletion(state.profile);
  const summary = useMemo(
    () => getTrustHomeOpportunityReadiness(state.marketplaceIntents, state.ideaProjects),
    [state.ideaProjects, state.marketplaceIntents],
  );

  const identityContext =
    gnsIdentity.status === "found"
      ? "Identity active"
      : gnsIdentity.status === "none"
        ? "Identity needs setup"
        : "Identity unavailable";
  const reputationContext =
    gnsIdentity.scoreStatus === "scored"
      ? "Reputation active"
      : gnsIdentity.scoreStatus === "unscored"
        ? "Reputation developing"
        : "Reputation unavailable";
  const profileContext =
    profileCompletion >= 67
      ? `Profile strong · ${profileCompletion}%`
      : `Profile ${profileCompletion}% · improve context`;

  if (migrationAvailable) {
    return (
      <section className="gwapos-section" aria-labelledby="opportunity-readiness-title">
        <div className="gwapos-section-head">
          <div>
            <p className="gwapos-kicker">Opportunity Readiness</p>
            <h2 id="opportunity-readiness-title">Resolve workspace authority first</h2>
          </div>
        </div>
        <div className="gwapos-pulse">
          <div className="gwapos-pulse-row">
            <span aria-hidden="true">◇</span>
            <div>
              <p>Private collaboration briefs are hidden</p>
              <small>
                Choose which workspace state is authoritative in the banner above before private brief details appear here.
              </small>
            </div>
            <strong>Resolve</strong>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="gwapos-section" aria-labelledby="opportunity-readiness-title">
      <div className="gwapos-section-head">
        <div>
          <p className="gwapos-kicker">Opportunity Readiness</p>
          <h2 id="opportunity-readiness-title">Prepare before matching goes live</h2>
        </div>
        <Link href="/app/marketplace">Open briefs →</Link>
      </div>

      {summary.total ? (
        <>
          <article className="gwapos-next-action">
            <div>
              <h3>
                {summary.ready} {plural(summary.ready, "brief")} ready · {summary.draft}{" "}
                {plural(summary.draft, "draft")}
              </h3>
              <p>
                Private briefs only. Ready means prepared for the future Marketplace adapter; publishing and matching are not live.
              </p>
            </div>
            <GwapGradientLink href="/app/marketplace">Review briefs →</GwapGradientLink>
          </article>

          <div className="gwapos-pulse">
            {summary.briefs.map((brief) => (
              <Link className="gwapos-pulse-row" href="/app/marketplace" key={brief.id}>
                <span aria-hidden="true">↗</span>
                <div>
                  <p>{brief.projectTitle}</p>
                  <small>{brief.roleLabel} needed · private collaboration brief</small>
                </div>
                <strong>{brief.status}</strong>
              </Link>
            ))}
          </div>
        </>
      ) : (
        <article className="gwapos-next-action">
          <div>
            <h3>No collaboration brief yet</h3>
            <p>
              Create a private project brief from Idea Lab. It will remain private; live Marketplace publishing and matching are not connected yet.
            </p>
          </div>
          <GwapGradientLink href="/app/ideas/lab">Prepare a brief →</GwapGradientLink>
        </article>
      )}

      <div className="gwapos-pulse">
        <Link className="gwapos-pulse-row" href="/app/trust">
          <span aria-hidden="true">◎</span>
          <div>
            <p>Trust context</p>
            <small>
              {identityContext} · {reputationContext} · {profileContext} · context only, not a matching decision
            </small>
          </div>
          <strong>Review</strong>
        </Link>
      </div>
    </section>
  );
}
