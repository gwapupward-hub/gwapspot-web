"use client";

import bs58 from "bs58";
import nacl from "tweetnacl";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./commerce-approval.module.css";

const RELEASE_MESSAGE = `PPV_DEVNET_RELEASE_V1
program=ppv_commerce
program_id=GmRDoFuPrBrsxnvTX751WK5rLu14JXe4sgjh6vNwHzr3
commit=5e4c8b43417e1b1ecda30ac7d811b262ff025079
cluster=devnet`;

const RELEASE_MESSAGE_BYTES = new TextEncoder().encode(RELEASE_MESSAGE);
const RELEASE_MESSAGE_BYTE_LENGTH = 161;
const RELEASE_MESSAGE_SHA256 =
  "3ed38583f6052d13bdff19227c8c46e67ac270db7a3cedfba33cef558b92aa3c";

const APPROVED_MEMBERS = new Set([
  "58kuGbxpvaamvYE44WYkyipBB6FVKt2qT9u3vAKtyKYV",
  "2FFVcm9xJmUHG6zfo15ktzuGQTXACPG42iquGHe6faTN",
  "BJmFM4k7Q32CiCYSdoYkAhXdD5Sk3BegMh2cbEAsgSwJ",
]);

type PhantomPublicKey = {
  toBase58?: () => string;
  toString: () => string;
};

type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: PhantomPublicKey | null;
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey?: PhantomPublicKey }>;
  signMessage: (
    message: Uint8Array,
    display?: "utf8" | "hex",
  ) => Promise<{ signature: Uint8Array; publicKey?: PhantomPublicKey }>;
  on?: (event: "accountChanged", listener: (publicKey: PhantomPublicKey | null) => void) => void;
  removeListener?: (
    event: "accountChanged",
    listener: (publicKey: PhantomPublicKey | null) => void,
  ) => void;
};

type SignatureResult = {
  approver: string;
  signature: string;
};

function phantomProvider(): PhantomProvider | null {
  if (typeof window === "undefined") return null;
  const walletWindow = window as Window & {
    phantom?: { solana?: PhantomProvider };
    solana?: PhantomProvider;
  };
  const provider = walletWindow.phantom?.solana ?? walletWindow.solana;
  return provider?.isPhantom ? provider : null;
}

