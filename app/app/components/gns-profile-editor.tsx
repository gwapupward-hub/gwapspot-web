"use client";

import { usePrivy } from "@privy-io/react-auth";
import {
  useSignMessage,
  useWallets as usePrivySolanaWallets,
} from "@privy-io/react-auth/solana";
import { useWallet } from "@solana/wallet-adapter-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import {
  GNS_PROFILE_MAX_LINKS,
  GNS_PROFILE_THEMES,
  GnsProfileValidationError,
  normalizeGnsPublicProfile,
  normalizeGnsProfilePayload,
  profilePayloadFromPublicProfile,
  signGnsProfileUpdate,
  type GnsProfileSocials,
  type GnsProfileUpdatePayload,
  type GnsPublicProfile,
} from "../lib/gns-profile";
import { useGwapOs } from "./os-provider";

type EditorStatus =
  | "loading"
  | "ready"
  | "signing"
  | "saving"
  | "success"
  | "error";

const SOCIAL_LABELS: Array<[keyof GnsProfileSocials, string]> = [
  ["twitter", "Twitter / X"],
  ["discord", "Discord"],
  ["telegram", "Telegram"],
  ["instagram", "Instagram"],
  ["website", "Website URL"],
];

function inputValue(value: string | null) {
  return value || "";
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Profile update failed.";
  if (/reject|declin|cancel/i.test(message)) {
    return "The wallet signature was cancelled. No profile changes were submitted.";
  }
  return message;
}

