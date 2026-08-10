import { GwapBootSequence } from "./components/gwap-boot-sequence";
import { CinematicHome } from "./components/cinematic-home";
import { ScrollDirector } from "./components/scroll-director";

export default function Home() {
  return (
    <>
      <ScrollDirector />
      <GwapBootSequence />
      <CinematicHome />
    </>
  );
}
