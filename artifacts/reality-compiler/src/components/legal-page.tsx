import { useEffect, useState, type ReactNode } from "react";

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

interface LegalPageProps {
  title: string;
  intro?: ReactNode;
  lastUpdated: string;
  sections: LegalSection[];
}

export function LegalPage({ title, intro, lastUpdated, sections }: LegalPageProps) {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? "");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveId(visible.target.id);
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [sections]);

  return (
    <div className="flex-1 overflow-y-auto" data-testid="page-legal">
      <div className="container mx-auto max-w-6xl px-6 py-12 lg:py-16 grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-3">
              On this page
            </p>
            <nav className="flex flex-col gap-2 text-sm">
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className={`transition-colors hover:text-foreground ${
                    activeId === s.id
                      ? "text-foreground font-medium"
                      : "text-muted-foreground"
                  }`}
                >
                  {s.title}
                </a>
              ))}
            </nav>
          </div>
        </aside>
        <div className="min-w-0">
          <header className="mb-8 space-y-3">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
              Legal
            </p>
            <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">
              {title}
            </h1>
            <p className="text-muted-foreground text-sm font-mono">
              Last updated: {lastUpdated}
            </p>
            {intro ? (
              <div className="text-muted-foreground text-base leading-relaxed pt-2">
                {intro}
              </div>
            ) : null}
          </header>
          <article className="space-y-10 text-foreground/90 leading-relaxed">
            {sections.map((s) => (
              <section
                key={s.id}
                id={s.id}
                className="scroll-mt-24 space-y-3"
                data-testid={`section-${s.id}`}
              >
                <h2 className="text-xl font-semibold tracking-tight">
                  {s.title}
                </h2>
                <div className="space-y-3 text-foreground/80">{s.body}</div>
              </section>
            ))}
          </article>
        </div>
      </div>
    </div>
  );
}
