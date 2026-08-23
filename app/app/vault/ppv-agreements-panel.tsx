"use client";

import { useSignTransaction, useWallets } from "@privy-io/react-auth/solana";
import { PublicKey } from "@solana/web3.js";
import { useCallback, useMemo, useState } from "react";
import { bytesToHex, createProofId, shorten } from "../lib/ppv/core";
import {
  AgreementDraftError,
  hashAgreementDraft,
  resolveExpiry,
} from "../lib/ppv/agreements.ts";
import { getPpvExplorerUrl } from "../lib/ppv/config";
import {
  type AgreementRecord,
  decodeAgreementRecord,
  describePpvProgramError,
  ppvIdFromHex,
} from "../lib/ppv/program";
import {
  type PreparedPpvTransaction,
  derivePpvAgreementPda,
  getPpvConnection,
  prepareCancelAgreementTransaction,
  prepareCreateAgreementTransaction,
  prepareProposeRevisionTransaction,
  prepareSignAgreementTransaction,
} from "../lib/ppv/solana";

type TxState = "idle" | "signing" | "pending" | "confirmed" | "rejected" | "failed";

type LoadedAgreement = {
  record: AgreementRecord;
  partyA: string;
  agreementIdHex: string;
  agreementPda: string;
  /** Cluster time at the moment this account was read, in seconds. */
  chainNow: number;
};

const EMPTY_DRAFT = {
  title: "",
  summary: "",
  deliverables: "",
  scope: "",
  compensationNote: "",
  completionDate: "",
  expiresOn: "",
  counterparty: "",
};

function isWalletAddress(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim());
}

