"use client";

import { usePrivy } from "@privy-io/react-auth";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  activationElapsedBucket,
  activationSurface,
  createActivationProgress,
  GWAP_ACTIVATION_COOKIE_KEY,
  GWAP_ACTIVATION_STORAGE_KEY,
  isActivationStartPath,
  isAfterSelection,
  parseActivationProgress,
  parseActivationSelection,
  type ActivationProgress,
} from "../../lib/activation-analytics";
import { useGwapOs } from "./os-provider";

const POLL_INTERVAL_MS = 10_000;

type DailyIdeasProject = {
  status: "developing" | "validating" | "building" | "launched" | "archived";
  createdAt: string;
  updatedAt: string;
};

type SocialVerificationRecord = {
  status: "challenge-issued" | "awaiting-post" | "verified" | "revoked" | "expired";
  verifiedAt: string | null;
};

type VerifiedActivityRecord = {
  completedAt: string;
};

function safeTrack(
  name: string,
  properties: Record<string, string | number | boolean>,
) {
  void import("@vercel/analytics")
    .then(({ track }) => track(name, properties))
    .catch(() => undefined);
}

function readCookie(name: string) {
  const prefix = `${name}=`;
  const entry = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!entry) return null;
  try {
    return decodeURIComponent(entry.slice(prefix.length));
  } catch {
    return null;
  }
}

