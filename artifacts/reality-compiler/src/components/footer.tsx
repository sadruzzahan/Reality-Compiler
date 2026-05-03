import { Link } from "wouter";
import { Hexagon } from "lucide-react";

const LEGAL_LINKS = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/acceptable-use", label: "Acceptable use" },
  { href: "/cookies", label: "Cookies" },
  { href: "/legal/dpa", label: "DPA" },
  { href: "/contact", label: "Contact" },
];

export function Footer() {
  return (
    <footer className="border-t border-border/40 bg-background/80 mt-12">
      <div className="container max-w-screen-2xl mx-auto px-6 py-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Hexagon className="h-4 w-4 text-primary" />
          <span className="font-mono text-xs">
            © {new Date().getFullYear()} Reality Compiler
          </span>
        </div>
        <nav
          className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-mono"
          aria-label="Footer"
        >
          {LEGAL_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted-foreground hover:text-foreground transition-colors"
              data-testid={`link-footer-${link.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
