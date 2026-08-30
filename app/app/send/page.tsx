"use client";

import { useSignAndSendTransaction, useWallets } from "@privy-io/react-auth/solana";
import {
  clusterApiUrl,
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { useMemo, useRef, useState } from "react";
import { useGwapOs } from "../components/os-provider";
import { recordWalletActivity } from "../lib/wallet-activity";
import styles from "./send-mode.module.css";

const LAMPORTS_PER_SOL = BigInt(1_000_000_000);
const MAINNET_GENESIS_HASH = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

type ResolvedRecipient = {
  input: string;
  address: string;
  label: string;
  gnsName: string | null;
};

type Review = {
  recipient: ResolvedRecipient;
  amountInput: string;
  amountLamports: bigint;
  balanceLamports: bigint;
  feeLamports: bigint;
};

type SendPhase = "edit" | "review" | "signing" | "confirming" | "uncertain" | "success";

type GnsResolvePayload = {
  fullName?: string;
  available?: boolean;
  owner?: string | null;
  error?: string;
};

function parseSolToLamports(value: string): bigint | null {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d{0,9})?$/.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  try {
    const lamports = BigInt(whole) * LAMPORTS_PER_SOL + BigInt(fraction.padEnd(9, "0"));
    return lamports > BigInt(0) ? lamports : null;
  } catch {
    return null;
  }
}

