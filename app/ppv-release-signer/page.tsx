'use client';

import { useMemo, useState } from 'react';

type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: { toString(): string } | null;
  connect: () => Promise<{ publicKey: { toString(): string } }>;
  signMessage: (message: Uint8Array, display?: string) => Promise<{ signature: Uint8Array }>;
};

declare global {
  interface Window {
    phantom?: { solana?: PhantomProvider };
    solana?: PhantomProvider;
  }
}

const RELEASE_MESSAGE = `PPV_DEVNET_RELEASE_V1
program=ppv_core
program_id=9cWE41ZDNQChvFrRoVuPQDeoVLg46ACTiZRCZaBZzfwU
commit=7f771c3f4399ccd29d900e08b59b63f0b1d90d86
cluster=devnet`;

function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function getProvider(): PhantomProvider | null {
  if (typeof window === 'undefined') return null;
  const provider = window.phantom?.solana ?? window.solana;
  return provider?.isPhantom ? provider : null;
}

export default function PpvReleaseSignerPage() {
  const [approver, setApprover] = useState('');
  const [signature, setSignature] = useState('');
  const [status, setStatus] = useState('Open this page inside Phantom Mobile, then connect the intended Squads member wallet.');
  const [busy, setBusy] = useState(false);

  const output = useMemo(
    () => (approver && signature ? `approver=${approver}\nsignature=${signature}` : ''),
    [approver, signature],
  );

  async function connect() {
    setBusy(true);
    setSignature('');
    try {
      const provider = getProvider();
      if (!provider) {
        throw new Error('Phantom provider not found. Open this URL in Phantom Mobile\'s in-app browser, not regular Safari.');
      }
      const result = await provider.connect();
      const publicKey = result.publicKey?.toString?.() ?? provider.publicKey?.toString?.();
      if (!publicKey) throw new Error('Phantom connected but did not return a public key.');
      setApprover(publicKey);
      setStatus(`Connected: ${publicKey}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Wallet connection failed.');
    } finally {
      setBusy(false);
    }
  }

  async function sign() {
    setBusy(true);
    setSignature('');
    try {
      const provider = getProvider();
      if (!provider) {
        throw new Error('Phantom provider not found. Open this URL in Phantom Mobile\'s in-app browser.');
      }
      const connected = provider.publicKey?.toString?.();
      const publicKey = connected || (await provider.connect()).publicKey.toString();
      if (!publicKey) throw new Error('No connected Phantom public key.');

      const encoded = new TextEncoder().encode(RELEASE_MESSAGE);
      const signed = await provider.signMessage(encoded, 'utf8');
      const sigBytes = new Uint8Array(signed.signature);
      if (sigBytes.length !== 64) {
        throw new Error(`Unexpected signature length: ${sigBytes.length} bytes (expected 64).`);
      }
      const base64 = toBase64(sigBytes);
      if (base64.length !== 88 || !base64.endsWith('=')) {
        throw new Error('Signature did not encode as canonical padded Base64.');
      }

      setApprover(publicKey);
      setSignature(base64);
      setStatus('Signed locally in Phantom. No transaction was created and nothing was submitted by this page.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Message signing failed.');
    } finally {
      setBusy(false);
    }
  }

  async function copyOutput() {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setStatus('Approver and signature copied.');
  }

  return (
    <main style={{ minHeight: '100vh', background: '#050505', color: '#f5f5f5', padding: '24px 18px 48px', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 720, margin: '0 auto' }}>
        <div style={{ marginBottom: 22 }}>
          <div style={{ color: '#13DD13', fontWeight: 800, letterSpacing: 1.2, fontSize: 13 }}>PPV · DEVNET RELEASE CONTROL</div>
          <h1 style={{ fontSize: 30, lineHeight: 1.05, margin: '8px 0 10px' }}>Phantom Release Signer</h1>
          <p style={{ color: '#b8b8b8', lineHeight: 1.55, margin: 0 }}>
            This page signs one fixed release-approval message in your wallet. It does not request a private key, create a transaction, transfer SOL, deploy a program, or send the signature to a server.
          </p>
        </div>

        <section style={{ border: '1px solid #272727', borderRadius: 18, padding: 18, background: '#0d0d0d', marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: '#9c9c9c', marginBottom: 8 }}>LOCKED RELEASE MESSAGE · NO TRAILING NEWLINE</div>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 13, lineHeight: 1.55, background: '#050505', borderRadius: 12, padding: 14, border: '1px solid #1d1d1d' }}>{RELEASE_MESSAGE}</pre>
        </section>

        <section style={{ border: '1px solid #272727', borderRadius: 18, padding: 18, background: '#0d0d0d' }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <button onClick={connect} disabled={busy} style={{ minHeight: 52, border: 0, borderRadius: 14, fontWeight: 800, fontSize: 16, background: '#f5f5f5', color: '#080808' }}>
              {busy ? 'Working…' : '1. Connect Phantom'}
            </button>
            <button onClick={sign} disabled={busy} style={{ minHeight: 52, border: 0, borderRadius: 14, fontWeight: 900, fontSize: 16, background: '#13DD13', color: '#031003' }}>
              {busy ? 'Working…' : '2. Sign Exact Message'}
            </button>
          </div>

          <p style={{ fontSize: 13, color: '#c9c9c9', lineHeight: 1.5, margin: '14px 0 0' }}>{status}</p>

          {approver ? (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 12, color: '#9c9c9c', marginBottom: 6 }}>APPROVER</div>
              <code style={{ display: 'block', overflowWrap: 'anywhere', background: '#050505', padding: 12, borderRadius: 10 }}>{approver}</code>
            </div>
          ) : null}

          {signature ? (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, color: '#9c9c9c', marginBottom: 6 }}>PADDED BASE64 SIGNATURE · {signature.length} CHARS</div>
              <code style={{ display: 'block', overflowWrap: 'anywhere', background: '#050505', padding: 12, borderRadius: 10 }}>{signature}</code>
              <button onClick={copyOutput} style={{ marginTop: 12, width: '100%', minHeight: 46, borderRadius: 12, border: '1px solid #3b3b3b', background: 'transparent', color: '#f5f5f5', fontWeight: 700 }}>Copy approver + signature</button>
            </div>
          ) : null}
        </section>

        <p style={{ color: '#777', fontSize: 12, lineHeight: 1.5, marginTop: 14 }}>
          Release: ppv_core · Cluster: devnet · Commit: 7f771c3f4399ccd29d900e08b59b63f0b1d90d86. A second, distinct configured Squads member must sign the same message separately.
        </p>
      </div>
    </main>
  );
}
