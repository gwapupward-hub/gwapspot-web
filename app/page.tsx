import { BackToTopButton } from "./components/back-to-top-button";
import { CinematicHome } from "./components/cinematic-home";
import { GwapMojisPromo } from "./components/gwapmojis-promo";
import { SingleTapGraphBridge } from "./components/single-tap-graph-bridge";
import { UnifiedCinematicFlow } from "./components/unified-cinematic-flow";

export default function Home() {
  return (
    <>
      <UnifiedCinematicFlow />
      <SingleTapGraphBridge />
      <CinematicHome />
      <GwapMojisPromo />
      <BackToTopButton />
    </>
  );
}
