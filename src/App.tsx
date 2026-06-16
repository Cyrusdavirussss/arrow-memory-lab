import { useEffect, useMemo, useState } from "react";
import ArrowMemoryLab from "./apps/ArrowMemoryLab";
import BridgeLab from "./apps/BridgeLab";

type Route = "/" | "/arrow-memory-lab" | "/bridge-lab";

function getRouteFromHash(): Route {
  const hash = window.location.hash.replace(/^#/, "");
  if (hash === "/arrow-memory-lab") return "/arrow-memory-lab";
  if (hash === "/bridge-lab") return "/bridge-lab";
  return "/";
}

function VersionCard({
  href,
  eyebrow,
  title,
  description,
}: {
  href: Route;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <a className="version-card card" href={`#${href}`}>
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      <p>{description}</p>
      <strong>Open lab</strong>
    </a>
  );
}

function LandingPage() {
  return (
    <main className="landing-shell">
      <section className="landing-hero">
        <span className="kicker">Arrow Memory Lab</span>
        <h1>Choose Your Lab</h1>
        <p>
          V1 keeps the original hidden ThinkScript calculation clean. V2 adds a
          bridge from visible candle behavior to the hidden arrow mechanism.
        </p>
      </section>

      <section className="version-grid">
        <VersionCard
          href="/arrow-memory-lab"
          eyebrow="V1: Arrow Memory Lab"
          title="Open V1"
          description="Study the hidden ThinkScript calculation: Value -> Avg -> Diff -> Memory -> Arrow."
        />
        <VersionCard
          href="/bridge-lab"
          eyebrow="V2: Hidden-to-Visible Bridge Lab"
          title="Open V2"
          description="Study how visible candle behaviour creates the hidden calculation that leads to arrows."
        />
      </section>
    </main>
  );
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => getRouteFromHash());

  useEffect(() => {
    const handleHashChange = () => setRoute(getRouteFromHash());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return useMemo(() => {
    if (route === "/arrow-memory-lab") return <ArrowMemoryLab />;
    if (route === "/bridge-lab") return <BridgeLab />;
    return <LandingPage />;
  }, [route]);
}
