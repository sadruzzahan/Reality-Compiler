import { Link } from "wouter";
import { ArrowRight, Cpu, Database, FileText, Image as ImageIcon, MessagesSquare, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDocumentHead } from "@/hooks/use-document-head";

const STEPS = [
  {
    icon: FileText,
    title: "Describe your product",
    body: "Write a plain-English description of the physical product you want to build — materials, vibe, constraints, target user. No CAD, no spec sheets.",
  },
  {
    icon: Cpu,
    title: "The compiler runs",
    body: "An industrial-design model turns your prompt into a structured spec: product name, dimensions, primary material, processes, and a full bill of materials.",
  },
  {
    icon: ImageIcon,
    title: "A concept image is rendered",
    body: "An image model generates a clean studio render so you can see what the compiler imagined — useful for sharing, pitching, or sanity-checking the geometry.",
  },
  {
    icon: Database,
    title: "Cost & lead time are estimated",
    body: "Each line item in the BOM gets a unit cost. The compiler aggregates a low/high cost band and a realistic lead time for a contract manufacturer.",
  },
  {
    icon: MessagesSquare,
    title: "Refine with a conversation",
    body: "Reply with changes — swap a material, shrink it, simplify it for injection molding — and the compiler regenerates a fresh spec that builds on the previous one.",
  },
  {
    icon: Wrench,
    title: "Hand it to a manufacturer",
    body: "Export the BOM and notes and use them as a starting point with a real CM. Reality Compiler is the zero-to-one step, not a replacement for a mechanical engineer.",
  },
];

export default function About() {
  useDocumentHead({
    title: "How Reality Compiler works — from prompt to manufacturer",
    description:
      "A 6-step walk-through of how Reality Compiler turns a plain-text prompt into a structured design spec, concept render, BOM, and a manufacturer who can build it.",
    ogType: "article",
  });
  return (
    <div className="flex-1 overflow-y-auto" data-testid="page-about">
      <div className="mx-auto max-w-4xl px-6 py-16 lg:py-24">
        <div className="space-y-4">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">How it works</p>
          <h1 className="text-4xl lg:text-5xl font-bold tracking-tight">
            From a sentence to a <span className="text-primary italic">manufacturable</span> concept.
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Reality Compiler is a thinking tool for indie hardware founders. You describe what you want; it produces a
            structured design spec, a concept image, a bill of materials, and an honest cost estimate. Then you iterate.
          </p>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2">
          {STEPS.map((step, i) => (
            <Card key={step.title} data-testid={`step-${i}`} className="border-border/60">
              <CardHeader className="flex-row items-center gap-3 space-y-0 pb-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted/40">
                  <step.icon className="h-4 w-4 text-primary" />
                </div>
                <CardTitle className="font-mono text-sm tracking-tight">
                  {String(i + 1).padStart(2, "0")} · {step.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-16 rounded-lg border border-border/60 bg-muted/20 p-8">
          <h2 className="text-2xl font-semibold tracking-tight">What it isn't</h2>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>· Not a CAD tool — geometry is described, not modeled.</li>
            <li>· Not a sourcing engine — supplier matching is on the roadmap.</li>
            <li>· Not a substitute for a real mechanical engineer when you commit to tooling.</li>
          </ul>
        </div>

        <div className="mt-12 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-sm text-muted-foreground">Ready to compile something?</p>
          <Button asChild size="lg" data-testid="button-start-compiling">
            <Link href="/" className="font-mono text-sm">
              Start compiling <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
