export const SOCIAL_PLATFORMS = ["x"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const VERIFICATION_CARD_THEMES = [
  "orange",
  "red",
  "green",
  "purple",
] as const;
export type VerificationCardTheme = (typeof VERIFICATION_CARD_THEMES)[number];

export const VERIFICATION_STATES = [
  "NOT_CONNECTED",
  "ACCOUNT_CLAIMED",
  "CHALLENGE_ISSUED",
  "AWAITING_POST",
  "POST_DETECTED",
  "ACCOUNT_MATCHED",
  "FOLLOW_CONFIRMED",
  "VERIFIED",
  "MONITORING",
  "BASELINE_BUILDING",
  "PROVISIONAL_SCORE",
  "MATURE_SCORE",
  "STALE",
  "REVERIFY_REQUIRED",
  "REVOKED",
  "PLATFORM_UNAVAILABLE",
  "INSUFFICIENT_EVIDENCE",
] as const;
export type VerificationState = (typeof VERIFICATION_STATES)[number];

export type FollowVerificationStatus =
  | "pending"
  | "confirmed"
  | "not_following"
  | "unsupported";

export type SocialAccount = {
  id: string;
  gwapUserId: string;
  platform: SocialPlatform;
  platformUserId: string;
  currentUsername: string;
  displayName: string | null;
  verificationMethod: "PROOF_OF_CONTROL_PUBLIC_POST";
  verificationState: VerificationState;
  followStatus: FollowVerificationStatus;
  verificationProofPostId: string | null;
  verifiedAt: string | null;
  verificationExpiresAt: string | null;
  monitoringStatus: "NOT_STARTED" | "READY" | "PAUSED";
  observationFrequencyHours: 12;
  lastObservedAt: string | null;
  nextObservationAt: string | null;
  baselineStartedAt: string | null;
  activeChallengeId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VerificationChallenge = {
  id: string;
  socialAccountId: string;
  platform: SocialPlatform;
  challengeHash: string;
  cardTheme: VerificationCardTheme;
  state: "active" | "consumed" | "expired" | "revoked";
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
};

export type VerificationEventType =
  | "ACCOUNT_CLAIMED"
  | "CHALLENGE_CREATED"
  | "CHALLENGE_EXPIRED"
  | "POST_DETECTED"
  | "ACCOUNT_MATCHED"
  | "FOLLOW_CONFIRMED"
  | "FOLLOW_NOT_CONFIRMED"
  | "ACCOUNT_VERIFIED"
  | "VERIFICATION_FAILED";

export type VerificationEvent = {
  id: string;
  socialAccountId: string;
  gwapUserId: string;
  platform: SocialPlatform;
  type: VerificationEventType;
  timestamp: string;
  metadata: Record<string, string | number | boolean | null>;
};

export type PlatformUser = {
  id: string;
  username: string;
  name: string | null;
  protected: boolean;
};

export type AccountSnapshot = Record<string, never>;

export type PlatformPost = {
  id: string;
  authorId: string;
  text: string;
  createdAt: string;
};

export type PostSnapshot = Record<string, never>;
export type AudienceResponse = Record<string, never>;

export type SocialSummary = {
  accounts: SocialAccount[];
  verifiedCount: number;
  scoreStatus: "NOT_STARTED";
  score: null;
  confidence: null;
};
