import {
  getGwapScoreLabel,
  type GwapScoreResult,
} from "../lib/gwap-score";

export function GwapScoreDisplay({
  result,
  variant = "compact",
}: {
  result: GwapScoreResult;
  variant?: "compact" | "card" | "hero";
}) {
  const label = getGwapScoreLabel(result);

  return (
    <div
      className={`gwap-score-display is-${result.status} is-${variant}`}
      data-score-status={result.status}
      aria-label={result.message}
    >
      <span>
        <small>GWAPSCORE</small>
        <strong>{label}</strong>
      </span>
      <span>
        <small>TIER</small>
        <strong>{result.tier || (result.status === "unscored" ? "Not assigned" : "Unavailable")}</strong>
      </span>
      {variant !== "compact" ? <p>{result.message}</p> : null}
    </div>
  );
}
