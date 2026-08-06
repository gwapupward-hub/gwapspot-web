import part1 from "../components/splash-data/part-1";
import part2 from "../components/splash-data/part-2";
import part3 from "../components/splash-data/part-3";
import part4 from "../components/splash-data/part-4";
import part5 from "../components/splash-data/part-5";
import part6 from "../components/splash-data/part-6";
import part7 from "../components/splash-data/part-7";
import part8 from "../components/splash-data/part-8";
import part9 from "../components/splash-data/part-9";
import part10 from "../components/splash-data/part-10";
import part11 from "../components/splash-data/part-11";
import part12 from "../components/splash-data/part-12";
import part13 from "../components/splash-data/part-13";
import part14 from "../components/splash-data/part-14";

export const runtime = "nodejs";
export const dynamic = "force-static";

const splashBase64 = [
  part1,
  part2,
  part3,
  part4,
  part5,
  part6,
  part7,
  part8,
  part9,
  part10,
  part11,
  part12,
  part13,
  part14,
].join("");

export function GET() {
  return new Response(Buffer.from(splashBase64, "base64"), {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
