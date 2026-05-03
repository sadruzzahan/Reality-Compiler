import { Mail, Shield, BookOpen, Bug } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const CHANNELS = [
  {
    icon: Mail,
    title: "General",
    body: "Product questions, partnerships, or anything else.",
    address: "hello@reality-compiler.example",
  },
  {
    icon: Shield,
    title: "Privacy &amp; data rights",
    body: "Access, export, correction, or deletion requests under GDPR / CCPA.",
    address: "privacy@reality-compiler.example",
  },
  {
    icon: Bug,
    title: "Security",
    body: "Vulnerability reports — we will acknowledge within 48 hours.",
    address: "security@reality-compiler.example",
  },
  {
    icon: BookOpen,
    title: "Legal &amp; abuse",
    body: "DMCA, content takedowns, and law-enforcement requests.",
    address: "legal@reality-compiler.example",
  },
];

export default function ContactPage() {
  return (
    <div className="flex-1 overflow-y-auto" data-testid="page-contact">
      <div className="container mx-auto max-w-4xl px-6 py-16">
        <div className="space-y-3 mb-10">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
            Contact
          </p>
          <h1 className="text-4xl lg:text-5xl font-bold tracking-tight">
            How to reach us
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Email is the fastest way to get a human. Pick the channel that
            best fits your request and we will route it from there.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {CHANNELS.map((c) => (
            <Card key={c.title} data-testid={`contact-${c.title.toLowerCase().split(" ")[0]}`}>
              <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-3">
                <c.icon className="h-5 w-5 text-primary" />
                <CardTitle
                  className="text-lg"
                  dangerouslySetInnerHTML={{ __html: c.title }}
                />
              </CardHeader>
              <CardContent className="space-y-2">
                <p
                  className="text-sm text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: c.body }}
                />
                <a
                  href={`mailto:${c.address}`}
                  className="font-mono text-sm text-primary hover:underline break-all"
                >
                  {c.address}
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