function formatSol(lamports: bigint) {
  const whole = lamports / LAMPORTS_PER_SOL;
  const fraction = (lamports % LAMPORTS_PER_SOL).toString().padStart(9, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function shorten(value: string) {
  return value.length > 16 ? `${value.slice(0, 7)}…${value.slice(-7)}` : value;
}

export default function SendPage() {
  const { account } = useGwapOs();
  const { ready: walletsReady, wallets } = useWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const [recipientInput, setRecipientInput] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [resolved, setResolved] = useState<ResolvedRecipient | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [phase, setPhase] = useState<SendPhase>("edit");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [signature, setSignature] = useState("");
  const sendLock = useRef(false);

  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() || clusterApiUrl("mainnet-beta");
  const connection = useMemo(() => new Connection(rpcUrl, "confirmed"), [rpcUrl]);
  const signingWallet = useMemo(
    () => wallets.find((wallet) => wallet.address === account.verifiedWallet) ?? null,
    [account.verifiedWallet, wallets],
  );

  async function assertMainnet() {
    const genesisHash = await connection.getGenesisHash();
    if (genesisHash !== MAINNET_GENESIS_HASH) {
      throw new Error("GWAP_NETWORK_MISMATCH");
    }
  }

  async function resolveRecipient(value = recipientInput): Promise<ResolvedRecipient | null> {
    const input = value.trim();
    setError("");
    setStatus("");
    setResolved(null);

    if (!input) {
      setError("Enter a Solana address or .gwap name.");
      return null;
    }

    if (input.toLowerCase().endsWith(".gwap")) {
      const name = input.toLowerCase().slice(0, -5);
      if (!name) {
        setError("Enter a valid .gwap name.");
        return null;
      }

      setStatus("Resolving .gwap identity…");
      try {
        const response = await fetch(`/api/gns/resolve?name=${encodeURIComponent(name)}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        const payload = (await response.json()) as GnsResolvePayload;
        if (!response.ok) {
          setError(payload.error || "Could not resolve that .gwap name.");
          setStatus("");
          return null;
        }
        if (payload.available || !payload.owner) {
          setError(`${payload.fullName || `${name}.gwap`} is not currently registered.`);
          setStatus("");
          return null;
        }

        try {
          const address = new PublicKey(payload.owner).toBase58();
          if (address === account.verifiedWallet) {
            setError("The recipient resolves to your own verified wallet.");
            setStatus("");
            return null;
          }
          const next = {
            input,
            address,
            label: payload.fullName || `${name}.gwap`,
            gnsName: payload.fullName || `${name}.gwap`,
          };
          setResolved(next);
          setStatus(".gwap resolved. Verify the wallet below before continuing.");
          return next;
        } catch {
          setError("That .gwap record does not contain a valid Solana wallet.");
          setStatus("");
          return null;
        }
      } catch {
        setError("GNS resolution is temporarily unavailable. No transaction was created.");
        setStatus("");
        return null;
      }
    }

    try {
      const address = new PublicKey(input).toBase58();
      if (address === account.verifiedWallet) {
        setError("The recipient is your own verified wallet.");
        return null;
      }
      const next = { input, address, label: shorten(address), gnsName: null };
      setResolved(next);
      setStatus("Valid Solana recipient. Verify the address before continuing.");
      return next;
    } catch {
      setError("Enter a valid Solana wallet address or registered .gwap name.");
      return null;
    }
  }

  async function validateWalletDestination(recipientKey: PublicKey) {
    if (!PublicKey.isOnCurve(recipientKey.toBytes())) {
      throw new Error("GWAP_RECIPIENT_NOT_WALLET");
    }
    const accountInfo = await connection.getAccountInfo(recipientKey, "confirmed");
    if (accountInfo?.executable) {
      throw new Error("GWAP_RECIPIENT_EXECUTABLE");
    }
  }

  async function prepareReview() {
    setError("");
    setStatus("");

    const recipient = resolved?.input === recipientInput.trim() ? resolved : await resolveRecipient();
    if (!recipient) return;

    const amountLamports = parseSolToLamports(amountInput);
    if (!amountLamports) {
      setError("Enter a SOL amount greater than 0 with no more than 9 decimal places.");
      return;
    }

    if (!walletsReady || !signingWallet) {
      setError("The wallet that authenticated GwapOS is not available for signing. Reopen GwapOS from that wallet and try again.");
      return;
    }

    try {
      setStatus("Verifying mainnet, recipient, balance and network fee…");
      await assertMainnet();
      const sender = new PublicKey(account.verifiedWallet);
      const recipientKey = new PublicKey(recipient.address);
      await validateWalletDestination(recipientKey);
      const [{ blockhash }, balance] = await Promise.all([
        connection.getLatestBlockhash("confirmed"),
        connection.getBalance(sender, "confirmed"),
      ]);
      const transaction = new Transaction({ feePayer: sender, recentBlockhash: blockhash }).add(
        SystemProgram.transfer({
          fromPubkey: sender,
          toPubkey: recipientKey,
          lamports: amountLamports,
        }),
      );
      const fee = await connection.getFeeForMessage(transaction.compileMessage(), "confirmed");
      if (fee.value == null) throw new Error("GWAP_FEE_UNAVAILABLE");
      const feeLamports = BigInt(fee.value);
      const balanceLamports = BigInt(balance);

      if (amountLamports + feeLamports > balanceLamports) {
        setError(
          `Insufficient SOL. This wallet has about ${formatSol(balanceLamports)} SOL and must also cover the network fee.`,
        );
        setStatus("");
        return;
      }

      setReview({ recipient, amountInput: amountInput.trim(), amountLamports, balanceLamports, feeLamports });
      setPhase("review");
      setStatus("");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      if (message === "GWAP_NETWORK_MISMATCH") {
        setError("Send is blocked because the configured Solana RPC is not mainnet-beta.");
      } else if (message === "GWAP_RECIPIENT_NOT_WALLET" || message === "GWAP_RECIPIENT_EXECUTABLE") {
        setError("Send Mode accepts user wallet addresses only. Program, PDA, and executable destinations are blocked in this flow.");
      } else if (message === "GWAP_FEE_UNAVAILABLE") {
        setError("Solana did not return a reliable network fee. No signature was requested.");
      } else {
        setError("Could not safely prepare the transfer with the Solana network. No signature was requested.");
      }
      setStatus("");
    }
  }

  function markConfirmed(signatureText: string, recipient: ResolvedRecipient) {
    if (!review) return;
    recordWalletActivity({
      id: signatureText,
      kind: "send",
      sender: account.verifiedWallet,
      signature: signatureText,
      recipient: recipient.address,
      recipientLabel: recipient.label,
      amountSol: review.amountInput,
      createdAt: new Date().toISOString(),
    });
    setReview({ ...review, recipient });
    setSignature(signatureText);
    setPhase("success");
    setError("");
    setStatus("Confirmed on Solana.");
  }

  async function checkBroadcastStatus() {
    if (!review) return;
    setError("");

    if (!signature) {
      setStatus("GwapOS did not receive a transaction signature. Check your wallet's recent activity before starting over.");
      return;
    }

    try {
      setStatus("Checking this exact signature on Solana…");
      const response = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
      const transactionStatus = response.value[0];

      if (!transactionStatus) {
        setStatus("Solana has not reported a final result for this signature yet. Do not send again; check again shortly.");
        return;
      }

      if (transactionStatus.err) {
        setPhase("edit");
        setReview(null);
        setSignature("");
        setError("This transaction failed on-chain, so the SOL transfer did not complete. A network fee may still have been charged. Review a fresh balance before retrying.");
        setStatus("");
        return;
      }

      if (transactionStatus.confirmationStatus === "confirmed" || transactionStatus.confirmationStatus === "finalized") {
        markConfirmed(signature, review.recipient);
        return;
      }

      setStatus("The transaction is visible but not confirmed yet. Do not send again; check status again shortly.");
    } catch {
      setError("Could not verify the transaction status right now. Do not retry the transfer until you verify it in your wallet or Explorer.");
      setStatus("");
    }
  }

  async function confirmAndSend() {
    if (!review || !signingWallet || sendLock.current) return;
    sendLock.current = true;
    setError("");
    let walletPromptRequested = false;
    let broadcastSignature = "";

    try {
      await assertMainnet();
      let recipient = review.recipient;

      if (recipient.gnsName) {
        setPhase("signing");
        setStatus("Re-checking .gwap ownership before the wallet prompt…");
        const latest = await resolveRecipient(recipient.gnsName);
        if (!latest || latest.address !== recipient.address) {
          setPhase("edit");
          setReview(null);
          setError("The .gwap destination changed or could not be re-verified. Review the recipient again before sending.");
          return;
        }
        recipient = latest;
      }

      const currentWallet = wallets.find((wallet) => wallet.address === account.verifiedWallet);
      if (!currentWallet || currentWallet.address !== signingWallet.address) {
        setPhase("edit");
        setReview(null);
        setError("The active signing wallet changed. No transaction was submitted.");
        return;
      }

      const sender = new PublicKey(account.verifiedWallet);
      const destination = new PublicKey(recipient.address);
      await validateWalletDestination(destination);
      const [{ blockhash, lastValidBlockHeight }, balance] = await Promise.all([
        connection.getLatestBlockhash("confirmed"),
        connection.getBalance(sender, "confirmed"),
      ]);
      const transaction = new Transaction({ feePayer: sender, recentBlockhash: blockhash }).add(
        SystemProgram.transfer({
          fromPubkey: sender,
          toPubkey: destination,
          lamports: review.amountLamports,
        }),
      );
      const fee = await connection.getFeeForMessage(transaction.compileMessage(), "confirmed");
      if (fee.value == null) throw new Error("GWAP_FEE_UNAVAILABLE");
      const feeLamports = BigInt(fee.value);
      if (review.amountLamports + feeLamports > BigInt(balance)) {
        setPhase("review");
        setError("The wallet balance changed and no longer covers this transfer plus the network fee.");
        return;
      }

      setPhase("signing");
      setStatus("Review and approve the transaction in your wallet. GwapOS cannot approve it for you.");
      walletPromptRequested = true;
      const result = await signAndSendTransaction({
        transaction: new Uint8Array(
          transaction.serialize({ requireAllSignatures: false, verifySignatures: false }),
        ),
        wallet: currentWallet,
      });
      broadcastSignature = bs58.encode(result.signature);
      setSignature(broadcastSignature);
      setPhase("confirming");
      setStatus("Transaction broadcast. Waiting for Solana confirmation…");

      try {
        const confirmation = await connection.confirmTransaction(
          { signature: broadcastSignature, blockhash, lastValidBlockHeight },
          "confirmed",
        );
        if (confirmation.value.err) {
          setPhase("edit");
          setReview(null);
          setSignature("");
          setError("The transaction reached Solana but failed on-chain. No SOL transfer completed; a network fee may have been charged.");
          setStatus("");
          return;
        }
        markConfirmed(broadcastSignature, recipient);
      } catch {
        setReview({ ...review, recipient });
        setPhase("uncertain");
        setError("The transaction was broadcast, but confirmation could not be established. Do not send again until this exact signature is checked.");
        setStatus("");
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      const rejected = /reject|declin|cancel|denied/i.test(message);

      if (message === "GWAP_NETWORK_MISMATCH") {
        setPhase("review");
        setError("Send is blocked because the configured Solana RPC is not mainnet-beta.");
      } else if (message === "GWAP_RECIPIENT_NOT_WALLET" || message === "GWAP_RECIPIENT_EXECUTABLE") {
        setPhase("edit");
        setReview(null);
        setError("The destination is not a standard user wallet. No transaction was submitted.");
      } else if (message === "GWAP_FEE_UNAVAILABLE") {
        setPhase("review");
        setError("Solana did not return a reliable network fee. No transaction was submitted.");
      } else if (rejected) {
        setPhase("review");
        setError("The transaction was not approved. Nothing was sent.");
      } else if (walletPromptRequested) {
        if (broadcastSignature) setSignature(broadcastSignature);
        setPhase("uncertain");
        setError("The wallet interaction ended without a reliable final result. Do not retry automatically. Check your wallet activity first.");
      } else {
        setPhase("review");
        setError("The transfer could not be prepared safely. No wallet approval was requested.");
      }
      setStatus("");
    } finally {
      sendLock.current = false;
    }
  }

  function editTransfer() {
    setPhase("edit");
    setReview(null);
    setSignature("");
    setError("");
    setStatus("");
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.kicker}>Send SOL</p>
        <h1>Know the destination before you sign.</h1>
        <p>
          Send SOL from the wallet that authenticated GwapOS. A .gwap recipient is resolved to its
          underlying Solana wallet and re-verified immediately before the signature request.
        </p>
        <div className={styles.source}>
          <small>Sending from</small>
          <strong>{account.verifiedWallet}</strong>
        </div>
      </section>

      {phase === "edit" ? (
        <section className={styles.panel} aria-labelledby="send-details-title">
          <div className={styles.panelHead}>
            <div>
              <p className={styles.kicker}>Transfer details</p>
              <h2 id="send-details-title">Choose recipient and amount</h2>
            </div>
            <span className={styles.step}>1 of 2</span>
          </div>

          <div className={styles.form}>
            <div className={styles.field}>
              <label htmlFor="send-recipient">Recipient</label>
              <input
                className={styles.input}
                id="send-recipient"
                value={recipientInput}
                onChange={(event) => {
                  setRecipientInput(event.target.value);
                  setResolved(null);
                  setError("");
                  setStatus("");
                }}
                placeholder="name.gwap or Solana address"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <p className={styles.helper}>Resolve .gwap before continuing so you can inspect the underlying wallet.</p>
              <button className={styles.secondary} type="button" onClick={() => void resolveRecipient()}>
                Resolve recipient
              </button>
            </div>

            {resolved ? (
              <div className={styles.resolved} role="status">
                <div>
                  <small>{resolved.gnsName ? "Resolved .gwap" : "Verified recipient"}</small>
                  <strong>{resolved.label}</strong>
                  <p className={styles.helper}>{resolved.address}</p>
                </div>
                <span>Check</span>
              </div>
            ) : null}

            <div className={styles.field}>
              <label htmlFor="send-amount">Amount in SOL</label>
              <input
                className={styles.input}
                id="send-amount"
                inputMode="decimal"
                value={amountInput}
                onChange={(event) => {
                  setAmountInput(event.target.value);
                  setError("");
                }}
                placeholder="0.00"
              />
            </div>
          </div>

          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <p className={styles.status} role="status" aria-live="polite">{status}</p>

          <div className={styles.actions}>
            <button className={styles.primary} type="button" onClick={() => void prepareReview()}>
              Review transfer
            </button>
          </div>
        </section>
      ) : null}

      {review && (phase === "review" || phase === "signing" || phase === "confirming") ? (
        <section className={styles.panel} aria-labelledby="send-review-title">
          <div className={styles.panelHead}>
            <div>
              <p className={styles.kicker}>Final review</p>
              <h2 id="send-review-title">Verify every detail</h2>
            </div>
            <span className={styles.step}>2 of 2</span>
          </div>

          <div className={styles.review}>
            <div className={styles.reviewRow}>
              <small>Recipient</small>
              <strong>{review.recipient.label}</strong>
            </div>
            <div className={styles.reviewRow}>
              <small>Underlying wallet</small>
              <strong>{review.recipient.address}</strong>
            </div>
            <div className={styles.reviewRow}>
              <small>Amount</small>
              <strong>{review.amountInput} SOL</strong>
            </div>
            <div className={styles.reviewRow}>
              <small>Estimated network fee</small>
              <strong>~{formatSol(review.feeLamports)} SOL</strong>
            </div>
            <div className={styles.reviewRow}>
              <small>Current balance at review</small>
              <strong>{formatSol(review.balanceLamports)} SOL</strong>
            </div>
          </div>

          <div className={styles.warning}>
            This sends real SOL on mainnet. The next action requests approval from your connected wallet.
            GwapOS never signs automatically. Confirm the underlying wallet even when you entered a .gwap name.
          </div>

          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <p className={styles.status} role="status" aria-live="polite">{status}</p>

          <div className={styles.actions}>
            <button
              className={styles.primary}
              type="button"
              disabled={phase === "signing" || phase === "confirming"}
              onClick={() => void confirmAndSend()}
            >
              {phase === "signing" ? "Waiting for wallet…" : phase === "confirming" ? "Confirming…" : "Approve in wallet"}
            </button>
            <button
              className={styles.secondary}
              type="button"
              disabled={phase === "signing" || phase === "confirming"}
              onClick={editTransfer}
            >
              Edit details
            </button>
          </div>
        </section>
      ) : null}

      {review && phase === "uncertain" ? (
        <section className={styles.panel} aria-labelledby="send-uncertain-title">
          <div className={styles.panelHead}>
            <div>
              <p className={styles.kicker}>Status check required</p>
              <h2 id="send-uncertain-title">Do not send again yet.</h2>
            </div>
            <span className={styles.step}>Safety lock</span>
          </div>
          <div className={styles.warning}>
            The wallet may already have broadcast this transfer. GwapOS disables the normal resend path until you verify what happened.
          </div>
          {signature ? (
            <div className={styles.review}>
              <div className={styles.reviewRow}><small>Signature</small><strong>{signature}</strong></div>
              <div className={styles.reviewRow}><small>Recipient</small><strong>{review.recipient.label}</strong></div>
              <div className={styles.reviewRow}><small>Amount</small><strong>{review.amountInput} SOL</strong></div>
            </div>
          ) : null}
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <p className={styles.status} role="status" aria-live="polite">{status}</p>
          <div className={styles.actions}>
            <button className={styles.primary} type="button" onClick={() => void checkBroadcastStatus()}>
              {signature ? "Check this signature" : "Show safety guidance"}
            </button>
            {signature ? (
              <a
                className={styles.secondary}
                href={`https://explorer.solana.com/tx/${encodeURIComponent(signature)}`}
                target="_blank"
                rel="noreferrer"
              >
                Open Explorer
              </a>
            ) : (
              <button className={styles.secondary} type="button" onClick={editTransfer}>
                I checked my wallet — start over
              </button>
            )}
          </div>
        </section>
      ) : null}

      {review && phase === "success" ? (
        <section className={styles.success} aria-labelledby="send-success-title">
          <span className={styles.successBadge}>Confirmed</span>
          <h2 id="send-success-title">SOL sent.</h2>
          <p className={styles.copy}>The transfer is confirmed on Solana and has been added to this device's GwapOS wallet activity for this wallet only.</p>
          <div className={styles.successMeta}>
            <div><small>Recipient</small><strong>{review.recipient.label}</strong></div>
            <div><small>Amount</small><strong>{review.amountInput} SOL</strong></div>
            <div><small>Signature</small><strong>{signature}</strong></div>
          </div>
          <a
            className={styles.explorer}
            href={`https://explorer.solana.com/tx/${encodeURIComponent(signature)}`}
            target="_blank"
            rel="noreferrer"
          >
            View on Solana Explorer →
          </a>
          <div className={styles.actions}>
            <button className={styles.secondary} type="button" onClick={editTransfer}>Send another</button>
          </div>
        </section>
      ) : null}

      <p className={styles.notice}>
        Mainnet native SOL only. GwapOS verifies the RPC genesis hash before signing. SPL tokens and swaps remain gated for separate review.
      </p>
    </div>
  );
}
