import { CinematicHome } from "./components/cinematic-home";
import { MobileCinematicFlow } from "./components/mobile-cinematic-flow";
import { ScrollDirector } from "./components/scroll-director";

export default function Home() {
  return (
    <>
      <ScrollDirector />
      <MobileCinematicFlow />
      <CinematicHome />
    </>
  );
}
