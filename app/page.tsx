import { BackToTopButton } from "./components/back-to-top-button";
import { getBuildLogSnapshot } from "./lib/changelog-live.server";
import { CinematicHome } from "./components/cinematic-home";
import { GwapMojisPromo } from "./components/gwapmojis-promo";
import { SingleTapGraphBridge } from "./components/single-tap-graph-bridge";
import { UnifiedCinematicFlow } from "./components/unified-cinematic-flow";

export default async function Home() {
  const buildLog = await getBuildLogSnapshot();

  return (
    <>
      <UnifiedCinematicFlow />
      <SingleTapGraphBridge />
      <GwapMojisPromo surface="public_home" variant="compact" />
      <CinematicHome initialLatestBuild={buildLog.entries[0]} />
      <BackToTopButton />
    </>
  );
}
