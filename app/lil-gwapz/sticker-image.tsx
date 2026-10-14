import Image from "next/image";
import {
  characterName,
  previewUrl,
  originalUrl,
  type Sticker,
} from "../lib/lil-gwapz-catalog";
export default function StickerImage({
  sticker,
  priority = false,
  full = false,
  sizes = "(max-width: 600px) 46vw, (max-width: 1000px) 29vw, 230px",
}: {
  sticker: Sticker;
  priority?: boolean;
  full?: boolean;
  sizes?: string;
}) {
  const alt =
    sticker.reaction + " — " + characterName(sticker.sex) + " Lil Gwapz";
  if (full)
    return (
      <Image
        unoptimized
        src={originalUrl(sticker)}
        alt={alt}
        width={1254}
        height={1254}
        loading="eager"
      />
    );
  return (
    <picture>
      <source
        type="image/webp"
        sizes={sizes}
        srcSet={[384, 768, 1254]
          .map((n) => previewUrl(sticker, n) + " " + n + "w")
          .join(", ")}
      />
      <Image
        unoptimized
        src={previewUrl(sticker, 768)}
        alt={alt}
        width={1254}
        height={1254}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
      />
    </picture>
  );
}
