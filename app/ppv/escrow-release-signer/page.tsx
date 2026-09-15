"use client";

import { useMemo, useState } from "react";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";

const PROGRAM_ID = "7U1bCHQcr8Jg6J8G69JGaAWCRtsrZB1RYx4zo1sNEVF4";
const COMMIT = "231dceb91c141e1afe6e57ef48fafb199da5c678";
const MESSAGE_SHA256 = "7c211c3f2b7011f7ec40221134ebfaf20e4b69b47e399068644e3fdf0f46080b";
const PAYLOAD = `PPV_DEVNET_RELEASE_V1\nprogram=ppv_escrow\nprogram_id=${PROGRAM_ID}\ncommit=${COMMIT}\ncluster=devnet`;
const CUSTODY_MEMBERS = new Set([
  "HDkMBufpYfm1LN6apVkeV3aA2dhMk57PmBujwJ4j4Ecx",
  "5y12g4GKbba3k6WDUyZT8eUfeBdboxxGrjkdjM4kX2Wo",
  "BJmFM4k7Q32CiCYSdoYkAhXdD5Sk3BegMh2cbEAsgSwJ",
]);

type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: { toString(): string };
  connect: () => Promise<{ publicKey?: { toString(): string } }>;
  signMessage: (message: Uint8Array, display?: "utf8") => Promise<{ signature: Uint8Array }>;
};

declare global {
  interface Window {
    phantom?: { solana?: PhantomProvider };
    solana?: PhantomProvider;
  }
}

function toPaddedBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export default function EscrowReleaseSignerPage() {
  const [wallet, setWallet] = useState("");
  const [signature, setSignature] = useState("");
  const [status, setStatus] = useState("Open this page inside Phantom's in-app browser.");
  const [busy, setBusy] = useState(false);

  const messageBytes = useMemo(() => new TextEncoder().encode(PAYLOAD), []);

  const provider = () => window.phantom?.solana ?? window.solana;

  async function connect() {
    try {
      setBusy(true);
      const p = provider();
      if (!p?.isPhantom) throw new Error("Phantom provider not detected. Open this page inside Phantom's Browser tab.");
      const result = await p.connect();
      const address = result.publicKey?.toString() ?? p.publicKey?.toString();
      if (!address) throw new Error("Wallet connected but no public key was returned.");
      setWallet(address);
      setSignature("");
      if (!CUSTODY_MEMBERS.has(address)) {
        setStatus("Connected wallet is not an authorized PPV Escrow custody signer.");
        return;
      }
      setStatus("Authorized custody signer connected. Verify the release facts, then sign the exact message.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to connect Phantom.");
    } finally {
      setBusy(false);
    }
  }

  async function sign() {
    try {
      setBusy(true);
      const p = provider();
      if (!p?.isPhantom) throw new Error("Phantom provider not detected.");
      const address = p.publicKey?.toString() ?? wallet;
      if (!address || !CUSTODY_MEMBERS.has(address)) throw new Error("An authorized custody signer must be connected.");

      const result = await p.signMessage(messageBytes, "utf8");
      const sigBytes = new Uint8Array(result.signature);
      if (sigBytes.length !== 64) throw new Error(`Unexpected Ed25519 signature length: ${sigBytes.length} bytes.`);

      const publicKeyBytes = new PublicKey(address).toBytes();
      const valid = nacl.sign.detached.verify(messageBytes, sigBytes, publicKeyBytes);
      if (!valid) throw new Error("Local Ed25519 verification failed. Nothing was submitted.");

      const encoded = toPaddedBase64(sigBytes);
      setSignature(encoded);
      setWallet(address);
      setStatus("Signature verified locally. Copy the public approver address and Base64 signature below.");
    } catch (error) {
      setSignature("");
      setStatus(error instanceof Error ? error.message : "Signing failed.");
    } finally {
      setBusy(false);
    }
  }

  async function copyResults() {
    if (!wallet || !signature) return;
    await navigator.clipboard.writeText(`approver=${wallet}\nsignature=${signature}`);
    setStatus("Public approval values copied. No private material was exposed.");
  }

  return (
    <main style={{ minHeight: "100vh", background: "#050505", color: "#f7f7f7", padding: "32px 18px", fontFamily: "Arial, sans-serif" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ border: "1px solid #13DD13", borderRadius: 20, padding: 24, background: "linear-gradient(180deg,#0a0a0a,#111)" }}>
          <div style={{ color: "#13DD13", fontSize: 13, fontWeight: 800, letterSpacing: 1.6, textTransform: "uppercase" }}>GWAP · PPV Escrow</div>
          <h1 style={{ margin: "10px 0 8px", fontSize: 34, lineHeight: 1.05 }}>Devnet Release Approval</h1>
          <p style={{ color: "#b7b7b7", lineHeight: 1.55, marginTop: 0 }}>Phantom in-app browser signer. This page requests a message signature only. It does not create a transaction, move funds, deploy a program, or request a private key.</p>

          <div style={{ background: "#161616", border: "1px solid #333", borderRadius: 14, padding: 16, margin: "20px 0" }}>
            <strong style={{ display: "block", marginBottom: 8 }}>Release facts</strong>
            <div style={{ fontSize: 14, lineHeight: 1.7, overflowWrap: "anywhere" }}>
              <div><span style={{ color: "#888" }}>Program:</span> {PROGRAM_ID}</div>
              <div><span style={{ color: "#888" }}>Commit:</span> {COMMIT}</div>
              <div><span style={{ color: "#888" }}>Cluster:</span> devnet</div>
              <div><span style={{ color: "#888" }}>Message bytes:</span> 159</div>
              <div><span style={{ color: "#888" }}>SHA-256:</span> {MESSAGE_SHA256}</div>
            </div>
          </div>

          <div style={{ background: "#10170f", border: "1px solid #2d5f29", borderRadius: 14, padding: 16, marginBottom: 20 }}>
            <strong>Exact message to sign</strong>
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 13, lineHeight: 1.55, color: "#d7ffd7", marginBottom: 0 }}>{PAYLOAD}</pre>
          </div>

          <p style={{ minHeight: 24, color: status.includes("failed") || status.includes("not an authorized") ? "#ff9e9e" : "#ddd" }}>{status}</p>

          <div style={{ display: "grid", gap: 12 }}>
            <button onClick={connect} disabled={busy} style={{ border: 0, borderRadius: 12, padding: "15px 18px", background: "#9955FF", color: "white", fontWeight: 800, fontSize: 16 }}>{busy ? "Working…" : wallet ? "Reconnect Phantom" : "Connect Phantom"}</button>
            <button onClick={sign} disabled={busy || !wallet || !CUSTODY_MEMBERS.has(wallet)} style={{ border: 0, borderRadius: 12, padding: "15px 18px", background: busy || !wallet || !CUSTODY_MEMBERS.has(wallet) ? "#2a2a2a" : "#13DD13", color: busy || !wallet || !CUSTODY_MEMBERS.has(wallet) ? "#888" : "#031003", fontWeight: 900, fontSize: 16 }}>Sign Exact Release Message</button>
          </div>

          {wallet && (
            <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid #292929" }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 5 }}>CONNECTED APPROVER</div>
              <code style={{ display: "block", overflowWrap: "anywhere", color: "#fff" }}>{wallet}</code>
            </div>
          )}

          {signature && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 5 }}>VERIFIED PADDED BASE64 SIGNATURE</div>
              <textarea readOnly value={signature} rows={4} style={{ width: "100%", boxSizing: "border-box", background: "#0b0b0b", color: "#fff", border: "1px solid #333", borderRadius: 10, padding: 12, fontFamily: "monospace", resize: "none" }} />
              <button onClick={copyResults} style={{ marginTop: 10, width: "100%", border: "1px solid #13DD13", borderRadius: 12, padding: "13px 16px", background: "transparent", color: "#13DD13", fontWeight: 800 }}>Copy Public Approval Values</button>
            </div>
          )}
        </div>

        <div style={{ marginTop: 16, padding: 16, borderRadius: 14, border: "1px solid #3b2f1a", background: "#181309", color: "#f3d9a4", fontSize: 13, lineHeight: 1.55 }}>
          <strong>Security boundary:</strong> this page does not send the signature anywhere. After signing, return only the public approver address and Base64 signature. Never paste a private key, seed phrase, recovery phrase, or keypair JSON into this page or any chat.
        </div>
      </div>
    </main>
  );
}
