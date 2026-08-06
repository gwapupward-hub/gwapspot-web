import Image from "next/image";

export default function Loading() {
  return (
    <main className="route-loading" aria-live="polite" aria-busy="true">
      <span className="route-loading__mark">
        <Image src="/logo.png" alt="" width={58} height={58} />
      </span>
      <strong>GWAP</strong>
      <small>Loading the ecosystem</small>
    </main>
  );
}
