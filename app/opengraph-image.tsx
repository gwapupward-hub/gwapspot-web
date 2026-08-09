import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "GWAP crown and wordmark on a neon-green background";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const artwork = await readFile(
    join(process.cwd(), "app", "assets", "gwap-link-preview.png"),
  );
  const artworkData = Uint8Array.from(artwork).buffer;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          background:
            "radial-gradient(circle at 50% 48%, #12d90f 0%, #087209 48%, #021b03 100%)",
        }}
      >
        {/* ImageResponse renders raw image data and does not support next/image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={artworkData as unknown as string}
          alt=""
          width={1050}
          height={1050}
          style={{
            width: 1050,
            height: 1050,
            position: "absolute",
            top: -150,
            left: 75,
          }}
        />
      </div>
    ),
    size,
  );
}
