import { BackToTopButton } from "./components/back-to-top-button";
import { CinematicHome } from "./components/cinematic-home";
import { UnifiedCinematicFlow } from "./components/unified-cinematic-flow";

export default function Home() {
  return (
    <>
      <UnifiedCinematicFlow />
      <CinematicHome />
      <BackToTopButton />
    </>
  );
}