export function GnsProfileEditor({ name }: { name: string }) {
  const router = useRouter();
  const { getAccessToken } = usePrivy();
  const { account, updateGnsIdentity } = useGwapOs();
  const { publicKey, signMessage: signExternalMessage } = useWallet();
  const { wallets: privySolanaWallets } = usePrivySolanaWallets();
  const { signMessage: signPrivyMessage } = useSignMessage();
  const [profile, setProfile] = useState<GnsPublicProfile | null>(null);
  const [payload, setPayload] = useState<GnsProfileUpdatePayload | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [status, setStatus] = useState<EditorStatus>("loading");
  const [message, setMessage] = useState("Loading the current GNS profile…");

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
      setStatus("loading");
      setMessage("Loading the current GNS profile…");
      try {
        const response = await authenticatedFetch(
          `/api/gns/profile/${encodeURIComponent(name)}`,
          { headers: { Accept: "application/json" } },
        );
        const body = (await response.json().catch(() => ({}))) as {
          error?: unknown;
        };
        if (!response.ok) {
          throw new Error(
            typeof body.error === "string" ? body.error : "Profile could not be loaded.",
          );
        }
        const nextProfile = normalizeGnsPublicProfile(body);
        if (!nextProfile) throw new Error("GNS returned an invalid profile.");
        if (!active) return;
        setProfile(nextProfile);
        setPayload(profilePayloadFromPublicProfile(nextProfile));
        setStatus("ready");
        setMessage("Current GNS fields loaded. Changes require your wallet signature.");
      } catch (error) {
        if (!active) return;
        setStatus("error");
        setMessage(errorMessage(error));
      }
    })();
    return () => {
      active = false;
    };
  }, [authenticatedFetch, name, reloadKey]);

  function updateField<K extends keyof GnsProfileUpdatePayload>(
    key: K,
    value: GnsProfileUpdatePayload[K],
  ) {
    setPayload((current) => (current ? { ...current, [key]: value } : current));
    if (status === "success" || status === "error") {
      setStatus("ready");
      setMessage("Unsaved changes. Saving will request a wallet signature.");
    }
  }

  function updateSocial(key: keyof GnsProfileSocials, value: string) {
    if (!payload) return;
    updateField("socials", { ...payload.socials, [key]: value || null });
  }

  function updateLink(
    index: number,
    field: "title" | "url" | "icon",
    value: string,
  ) {
    if (!payload) return;
    updateField(
      "links",
      payload.links.map((link, linkIndex) =>
        linkIndex === index
          ? { ...link, [field]: field === "icon" ? value || null : value }
          : link,
      ),
    );
  }

  async function signWithVerifiedWallet(messageBytes: Uint8Array) {
    if (
      publicKey?.toBase58() === account.verifiedWallet &&
      signExternalMessage
    ) {
      return signExternalMessage(messageBytes);
    }

    const privyWallet = privySolanaWallets.find(
      (wallet) => wallet.address === account.verifiedWallet,
    );
    if (!privyWallet) {
      throw new Error(
        "Reconnect the Solana wallet that authenticated this OS session before saving.",
      );
    }
    const result = await signPrivyMessage({
      message: messageBytes,
      wallet: privyWallet,
    });
    return result.signature;
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payload || !profile || status === "signing" || status === "saving") return;

    try {
      const normalized = normalizeGnsProfilePayload(payload);
      if (normalized.is_score_hidden && !profile.is_genesis) {
        throw new GnsProfileValidationError(
          "Only Genesis identities can hide their GwapScore.",
        );
      }
      setPayload(normalized);
      setStatus("signing");
      setMessage("Approve the profile update in your verified wallet…");
      const envelope = await signGnsProfileUpdate({
        name,
        payload: normalized,
        publicKey: account.verifiedWallet,
        signMessage: signWithVerifiedWallet,
      });

      setStatus("saving");
      setMessage("Wallet ownership verified. Persisting changes in GNS…");
      const response = await authenticatedFetch(
        `/api/gns/profile/${encodeURIComponent(name)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(envelope),
        },
      );
      const body = (await response.json().catch(() => ({}))) as {
        error?: unknown;
      };
      if (!response.ok) {
        throw new Error(
          typeof body.error === "string" ? body.error : "GNS rejected the update.",
        );
      }
      const saved = normalizeGnsPublicProfile(body);
      if (!saved) throw new Error("GNS did not confirm the saved profile.");

      setProfile(saved);
      setPayload(profilePayloadFromPublicProfile(saved));
      updateGnsIdentity({
        avatar: saved.avatar,
        bio: saved.bio,
        verified: saved.verified,
        isGenesis: saved.is_genesis,
        tier: saved.tier,
        updatedAt: saved.updated_at,
      });
      setStatus("success");
      setMessage("Profile saved and published. Refreshed views now use these fields.");
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(errorMessage(error));
    }
  }

  if (!payload || !profile) {
    return (
      <section className="os-runtime-panel os-profile-editor" aria-live="polite">
        <div className="os-console-chrome">
          <span>gns.profile.edit</span>
          <span>{status.toUpperCase()}</span>
        </div>
        <p className={`os-profile-editor-status state-${status}`}>{message}</p>
        {status === "error" ? (
          <button
            className="os-primary-action"
            type="button"
            onClick={() => setReloadKey((current) => current + 1)}
          >
            Retry profile load
          </button>
        ) : null}
      </section>
    );
  }

  const busy = status === "signing" || status === "saving";

  return (
    <section className="os-runtime-panel os-profile-editor">
      <div className="os-console-chrome">
        <span>gns.profile.edit</span>
        <span>{status.toUpperCase()}</span>
      </div>
      <div className="os-profile-editor-heading">
        <div>
          <span className="os-terminal-label">OWNER-SIGNED PROFILE</span>
          <h2>Edit {profile.full_name}</h2>
        </div>
        <small>{profile.is_genesis ? "GENESIS" : "STANDARD"}</small>
      </div>

      <form onSubmit={saveProfile}>
        <fieldset disabled={busy}>
          <legend>Public profile</legend>
          <label className="is-wide">
            <span>Bio <small>{payload.bio?.length || 0}/280</small></span>
            <textarea
              value={inputValue(payload.bio)}
              maxLength={280}
              rows={4}
              onChange={(event) => updateField("bio", event.target.value || null)}
              placeholder="Tell the network what you build."
            />
          </label>
          <label>
            <span>Avatar URL</span>
            <input
              type="url"
              value={inputValue(payload.avatar)}
              maxLength={300}
              onChange={(event) => updateField("avatar", event.target.value || null)}
              placeholder="https://…"
            />
          </label>
          <label>
            <span>Banner URL</span>
            <input
              type="url"
              value={inputValue(payload.banner)}
              maxLength={300}
              onChange={(event) => updateField("banner", event.target.value || null)}
              placeholder="https://…"
            />
          </label>
          <label>
            <span>Theme</span>
            <select
              value={payload.theme}
              onChange={(event) =>
                updateField(
                  "theme",
                  event.target.value as GnsProfileUpdatePayload["theme"],
                )
              }
            >
              {GNS_PROFILE_THEMES.map((theme) => (
                <option key={theme} value={theme}>{theme}</option>
              ))}
            </select>
          </label>
        </fieldset>

        <fieldset disabled={busy}>
          <legend>Socials</legend>
          {SOCIAL_LABELS.map(([key, label]) => (
            <label key={key}>
              <span>{label}</span>
              <input
                type={key === "website" ? "url" : "text"}
                value={inputValue(payload.socials[key])}
                maxLength={key === "website" ? 300 : 100}
                onChange={(event) => updateSocial(key, event.target.value)}
                placeholder={key === "website" ? "https://…" : "@handle or URL"}
              />
            </label>
          ))}
        </fieldset>

        <fieldset className="os-profile-links" disabled={busy}>
          <legend>Links</legend>
          {payload.links.map((link, index) => (
            <div className="os-profile-link-row" key={`${index}-${link.order}`}>
              <input
                aria-label={`Link ${index + 1} title`}
                value={link.title}
                maxLength={80}
                onChange={(event) => updateLink(index, "title", event.target.value)}
                placeholder="Title"
              />
              <input
                aria-label={`Link ${index + 1} URL`}
                type="url"
                value={link.url}
                maxLength={300}
                onChange={(event) => updateLink(index, "url", event.target.value)}
                placeholder="https://…"
              />
              <button
                type="button"
                onClick={() =>
                  updateField(
                    "links",
                    payload.links
                      .filter((_, linkIndex) => linkIndex !== index)
                      .map((item, order) => ({ ...item, order })),
                  )
                }
                aria-label={`Remove link ${index + 1}`}
              >
                Remove
              </button>
            </div>
          ))}
          {payload.links.length < GNS_PROFILE_MAX_LINKS ? (
            <button
              className="os-profile-add-link"
              type="button"
              onClick={() =>
                updateField("links", [
                  ...payload.links,
                  { title: "", url: "", icon: null, order: payload.links.length },
                ])
              }
            >
              + Add link
            </button>
          ) : null}
        </fieldset>

        <fieldset className="os-profile-options" disabled={busy}>
          <legend>Payments and permissions</legend>
          <label className="os-profile-check">
            <input
              type="checkbox"
              checked={payload.payments?.sol_enabled === true}
              onChange={(event) =>
                updateField("payments", {
                  ...(payload.payments || {
                    usdc_enabled: false,
                    recipient_wallet: account.verifiedWallet,
                  }),
                  sol_enabled: event.target.checked,
                })
              }
            />
            <span>Accept SOL on the public profile</span>
          </label>
          <label className="os-profile-check">
            <input
              type="checkbox"
              checked={payload.payments?.usdc_enabled === true}
              onChange={(event) =>
                updateField("payments", {
                  ...(payload.payments || {
                    sol_enabled: false,
                    recipient_wallet: account.verifiedWallet,
                  }),
                  usdc_enabled: event.target.checked,
                })
              }
            />
            <span>Accept USDC on the public profile</span>
          </label>
          <label className="is-wide">
            <span>Payment recipient wallet</span>
            <input
              value={payload.payments?.recipient_wallet || account.verifiedWallet}
              maxLength={44}
              onChange={(event) =>
                updateField("payments", {
                  sol_enabled: payload.payments?.sol_enabled === true,
                  usdc_enabled: payload.payments?.usdc_enabled === true,
                  recipient_wallet: event.target.value,
                })
              }
            />
          </label>
          {profile.is_genesis ? (
            <label className="os-profile-check is-genesis">
              <input
                type="checkbox"
                checked={payload.is_score_hidden}
                onChange={(event) =>
                  updateField("is_score_hidden", event.target.checked)
                }
              />
              <span>Hide GwapScore on the public GNS profile</span>
            </label>
          ) : (
            <p className="os-profile-permission-note">
              GwapScore visibility is a Genesis-only profile permission.
            </p>
          )}
        </fieldset>

        <div className="os-profile-editor-footer">
          <p className={`os-profile-editor-status state-${status}`} role="status" aria-live="polite">
            {message}
          </p>
          <button className="os-primary-action" type="submit" disabled={busy}>
            {status === "signing"
              ? "Waiting for wallet…"
              : status === "saving"
                ? "Publishing…"
                : "Sign and publish changes"}
          </button>
        </div>
      </form>
    </section>
  );
}
