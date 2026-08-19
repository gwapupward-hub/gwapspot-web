import type {
  AccountSnapshot,
  AudienceResponse,
  PlatformPost,
  PlatformUser,
  PostSnapshot,
  VerificationMessage,
} from "./types";

export interface SocialPlatformAdapter {
  resolveUser(username: string): Promise<PlatformUser>;
  verifyFollow?(userId: string): Promise<boolean | "unsupported">;
  collectVerificationMessages?(): Promise<VerificationMessage[]>;
  getAccountSnapshot(userId: string): Promise<AccountSnapshot>;
  getRecentPosts(userId: string): Promise<PlatformPost[]>;
  getPostSnapshot(postId: string): Promise<PostSnapshot>;
  getPublicResponses?(postId: string): Promise<AudienceResponse[]>;
}
