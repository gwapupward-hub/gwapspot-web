import type {
  AccountSnapshot,
  AudienceResponse,
  PlatformPost,
  PlatformUser,
  PostSnapshot,
} from "./types";

export interface SocialPlatformAdapter {
  resolveUser(username: string): Promise<PlatformUser>;
  verifyFollow?(userId: string): Promise<boolean | "unsupported">;
  getAccountSnapshot(userId: string): Promise<AccountSnapshot>;
  getRecentPosts(userId: string): Promise<PlatformPost[]>;
  getPostSnapshot(postId: string): Promise<PostSnapshot>;
  getPublicResponses?(postId: string): Promise<AudienceResponse[]>;
}