export default function PpvAgreementsPanel({
  verifiedWallet,
}: {
  verifiedWallet: string;
}) {
  const { wallets, ready: walletsReady } = useWallets();
  const { signTransaction } = useSignTransaction();

  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [txState, setTxState] = useState<TxState>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [lastSignature, setLastSignature] = useState("");
  const [loaded, setLoaded] = useState<LoadedAgreement | null>(null);
  const [lookupParty, setLookupParty] = useState("");
  const [lookupId, setLookupId] = useState("");
  const [busy, setBusy] = useState(false);

  const activeWallet = useMemo(
    () => wallets.find((wallet) => wallet.address === verifiedWallet),
    [verifiedWallet, wallets],
  );

  const set = (patch: Partial<typeof EMPTY_DRAFT>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const readAgreement = useCallback(
    async (partyA: string, agreementIdHex: string): Promise<LoadedAgreement | null> => {
      const agreementPda = derivePpvAgreementPda(
        new PublicKey(partyA),
        ppvIdFromHex(agreementIdHex),
      );
      const connection = getPpvConnection();
      const account = await connection.getAccountInfo(agreementPda, "confirmed");
      if (!account) return null;
      // Expiry is a cluster-clock judgement. Reading the block time with the
      // account keeps the badge honest on a device with a skewed clock.
      const slot = await connection.getSlot("confirmed");
      const chainNow = await connection.getBlockTime(slot);
      return {
        record: await decodeAgreementRecord(new Uint8Array(account.data)),
        partyA,
        agreementIdHex,
        agreementPda: agreementPda.toBase58(),
        chainNow: chainNow ?? 0,
      };
    },
    [],
  );

  /**
   * Every action re-reads the account afterwards. The chain is the truth: what a
   * transaction was asked to do is not evidence of what it did.
   */
  const refresh = useCallback(async () => {
    if (!loaded) return;
    setLoaded(await readAgreement(loaded.partyA, loaded.agreementIdHex));
  }, [loaded, readAgreement]);

  async function submit(prepared: PreparedPpvTransaction, label: string) {
    if (!walletsReady || !activeWallet) {
      throw new Error("Your verified GWAP wallet is not available to sign.");
    }

    setTxState("signing");
    setStatusMessage("Waiting for your wallet signature…");
    const { signedTransaction } = await signTransaction({
      transaction: prepared.encodedTransaction,
      wallet: activeWallet,
    });

    setTxState("pending");
    setStatusMessage(`${label} submitted. Waiting for Solana devnet confirmation…`);
    const signature = await prepared.connection.sendRawTransaction(signedTransaction, {
      maxRetries: 3,
      skipPreflight: false,
    });
    setLastSignature(signature);

    const confirmation = await prepared.connection.confirmTransaction(
      {
        signature,
        blockhash: prepared.blockhash,
        lastValidBlockHeight: prepared.lastValidBlockHeight,
      },
      "confirmed",
    );
    if (confirmation.value.err) {
      setTxState("rejected");
      throw new Error(`Solana rejected the ${label.toLowerCase()}.`);
    }

    setTxState("confirmed");
    setStatusMessage(`${label} confirmed on Solana devnet.`);
    return signature;
  }

  function reportFailure(cause: unknown, fallback: string) {
    const described = describePpvProgramError(cause, "commerce");
    if (described) {
      setTxState("rejected");
      setError(described);
      return;
    }
    if (cause instanceof AgreementDraftError) {
      setTxState("idle");
      setError(cause.message);
      return;
    }
    setTxState((current) => (current === "rejected" ? current : "failed"));
    setError(cause instanceof Error ? cause.message : fallback);
  }

  async function createAgreement() {
    setError("");
    setLastSignature("");
    if (!isWalletAddress(draft.counterparty)) {
      setError("Enter the counterparty's Solana wallet address.");
      return;
    }
    if (draft.counterparty.trim() === verifiedWallet) {
      setError("An agreement needs two different wallets.");
      return;
    }

    setBusy(true);
    try {
      const hashes = await hashAgreementDraft(
        {
          title: draft.title,
          summary: draft.summary,
          deliverables: draft.deliverables.split("\n"),
        },
        {
          scope: draft.scope,
          compensationNote: draft.compensationNote,
          completionDate: draft.completionDate,
        },
      );

      // Expiry is validated against the cluster clock, not the browser's, so a
      // skewed device cannot produce a transaction the program will refuse.
      const connection = getPpvConnection();
      const slot = await connection.getSlot("confirmed");
      const chainTime = await connection.getBlockTime(slot);
      const expiresAt = resolveExpiry(
        draft.expiresOn,
        chainTime ?? Math.floor(Date.now() / 1000),
      );

      const agreementIdHex = bytesToHex(createProofId());
      const prepared = await prepareCreateAgreementTransaction({
        partyA: verifiedWallet,
        partyB: draft.counterparty.trim(),
        agreementIdHex,
        contentHashHex: hashes.contentHashHex,
        termsHashHex: hashes.termsHashHex,
        expiresAt,
      });

      await submit(prepared, "Agreement");
      setLookupParty(verifiedWallet);
      setLookupId(agreementIdHex);
      setLoaded(await readAgreement(verifiedWallet, agreementIdHex));
    } catch (cause) {
      reportFailure(cause, "Creating the agreement failed.");
    } finally {
      setBusy(false);
    }
  }

  async function loadAgreement() {
    setError("");
    const party = lookupParty.trim() || verifiedWallet;
    if (!isWalletAddress(party)) {
      setError("Enter the wallet that created the agreement.");
      return;
    }
    setBusy(true);
    try {
      const next = await readAgreement(party, lookupId.trim().toLowerCase());
      if (!next) {
        setLoaded(null);
        setError("No agreement exists at that address on devnet.");
        return;
      }
      setLoaded(next);
    } catch (cause) {
      reportFailure(cause, "Could not read that agreement.");
    } finally {
      setBusy(false);
    }
  }

  async function signCurrentVersion() {
    if (!loaded) return;
    setError("");
    setBusy(true);
    try {
      // Signing binds the exact version and both hashes that are on chain right
      // now. If the agreement moved on between load and signature, the program
      // rejects it rather than endorsing something the signer never read.
      const current = await readAgreement(loaded.partyA, loaded.agreementIdHex);
      if (!current) throw new Error("The agreement is no longer readable.");
      setLoaded(current);

      const prepared = await prepareSignAgreementTransaction({
        signer: verifiedWallet,
        agreementPda: current.agreementPda,
        expectedVersion: current.record.version,
        expectedContentHashHex: bytesToHex(current.record.contentHash),
        expectedTermsHashHex: bytesToHex(current.record.termsHash),
      });
      await submit(prepared, "Signature");
      await refresh();
    } catch (cause) {
      reportFailure(cause, "Signing failed.");
    } finally {
      setBusy(false);
    }
  }

  async function proposeRevision() {
    if (!loaded) return;
    setError("");
    setBusy(true);
    try {
      const hashes = await hashAgreementDraft(
        {
          title: draft.title,
          summary: draft.summary,
          deliverables: draft.deliverables.split("\n"),
        },
        {
          scope: draft.scope,
          compensationNote: draft.compensationNote,
          completionDate: draft.completionDate,
        },
      );

      const prepared = await prepareProposeRevisionTransaction({
        signer: verifiedWallet,
        agreementPda: loaded.agreementPda,
        expectedVersion: loaded.record.version,
        newContentHashHex: hashes.contentHashHex,
        newTermsHashHex: hashes.termsHashHex,
      });
      await submit(prepared, "Revision");
      await refresh();
    } catch (cause) {
      reportFailure(cause, "Proposing the revision failed.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelAgreement() {
    if (!loaded) return;
    setError("");
    setBusy(true);
    try {
      const prepared = await prepareCancelAgreementTransaction({
        signer: verifiedWallet,
        agreementPda: loaded.agreementPda,
      });
      await submit(prepared, "Cancellation");
      await refresh();
    } catch (cause) {
      reportFailure(cause, "Cancelling failed.");
    } finally {
      setBusy(false);
    }
  }

  const record = loaded?.record;
  const expired =
    loaded !== null &&
    loaded.record.state === "pending" &&
    loaded.chainNow > 0 &&
    Number(loaded.record.expiresAt) <= loaded.chainNow;
  const isParty =
    record !== undefined &&
    (record.partyA.toBase58() === verifiedWallet ||
      record.partyB.toBase58() === verifiedWallet);
  const mySignature =
    record === undefined
      ? null
      : record.partyA.toBase58() === verifiedWallet
        ? record.sigA
        : record.sigB;
  const signedCurrentVersion =
    mySignature !== null && mySignature?.versionSigned === record?.version;
  const terminal = record?.state === "executed" || record?.state === "cancelled";

  return (
    <section className="ppv-grid ppv-agreements">
      <article className="ppv-panel">
        <span className="os-terminal-label">AGREE / BILATERAL</span>
        <h2>Agree on exact bytes.</h2>
        <p>
          Content and terms are canonicalized and hashed on this device. Neither
          document is uploaded; only the two hashes reach Solana devnet, and a
          signature names the exact version and both hashes it endorses.
        </p>

        <label className="ppv-field">
          <span>Counterparty wallet</span>
          <input
            value={draft.counterparty}
            onChange={(event) => set({ counterparty: event.target.value })}
            placeholder="Their Solana devnet wallet address"
            inputMode="text"
            autoCapitalize="none"
          />
        </label>
        <label className="ppv-field">
          <span>Title</span>
          <input
            value={draft.title}
            onChange={(event) => set({ title: event.target.value })}
          />
        </label>
        <label className="ppv-field">
          <span>Summary</span>
          <textarea
            value={draft.summary}
            onChange={(event) => set({ summary: event.target.value })}
            rows={3}
          />
        </label>
        <label className="ppv-field">
          <span>Deliverables</span>
          <textarea
            value={draft.deliverables}
            onChange={(event) => set({ deliverables: event.target.value })}
            rows={3}
            placeholder="One per line"
          />
        </label>
        <label className="ppv-field">
          <span>Scope</span>
          <textarea
            value={draft.scope}
            onChange={(event) => set({ scope: event.target.value })}
            rows={2}
          />
        </label>
        <label className="ppv-field">
          <span>Compensation note</span>
          <input
            value={draft.compensationNote}
            onChange={(event) => set({ compensationNote: event.target.value })}
            placeholder="Settled outside PPV — Foundation holds no funds"
          />
        </label>
        <div className="ppv-field-row">
          <label className="ppv-field">
            <span>Completion date</span>
            <input
              type="date"
              value={draft.completionDate}
              onChange={(event) => set({ completionDate: event.target.value })}
            />
          </label>
          <label className="ppv-field">
            <span>Agreement expires</span>
            <input
              type="date"
              value={draft.expiresOn}
              onChange={(event) => set({ expiresOn: event.target.value })}
            />
          </label>
        </div>

        <button
          className="ppv-primary"
          type="button"
          disabled={busy}
          onClick={() => void createAgreement()}
        >
          {busy ? "Working…" : "Create agreement"}
        </button>
        {loaded ? (
          <button
            type="button"
            disabled={busy || terminal || !isParty}
            onClick={() => void proposeRevision()}
          >
            Propose this as a revision
          </button>
        ) : null}
      </article>

      <article className="ppv-panel">
        <span className="os-terminal-label">AGREEMENT STATE</span>
        <div className="ppv-field-row">
          <label className="ppv-field">
            <span>Creator wallet</span>
            <input
              value={lookupParty}
              onChange={(event) => setLookupParty(event.target.value)}
              placeholder={`Defaults to ${shorten(verifiedWallet)}`}
              inputMode="text"
              autoCapitalize="none"
            />
          </label>
          <label className="ppv-field">
            <span>Agreement ID</span>
            <input
              value={lookupId}
              onChange={(event) => setLookupId(event.target.value)}
              placeholder="32-character agreement id"
              inputMode="text"
              autoCapitalize="none"
            />
          </label>
        </div>
        <button type="button" disabled={busy || !lookupId.trim()} onClick={() => void loadAgreement()}>
          Read from Solana devnet
        </button>

        {record && loaded ? (
          <div className="ppv-agreement-state">
            <dl>
              <div>
                <dt>State</dt>
                <dd>
                  <b>{expired ? "EXPIRED" : record.state.toUpperCase()}</b>
                </dd>
              </div>
              <div>
                <dt>Version</dt>
                <dd>v{record.version}</dd>
              </div>
              <div>
                <dt>Party A</dt>
                <dd>{shorten(record.partyA.toBase58())}</dd>
              </div>
              <div>
                <dt>Party B</dt>
                <dd>{shorten(record.partyB.toBase58())}</dd>
              </div>
              <div>
                <dt>Content hash</dt>
                <dd>{shorten(bytesToHex(record.contentHash), 10, 10)}</dd>
              </div>
              <div>
                <dt>Terms hash</dt>
                <dd>{shorten(bytesToHex(record.termsHash), 10, 10)}</dd>
              </div>
              <div>
                <dt>Expires</dt>
                <dd>{new Date(Number(record.expiresAt) * 1000).toLocaleString()}</dd>
              </div>
              <div>
                <dt>Executed</dt>
                <dd>
                  {record.state === "executed"
                    ? new Date(Number(record.executedAt) * 1000).toLocaleString()
                    : "—"}
                </dd>
              </div>
            </dl>

            <ul className="ppv-signature-list">
              {(
                [
                  ["Party A", record.partyA.toBase58(), record.sigA],
                  ["Party B", record.partyB.toBase58(), record.sigB],
                ] as const
              ).map(([label, wallet, signature]) => (
                <li key={label}>
                  <strong>{label}</strong>
                  <span>{shorten(wallet)}</span>
                  <em>
                    {signature === null
                      ? "Not signed"
                      : signature.versionSigned === record.version
                        ? `Signed v${signature.versionSigned}`
                        : `Cleared by revision (had signed v${signature.versionSigned})`}
                  </em>
                </li>
              ))}
            </ul>

            <p className="ppv-progress" role="status">
              {record.state === "executed"
                ? "Both parties signed this exact version. The agreement is executed and can no longer change."
                : record.state === "cancelled"
                  ? "This agreement was cancelled. Cancellation is final."
                  : expired
                    ? "This agreement expired before both parties signed. It can no longer be signed or revised."
                    : "Pending. A revision clears both signatures, so each party signs the version they actually read."}
            </p>

            <div className="ppv-proof-actions">
              <button
                type="button"
                disabled={busy || terminal || expired || !isParty || signedCurrentVersion}
                onClick={() => void signCurrentVersion()}
              >
                {signedCurrentVersion ? "You signed this version" : "Sign current version"}
              </button>
              <button
                type="button"
                disabled={busy || terminal || !isParty}
                onClick={() => void cancelAgreement()}
              >
                Cancel agreement
              </button>
              <a
                href={getPpvExplorerUrl("address", loaded.agreementPda)}
                target="_blank"
                rel="noreferrer noopener"
              >
                View account on Solana Devnet Explorer
              </a>
            </div>
            {!isParty ? (
              <p className="ppv-progress">
                You are not a party to this agreement. It is readable, but only
                Party A and Party B can sign, revise or cancel it.
              </p>
            ) : null}
          </div>
        ) : null}

        {txState !== "idle" && statusMessage ? (
          <p className={`ppv-progress ppv-tx-${txState}`} role="status">
            {statusMessage}
          </p>
        ) : null}
        {lastSignature ? (
          <a
            className="ppv-explorer-link"
            href={getPpvExplorerUrl("tx", lastSignature)}
            target="_blank"
            rel="noreferrer noopener"
          >
            View transaction on Solana Devnet Explorer
          </a>
        ) : null}
        {error ? (
          <p className="ppv-error" role="alert">
            {error}
          </p>
        ) : null}
      </article>
    </section>
  );
}
