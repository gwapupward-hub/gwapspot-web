import { BackToTopButton } from "./components/back-to-top-button";
import { CinematicHomeServer } from "./components/cinematic-home-server";
import { GwapMojisPromo } from "./components/gwapmojis-promo";
import { SingleTapGraphBridge } from "./components/single-tap-graph-bridge";
import { UnifiedCinematicFlow } from "./components/unified-cinematic-flow";

export default function Home() {
  return (
    <>
      <UnifiedCinematicFlow />
      <SingleTapGraphBridge />
      <GwapMojisPromo surface="public_home" variant="compact" />
      <CinematicHomeServer />
      <BackToTopButton />
    </>
  );
}
