export type GwapScoreStatus = "scored" | "unscored" | "unavailable" | "hidden";

export type GwapWalletIntelligence = {
  wallet: string;
  identity: {
    status: string;
    name: string | null;
    fullName: string | null;
    verified: boolean;
    isGenesis: boolean;
    tier: string | null;
    profileUrl: string | null;
  };
  reputation: {
    status: GwapScoreStatus;
    gwapScore: number | null;
    tier: string | null;
    message: string | null;
  };
  assets: unknown;
  portfolio: unknown;
  risk: unknown;
  meta: {
    version: string;
    network: string;
    generatedAt: string;
  };
};

export type GwapIntelligenceClientOptions = {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

export class GwapIntelligenceClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GwapIntelligenceClientOptions) {
    if (!options.apiKey?.startsWith("gwap_live_")) {
      throw new TypeError("A valid GWAP API key is required.");
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || "https://www.gwapspot.com").replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl || fetch;
  }

  async getWalletIntelligence(
    wallet: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<GwapWalletIntelligence> {
    const response = await this.fetchImpl(
      `${this.baseUrl}/api/v1/b2b/intelligence/${encodeURIComponent(wallet)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "x-api-key": this.apiKey,
        },
        signal: options.signal,
      },
    );

    const body = (await response.json().catch(() => ({}))) as
      | GwapWalletIntelligence
      | { error?: string };

    if (!response.ok) {
      const message =
        "error" in body && typeof body.error === "string"
          ? body.error
          : `GWAP API request failed with status ${response.status}.`;
      throw new Error(message);
    }

    return body as GwapWalletIntelligence;
  }
}