function publicKeyText(publicKey?: PhantomPublicKey | null) {
  if (!publicKey) return "";
  if (typeof publicKey.toBase58 === "function") return publicKey.toBase58();
  return publicKey.toString();
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function sha256Hex(bytes: Uint8Array) {
  const digestInput = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", digestInput.buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function CommerceApprovalSigner() {
  const [provider, setProvider] = useState<PhantomProvider | null>(null);
  const [wallet, setWallet] = useState("");
  const [status, setStatus] = useState<"checking" | "ready" | "missing">("checking");
  const [integrityOk, setIntegrityOk] = useState(false);
  const [integrityError, setIntegrityError] = useState("");
  const [result, setResult] = useState<SignatureResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [slot, setSlot] = useState<1 | 2>(1);
  const [copied, setCopied] = useState(false);

  const approved = useMemo(() => APPROVED_MEMBERS.has(wallet), [wallet]);

  useEffect(() => {
    let cancelled = false;
    const detect = () => {
      const next = phantomProvider();
      if (cancelled) return;
      setProvider(next);
      setStatus(next ? "ready" : "missing");
      setWallet(publicKeyText(next?.publicKey));
    };

    detect();
    const timer = window.setTimeout(detect, 900);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        if (RELEASE_MESSAGE_BYTES.length !== RELEASE_MESSAGE_BYTE_LENGTH) {
          throw new Error("Release payload byte length does not match the frozen value.");
        }
        const hash = await sha256Hex(RELEASE_MESSAGE_BYTES);
        if (hash !== RELEASE_MESSAGE_SHA256) {
          throw new Error("Release payload hash does not match the frozen value.");
        }
        setIntegrityOk(true);
      } catch (integrityFailure) {
        setIntegrityError(
          integrityFailure instanceof Error
            ? integrityFailure.message
            : "Release payload integrity check failed.",
        );
      }
    })();
  }, []);

  useEffect(() => {
    if (!provider?.on) return;
    const accountChanged = (publicKey: PhantomPublicKey | null) => {
      setWallet(publicKeyText(publicKey));
      setResult(null);
      setCopied(false);
      setError("");
    };
    provider.on("accountChanged", accountChanged);
    return () => provider.removeListener?.("accountChanged", accountChanged);
  }, [provider]);

  const connect = useCallback(async () => {
    const activeProvider = provider ?? phantomProvider();
    if (!activeProvider) {
      setStatus("missing");
      setError("Open this page inside Phantom's browser, then try again.");
      return;
    }

    setBusy(true);
    setError("");
    setResult(null);
    try {
      const connected = await activeProvider.connect({ onlyIfTrusted: false });
      const address = publicKeyText(connected.publicKey ?? activeProvider.publicKey);
      if (!address) throw new Error("Phantom connected without returning a Solana public key.");
      setProvider(activeProvider);
      setWallet(address);
      if (!APPROVED_MEMBERS.has(address)) {
        setError("This wallet is not one of the three approved PPV Squads members.");
      }
    } catch (connectError) {
      setError(
        connectError instanceof Error ? connectError.message : "Phantom connection failed.",
      );
    } finally {
      setBusy(false);
    }
  }, [provider]);

  const sign = useCallback(async () => {
    if (!provider) {
      setError("Connect Phantom first.");
      return;
    }
    if (!integrityOk) {
      setError("The frozen release payload has not passed its local integrity check.");
      return;
    }
    if (!approved || !wallet) {
      setError("The connected wallet is not an approved PPV Squads member.");
      return;
    }

    setBusy(true);
    setError("");
    setResult(null);
    setCopied(false);

    try {
      const signed = await provider.signMessage(RELEASE_MESSAGE_BYTES, "utf8");
      const signature = Uint8Array.from(signed.signature);
      if (signature.length !== 64) {
        throw new Error(`Phantom returned a ${signature.length}-byte signature; expected 64 bytes.`);
      }

      const signedWallet = publicKeyText(signed.publicKey) || wallet;
      if (signedWallet !== wallet) {
        throw new Error("Phantom returned a signature from a different wallet than the connected account.");
      }
      if (!APPROVED_MEMBERS.has(signedWallet)) {
        throw new Error("The signing wallet is not an approved PPV Squads member.");
      }

      const publicKeyBytes = bs58.decode(signedWallet);
      const valid = nacl.sign.detached.verify(
        RELEASE_MESSAGE_BYTES,
        signature,
        publicKeyBytes,
      );
      if (!valid) throw new Error("Local Ed25519 verification failed. Signature was not accepted.");

      const base64 = bytesToBase64(signature);
      if (base64.length !== 88 || !base64.endsWith("==")) {
        throw new Error("Signature did not encode as canonical padded Base64.");
      }

      setResult({ approver: signedWallet, signature: base64 });
    } catch (signError) {
      setError(
        signError instanceof Error ? signError.message : "Message signing failed.",
      );
    } finally {
      setBusy(false);
    }
  }, [approved, integrityOk, provider, wallet]);

  const copy = useCallback(async () => {
    if (!result) return;
    const text = [
      `approver_${slot}=${result.approver}`,
      `signature_${slot}=${result.signature}`,
    ].join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
  }, [result, slot]);

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.brandRow}>
          <img src="/logos/gwap-agent-clear.svg" alt="" width={44} height={44} />
          <div>
            <p className={styles.eyebrow}>PPV / DEVNET RELEASE CEREMONY</p>
            <h1>Commerce Approval Signer</h1>
          </div>
        </div>

        <div className={styles.notice}>
          <strong>Signature only.</strong>
          <span>No transaction, no SOL fee, no deployment, no authority change.</span>
        </div>

        <dl className={styles.meta}>
          <div>
            <dt>Program</dt>
            <dd>ppv_commerce</dd>
          </div>
          <div>
            <dt>Program ID</dt>
            <dd>GmRDoFuPrBrsxnvTX751WK5rLu14JXe4sgjh6vNwHzr3</dd>
          </div>
          <div>
            <dt>Commit</dt>
            <dd>5e4c8b43417e1b1ecda30ac7d811b262ff025079</dd>
          </div>
          <div>
            <dt>Cluster</dt>
            <dd>devnet</dd>
          </div>
        </dl>

        <div className={styles.integrity} data-ok={integrityOk || undefined}>
          {integrityOk
            ? "Payload integrity verified locally — 161 bytes / SHA-256 3ed38583…aa3c"
            : integrityError || "Checking frozen payload integrity…"}
        </div>

        <label className={styles.payloadLabel} htmlFor="release-payload">
          Exact message Phantom will sign
        </label>
        <pre id="release-payload" className={styles.payload}>{RELEASE_MESSAGE}</pre>

        <div className={styles.walletPanel}>
          <div>
            <span className={styles.walletLabel}>Connected signer</span>
            <strong className={styles.walletValue}>
              {wallet || (status === "missing" ? "Phantom not detected" : "Not connected")}
            </strong>
            {wallet ? (
              <small className={approved ? styles.approved : styles.rejected}>
                {approved ? "Approved PPV Squads member" : "Not in the approved member set"}
              </small>
            ) : null}
          </div>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={connect}
            disabled={busy}
          >
            {wallet ? "Reconnect / switch wallet" : "Connect Phantom"}
          </button>
        </div>

        <button
          className={styles.primaryButton}
          type="button"
          onClick={sign}
          disabled={busy || !approved || !integrityOk}
        >
          {busy ? "Waiting for Phantom…" : "Sign Commerce approval"}
        </button>

        {error ? <p className={styles.error} role="alert">{error}</p> : null}

        {result ? (
          <section className={styles.result} aria-live="polite">
            <h2>Verified approval</h2>
            <p>
              The detached signature verified locally against the connected
              Squads member public key.
            </p>

            <div className={styles.slotPicker}>
              <span>Copy as:</span>
              <button
                type="button"
                data-active={slot === 1 || undefined}
                onClick={() => { setSlot(1); setCopied(false); }}
              >
                approver_1
              </button>
              <button
                type="button"
                data-active={slot === 2 || undefined}
                onClick={() => { setSlot(2); setCopied(false); }}
              >
                approver_2
              </button>
            </div>

            <pre className={styles.output}>{`approver_${slot}=${result.approver}
signature_${slot}=${result.signature}`}</pre>

            <button className={styles.copyButton} type="button" onClick={copy}>
              {copied ? "Copied" : "Copy approval"}
            </button>
          </section>
        ) : null}

        <p className={styles.footer}>
          This temporary page never asks for a seed phrase, private key, or passphrase.
          It does not submit a transaction and does not call the PPV deployment workflow.
        </p>
      </section>
    </main>
  );
}
