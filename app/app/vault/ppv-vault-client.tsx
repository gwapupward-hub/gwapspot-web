"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useSignTransaction, useWallets } from "@privy-io/react-auth/solana";
import { useCallback, useMemo, useState } from "react";
import { useGwapOs } from "../components/os-provider";
import { bytesToHex, createProofId, hashFile, proofMetadataHash, shorten } from "../lib/ppv/core";
import {
  getPpvCluster,
  isPpvConfigured,
  prepareCreateProofTransaction,
  prepareRevokeProofTransaction,
} from "../lib/ppv/solana";
import { getPpvExplorerUrl } from "../lib/ppv/config";
import { describePpvProgramError } from "../lib/ppv/program";
import type { PpvProofIndexRecord, PpvVerificationResult } from "../lib/ppv/types";
import PpvAgreementsPanel from "./ppv-agreements-panel";

type Mode = "create" | "verify" | "agree" | "activity";
type CreateState = "idle" | "hashing" | "signing" | "confirming" | "indexing" | "done";

export default function PpvVaultClient() {
  const { account, gnsIdentity } = useGwapOs();
  const { getAccessToken } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { signTransaction } = useSignTransaction();
  const [mode, setMode] = useState<Mode>("create");
  const [file, setFile] = useState<File | null>(null);
  const [createState, setCreateState] = useState<CreateState>("idle");
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<PpvProofIndexRecord | null>(null);
  const [proofs, setProofs] = useState<PpvProofIndexRecord[]>([]);
  const [verifyFile, setVerifyFile] = useState<File | null>(null);
  const [verifyId, setVerifyId] = useState("");
  const [verifyOwner, setVerifyOwner] = useState("");
  const [verification, setVerification] = useState<PpvVerificationResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [revoking, setRevoking] = useState("");
  const activeWallet = useMemo(
    () => wallets.find((wallet) => wallet.address === account.verifiedWallet),
    [account.verifiedWallet, wallets],
  );

  const programConfigured = useMemo(() => isPpvConfigured(), []);

  const authenticatedFetch = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const token = await getAccessToken();
    const headers = new Headers(init?.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers, credentials: "same-origin" });
  }, [getAccessToken]);

  const loadProofs = useCallback(async () => {
    try {
      const response = await authenticatedFetch("/api/ppv/proofs");
      if (!response.ok) return;
      const payload = await response.json() as { proofs?: PpvProofIndexRecord[] };
      setProofs(Array.isArray(payload.proofs) ? payload.proofs : []);
    } catch {}
  }, [authenticatedFetch]);

  function selectMode(tab: Mode) {
    setMode(tab);
    setError("");
    if (tab === "activity") void loadProofs();
  }

  async function createProof() {
    if (!file) { setError("Choose a file to prove first."); return; }
    if (!programConfigured) { setError("PPV anchoring is staged but the devnet program ID is not mounted yet."); return; }
    if (!walletsReady || !activeWallet) { setError("Your verified GWAP wallet is not available to sign this proof."); return; }

    setError("");
    setReceipt(null);
    try {
      setCreateState("hashing");
      const [contentHash, contextHash] = await Promise.all([hashFile(file), proofMetadataHash(file)]);
      const proofId = createProofId();
      const proofIdHex = bytesToHex(proofId);
      const contentHashHex = bytesToHex(contentHash);
      const contextHashHex = bytesToHex(contextHash);

      setCreateState("signing");
      const prepared = await prepareCreateProofTransaction({
        owner: account.verifiedWallet,
        proofIdHex,
        contentHashHex,
        contextHashHex,
        kind: "document",
      });
      const { signedTransaction } = await signTransaction({ transaction: prepared.encodedTransaction, wallet: activeWallet });

      setCreateState("confirming");
      const signature = await prepared.connection.sendRawTransaction(signedTransaction, { maxRetries: 3, skipPreflight: false });
      const confirmation = await prepared.connection.confirmTransaction({ signature, blockhash: prepared.blockhash, lastValidBlockHeight: prepared.lastValidBlockHeight }, "confirmed");
      if (confirmation.value.err) throw new Error("Solana rejected the PPV proof transaction.");

      setCreateState("indexing");
      const indexResponse = await authenticatedFetch("/api/ppv/proofs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proofId: proofIdHex, contentHash: contentHashHex, transactionSignature: signature }),
      });
      const indexed = await indexResponse.json() as { proof?: PpvProofIndexRecord; error?: string };
      if (!indexResponse.ok || !indexed.proof) {
        const fallback: PpvProofIndexRecord = {
          proofId: proofIdHex,
          proofPda: prepared.proofPda,
          owner: account.verifiedWallet,
          contentHash: contentHashHex,
          transactionSignature: signature,
          cluster: getPpvCluster(),
          createdAt: new Date().toISOString(),
          revoked: false,
        };
        setReceipt(fallback);
        setCreateState("done");
        setError(`Proof anchored on Solana, but GWAP OS history indexing is pending. Save Proof ID ${proofIdHex}.`);
        return;
      }
      setReceipt(indexed.proof);
      setProofs((current) => [indexed.proof!, ...current.filter((item) => item.proofId !== indexed.proof!.proofId)]);
      setCreateState("done");
    } catch (cause) {
      setCreateState("idle");
      setError(
        describePpvProgramError(cause, "core") ??
          (cause instanceof Error ? cause.message : "PPV proof creation failed"),
      );
    }
  }

  async function revokeProof(proof: PpvProofIndexRecord) {
    if (!walletsReady || !activeWallet) {
      setError("Your verified GWAP wallet is not available to sign this revocation.");
      return;
    }
    setError("");
    setRevoking(proof.proofId);
    try {
      const prepared = await prepareRevokeProofTransaction({
        owner: account.verifiedWallet,
        proofPda: proof.proofPda,
      });
      const { signedTransaction } = await signTransaction({
        transaction: prepared.encodedTransaction,
        wallet: activeWallet,
      });
      const signature = await prepared.connection.sendRawTransaction(signedTransaction, {
        maxRetries: 3,
        skipPreflight: false,
      });
      const confirmation = await prepared.connection.confirmTransaction(
        {
          signature,
          blockhash: prepared.blockhash,
          lastValidBlockHeight: prepared.lastValidBlockHeight,
        },
        "confirmed",
      );
      if (confirmation.value.err) throw new Error("Solana rejected the revocation.");
      // Chain is the truth; re-read rather than assuming the write landed as sent.
      await loadProofs();
    } catch (cause) {
      setError(
        describePpvProgramError(cause, "core") ??
          (cause instanceof Error ? cause.message : "Revocation failed"),
      );
    } finally {
      setRevoking("");
    }
  }

  async function verifyProof() {
    if (!verifyFile || !verifyId.trim()) { setError("Choose the original file and enter its PPV proof ID."); return; }
    if (verifyOwner.trim() && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(verifyOwner.trim())) {
      setError("That creator wallet is not a valid Solana address.");
      return;
    }
    setError(""); setVerification(null); setVerifying(true);
    try {
      const hash = bytesToHex(await hashFile(verifyFile));
      const response = await fetch("/api/ppv/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proofId: verifyId.trim().toLowerCase(),
          owner: verifyOwner.trim() || account.verifiedWallet,
          contentHash: hash,
        }),
      });
      const payload = await response.json() as PpvVerificationResult & { error?: string };
      if (!response.ok && response.status !== 404) throw new Error(payload.error || "Verification failed");
      setVerification(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Verification failed");
    } finally { setVerifying(false); }
  }

  const progress = createState === "hashing" ? "Hashing privately on this device…"
    : createState === "signing" ? "Waiting for your wallet signature…"
    : createState === "confirming" ? "Confirming on Solana devnet…"
    : createState === "indexing" ? "Recording safe proof metadata…"
    : "";

  return (
    <div className="ppv-shell">
      <header className="ppv-hero">
        <div>
          <span className="os-terminal-label">~/vault · PPV FOUNDING BETA</span>
          <h1>Private Proof Vault.</h1>
          <p>Prove that exact digital content existed in your wallet’s possession at a specific time—without publishing the content itself.</p>
        </div>
        <div className="ppv-status-card">
          <span>NETWORK</span><strong>{getPpvCluster().toUpperCase()}</strong>
          <span>IDENTITY</span><strong>{gnsIdentity.fullName ?? gnsIdentity.name ?? shorten(account.verifiedWallet)}</strong>
          <span>PROGRAM</span><strong>{programConfigured ? "READY" : "AWAITING DEVNET DEPLOY"}</strong>
        </div>
      </header>

      <nav className="ppv-tabs" aria-label="PPV workspace">
        {(["create", "verify", "agree", "activity"] as const).map((tab) => (
          <button key={tab} type="button" aria-pressed={mode === tab} onClick={() => selectMode(tab)}>
            {tab === "create"
              ? "Create Proof"
              : tab === "verify"
                ? "Verify Proof"
                : tab === "agree"
                  ? "Agreements"
                  : "Activity"}
          </button>
        ))}
      </nav>

      {!programConfigured ? (
        <div className="ppv-notice"><strong>Safe launch mode.</strong> The interface is wired, but proof writes remain disabled until the reviewed devnet program ID is mounted. No simulated proof will be created.</div>
      ) : null}

      {mode === "create" ? (
        <section className="ppv-grid">
          <article className="ppv-panel ppv-create-panel">
            <span className="os-terminal-label">CREATE / PROOF</span>
            <h2>Anchor an original.</h2>
            <p>Your file is hashed locally. The original bytes never leave this screen in Pass 1; only the SHA-256 commitment and verification metadata are submitted to Solana.</p>
            <label className="ppv-file-picker">
              <input type="file" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setReceipt(null); setError(""); }} />
              <span>{file ? file.name : "Choose a file"}</span>
              <small>{file ? `${Math.max(1, Math.ceil(file.size / 1024))} KB · stays on device` : "Documents, images, audio, video, code, archives · 20 MB max"}</small>
            </label>
            <button className="ppv-primary" type="button" disabled={!file || (createState !== "idle" && createState !== "done") || !programConfigured} onClick={() => void createProof()}>
              {createState !== "idle" && createState !== "done" ? "Creating proof…" : "Create verifiable proof"}
            </button>
            {progress ? <p className="ppv-progress" role="status">{progress}</p> : null}
            {receipt ? (
              <div className="ppv-receipt" role="status">
                <span>PROOF VERIFIED ON DEVNET</span>
                <strong>{receipt.proofId}</strong>
                <dl>
                  <div><dt>Owner</dt><dd>{shorten(receipt.owner)}</dd></div>
                  <div><dt>Content hash</dt><dd>{shorten(receipt.contentHash, 10, 10)}</dd></div>
                  <div><dt>Proof PDA</dt><dd>{shorten(receipt.proofPda)}</dd></div>
                </dl>
                <button type="button" onClick={() => { void navigator.clipboard?.writeText(receipt.proofId); }}>Copy Proof ID</button>
              </div>
            ) : null}
          </article>

          <aside className="ppv-panel ppv-principles">
            <span className="os-terminal-label">WHAT PPV PROVES</span>
            <h2>Evidence, not magic ownership.</h2>
            <ul>
              <li><strong>Exact bytes.</strong> A changed file produces a different hash.</li>
              <li><strong>Wallet authority.</strong> The proof is created by your verified Solana wallet.</li>
              <li><strong>Time.</strong> Solana provides the durable creation timestamp.</li>
              <li><strong>Privacy.</strong> PPV does not publish the artifact itself.</li>
            </ul>
            <p className="ppv-legal-note">A PPV proof is cryptographic evidence of existence and wallet possession at a point in time. It is not government copyright registration and does not by itself establish legal authorship or ownership.</p>
          </aside>
        </section>
      ) : null}

      {mode === "verify" ? (
        <section className="ppv-grid">
          <article className="ppv-panel">
            <span className="os-terminal-label">VERIFY / PROOF</span>
            <h2>Verify independently.</h2>
            <p>Select the candidate original. PPV hashes it on your device and compares the result to the on-chain proof record.</p>
            <label className="ppv-field"><span>PPV Proof ID</span><input value={verifyId} onChange={(event) => setVerifyId(event.target.value)} placeholder="32-character proof id" inputMode="text" autoCapitalize="none" /></label>
            <label className="ppv-field"><span>Creator wallet</span><input value={verifyOwner} onChange={(event) => setVerifyOwner(event.target.value)} placeholder={`Defaults to ${shorten(account.verifiedWallet)}`} inputMode="text" autoCapitalize="none" /><small>Proofs are namespaced per wallet, so verifying someone else&rsquo;s proof needs the wallet that created it.</small></label>
            <label className="ppv-file-picker"><input type="file" onChange={(event) => { setVerifyFile(event.target.files?.[0] ?? null); setVerification(null); }} /><span>{verifyFile ? verifyFile.name : "Choose candidate file"}</span><small>Only its local SHA-256 hash is sent for comparison.</small></label>
            <button className="ppv-primary" type="button" disabled={verifying || !verifyFile || !verifyId.trim() || !programConfigured} onClick={() => void verifyProof()}>{verifying ? "Verifying…" : "Verify against Solana"}</button>
          </article>
          <aside className={`ppv-panel ppv-verdict ${verification?.verified ? "is-verified" : verification ? "is-negative" : ""}`}>
            <span className="os-terminal-label">VERIFICATION RESULT</span>
            {!verification ? <><h2>Awaiting evidence.</h2><p>Nothing is trusted until the file hash matches the proof record.</p></> : verification.verified ? <><h2>Verified.</h2><p>This file exactly matches the content hash committed by {shorten(verification.proof!.owner)}.</p><strong>{verification.proof!.proofId}</strong></> : <><h2>{verification.reason === "revoked" ? "Proof revoked." : verification.reason === "not_found" ? "Proof not found." : "Hash mismatch."}</h2><p>The submitted evidence does not currently satisfy an active PPV proof.</p></>}
          </aside>
        </section>
      ) : null}

      {mode === "agree" && programConfigured ? (
        <PpvAgreementsPanel verifiedWallet={account.verifiedWallet} />
      ) : null}

      {mode === "activity" ? (
        <section className="ppv-panel">
          <div className="ppv-section-heading"><div><span className="os-terminal-label">YOUR PROOF HISTORY</span><h2>Safe metadata only.</h2></div><button type="button" onClick={() => void loadProofs()}>Refresh</button></div>
          {proofs.length ? (
            <div className="ppv-proof-list">
              {proofs.map((proof) => (
                <article key={proof.proofId}>
                  <div>
                    <strong>{proof.proofId}</strong>
                    <span>{new Date(proof.createdAt).toLocaleString()}</span>
                  </div>
                  <div>
                    <span>{shorten(proof.contentHash, 8, 8)}</span>
                    <b>{proof.revoked ? "REVOKED" : "ACTIVE"}</b>
                  </div>
                  <div className="ppv-proof-actions">
                    <a
                      href={getPpvExplorerUrl("tx", proof.transactionSignature)}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      View on Solana Devnet Explorer
                    </a>
                    {proof.revoked ? null : (
                      <button
                        type="button"
                        disabled={revoking === proof.proofId}
                        onClick={() => void revokeProof(proof)}
                      >
                        {revoking === proof.proofId ? "Revoking…" : "Revoke"}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="ppv-empty">
              <strong>No indexed proofs yet.</strong>
              <span>Your first verified proof will appear here.</span>
            </div>
          )}
        </section>
      ) : null}

      {error ? <p className="ppv-error" role="alert">{error}</p> : null}

      <section className="ppv-roadmap-strip" aria-label="PPV roadmap">
        <div className="is-current"><span>01</span><strong>PROVE</strong><small>Building now</small></div>
        <div className="is-current"><span>02</span><strong>AGREE</strong><small>Devnet</small></div>
        <div><span>03</span><strong>GET PAID</strong><small>Pass 3</small></div>
        <div><span>04</span><strong>PROTECT DEALS</strong><small>Security gated</small></div>
      </section>
    </div>
  );
}
