import { respondToGwapMojisDownload } from "../../../../lib/gwapmojis-download-response.ts";

type DownloadContext = { params: Promise<{ asset: string }> };

export async function GET(request: Request, { params }: DownloadContext) {
  const { asset } = await params;
  return respondToGwapMojisDownload(request, asset);
}

export async function HEAD(request: Request, { params }: DownloadContext) {
  const { asset } = await params;
  return respondToGwapMojisDownload(request, asset);
}