function expireActivationCookie() {
  const host = window.location.hostname.toLowerCase();
  const sharedDomain = host === "gwapspot.com" || host.endsWith(".gwapspot.com");
  const domain = sharedDomain ? "; Domain=.gwapspot.com" : "";
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${GWAP_ACTIVATION_COOKIE_KEY}=; Path=/; Max-Age=0; SameSite=Lax${domain}${secure}`;
}

export function ActivationTelemetry() {
  const pathname = usePathname();
  const { getAccessToken } = usePrivy();
  const { account, gnsIdentity, state } = useGwapOs();
  const [progress, setProgress] = useState<ActivationProgress | null>(null);
  const progressRef = useRef<ActivationProgress | null>(null);

  const persist = useCallback((next: ActivationProgress) => {
    progressRef.current = next;
    setProgress(next);
    try {
      window.localStorage.setItem(GWAP_ACTIVATION_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Analytics state is optional and must never block product use.
    }
  }, []);

  const authenticatedFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const token = await getAccessToken();
      const headers = new Headers(init?.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return fetch(input, { ...init, headers, credentials: "same-origin" });
    },
    [getAccessToken],
  );

  const markResumed = useCallback(
    (milestone: string) => {
      const current = progressRef.current;
      if (!current || !current.startedAt || current.resumedAt || current.completedAt) return;
      const now = new Date().toISOString();
      persist({ ...current, resumedAt: now });
      safeTrack("activation_resumed", {
        intent: current.intent,
        milestone,
        surface: activationSurface(current.intent),
      });
    },
    [persist],
  );

  const markCompleted = useCallback(
    (milestone: string) => {
      const current = progressRef.current;
      if (!current || !current.startedAt || current.completedAt) return;
      const now = new Date().toISOString();
      persist({ ...current, completedAt: now });
      expireActivationCookie();
      safeTrack("activation_completed", {
        completion_kind: "new_milestone",
        elapsed_bucket: activationElapsedBucket(current.selectedAt, now),
        intent: current.intent,
        milestone,
        surface: activationSurface(current.intent),
      });
    },
    [persist],
  );

  useEffect(() => {
    let next: ActivationProgress | null = null;
    try {
      const raw = window.localStorage.getItem(GWAP_ACTIVATION_STORAGE_KEY);
      if (raw) next = parseActivationProgress(JSON.parse(raw) as unknown);
    } catch {
      next = null;
    }

    if (!next) {
      const selection = parseActivationSelection(readCookie(GWAP_ACTIVATION_COOKIE_KEY));
      if (selection) {
        next = createActivationProgress(selection.intent, selection.selectedAt);
      }
    }

    if (!next) return;
    const initialProgress = next;
    const timer = window.setTimeout(() => persist(initialProgress), 0);
    return () => window.clearTimeout(timer);
  }, [persist]);

  useEffect(() => {
    const current = progressRef.current;
    if (!current || current.completedAt) return;

    const identityBaseline =
      current.baselineIdentityFound ??
      (gnsIdentity.status === "found"
        ? true
        : gnsIdentity.status === "none"
          ? false
          : null);
    const reputationBaseline =
      current.baselineReputationScored ??
      (gnsIdentity.scoreStatus === "scored"
        ? true
        : gnsIdentity.scoreStatus === "unscored"
          ? false
          : null);
    const reputationScoreBaseline =
      current.baselineReputationScore ??
      (gnsIdentity.scoreStatus === "scored" &&
      typeof gnsIdentity.score === "number" &&
      Number.isFinite(gnsIdentity.score)
        ? gnsIdentity.score
        : null);

    if (
      identityBaseline !== current.baselineIdentityFound ||
      reputationBaseline !== current.baselineReputationScored ||
      reputationScoreBaseline !== current.baselineReputationScore
    ) {
      persist({
        ...current,
        baselineIdentityFound: identityBaseline,
        baselineReputationScored: reputationBaseline,
        baselineReputationScore: reputationScoreBaseline,
      });
    }
  }, [gnsIdentity.score, gnsIdentity.scoreStatus, gnsIdentity.status, persist, progress]);

  useEffect(() => {
    const current = progressRef.current;
    if (
      !current ||
      current.completedAt ||
      current.startedAt ||
      !isActivationStartPath(current.intent, pathname)
    ) {
      return;
    }

    const now = new Date().toISOString();
    persist({ ...current, startedAt: now });
    safeTrack("activation_started", {
      intent: current.intent,
      surface: activationSurface(current.intent),
    });
  }, [pathname, persist, progress]);

  useEffect(() => {
    const current = progressRef.current;
    if (!current?.startedAt || current.completedAt) return;

    if (current.intent === "identity" && current.baselineIdentityFound !== null) {
      if (!current.baselineIdentityFound && gnsIdentity.status === "found") {
        markCompleted("identity_established");
        return;
      }
      if (current.baselineIdentityFound) {
        if (
          isAfterSelection(gnsIdentity.updatedAt, current.selectedAt) ||
          isAfterSelection(state.profile.updatedAt, current.selectedAt)
        ) {
          markCompleted("identity_strengthened");
          return;
        }
        markResumed("existing_identity");
      }
    }

    if (current.intent === "reputation" && current.baselineReputationScored !== null) {
      if (
        !current.baselineReputationScored &&
        gnsIdentity.scoreStatus === "scored"
      ) {
        markCompleted("reputation_scored");
        return;
      }
      if (current.baselineReputationScored) {
        markResumed("existing_reputation");
      }
    }
  }, [
    gnsIdentity.scoreStatus,
    gnsIdentity.status,
    gnsIdentity.updatedAt,
    markCompleted,
    markResumed,
    progress,
    state.profile.updatedAt,
  ]);

  useEffect(() => {
    const initial = progressRef.current;
    if (!initial?.startedAt || initial.completedAt || initial.intent === "identity") {
      return;
    }

    let active = true;

    const check = async () => {
      const current = progressRef.current;
      if (!active || !current?.startedAt || current.completedAt) return;

      try {
        if (current.intent === "build" || current.intent === "validate") {
          const response = await authenticatedFetch("/api/daily-ideas/workspace", {
            cache: "no-store",
          });
          if (!response.ok) return;
          const payload = (await response.json()) as {
            projects?: { items?: DailyIdeasProject[] };
          };
          const projects = payload.projects?.items ?? [];

          if (current.intent === "build") {
            if (
              projects.some((project) =>
                isAfterSelection(project.createdAt, current.selectedAt),
              )
            ) {
              markCompleted("project_created");
              return;
            }
            if (projects.length) markResumed("existing_project");
            return;
          }

          const validationProjects = projects.filter((project) =>
            ["validating", "building", "launched"].includes(project.status),
          );
          if (
            validationProjects.some((project) =>
              isAfterSelection(project.updatedAt, current.selectedAt),
            )
          ) {
            markCompleted("validation_started");
            return;
          }
          if (validationProjects.length) markResumed("existing_validation_project");
          return;
        }

        if (current.intent === "reputation") {
          const response = await authenticatedFetch(
            "/api/gwapscore/social-verification",
            { cache: "no-store" },
          );
          if (!response.ok) return;
          const payload = (await response.json()) as {
            records?: SocialVerificationRecord[];
          };
          const verified = (payload.records ?? []).filter(
            (record) => record.status === "verified",
          );
          if (
            verified.some((record) =>
              isAfterSelection(record.verifiedAt, current.selectedAt),
            )
          ) {
            markCompleted("proof_of_control_verified");
            return;
          }
          if (verified.length) markResumed("existing_social_verification");
          return;
        }

        if (current.intent === "transaction") {
          const params = new URLSearchParams({
            limit: "20",
            wallet: account.verifiedWallet,
          });
          if (gnsIdentity.status === "found" && gnsIdentity.name) {
            params.set("domain", gnsIdentity.name);
          }
          const response = await fetch(`/api/ppv/activity?${params.toString()}`, {
            cache: "no-store",
          });
          if (!response.ok) return;
          const payload = (await response.json()) as {
            items?: VerifiedActivityRecord[];
          };
          const items = payload.items ?? [];
          if (
            items.some((item) =>
              isAfterSelection(item.completedAt, current.selectedAt),
            )
          ) {
            markCompleted("verified_transaction_activity");
            return;
          }
          if (items.length) markResumed("existing_verified_activity");
        }
      } catch {
        // Analytics checks fail closed and never interfere with the product.
      }
    };

    void check();
    const interval = window.setInterval(() => void check(), POLL_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [
    account.verifiedWallet,
    authenticatedFetch,
    gnsIdentity.name,
    gnsIdentity.status,
    markCompleted,
    markResumed,
    progress,
  ]);

  return null;
}
