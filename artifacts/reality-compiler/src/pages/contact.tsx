import { useState } from "react";
import { Mail, Shield, BookOpen, Bug, Loader2, CheckCircle2 } from "lucide-react";
import { submitContactMessage } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const CHANNELS = [
  {
    icon: Mail,
    title: "General",
    body: "Product questions, partnerships, or anything else.",
    address: "hello@reality-compiler.example",
  },
  {
    icon: Shield,
    title: "Privacy & data rights",
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
    title: "Legal & abuse",
    body: "DMCA, content takedowns, and law-enforcement requests.",
    address: "legal@reality-compiler.example",
  },
];

type Topic = "general" | "privacy" | "security" | "legal" | "abuse";

export default function ContactPage() {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<Topic>("general");
  const [message, setMessage] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await submitContactMessage({ name, email, topic, message });
      setSubmitted(true);
      toast({
        title: "Message sent",
        description: "We'll route it to the right team and reply by email.",
      });
    } catch (err) {
      toast({
        title: "Could not send message",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto" data-testid="page-contact">
      <div className="container mx-auto max-w-4xl px-6 py-16 space-y-12">
        <div className="space-y-3">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
            Contact
          </p>
          <h1 className="text-4xl lg:text-5xl font-bold tracking-tight">
            How to reach us
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Send us a message below and we will route it to the right team,
            or email us directly using the addresses on the right.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <Card data-testid="card-contact-form">
            <CardHeader>
              <CardTitle>Send a message</CardTitle>
            </CardHeader>
            <CardContent>
              {submitted ? (
                <div
                  className="flex items-start gap-3 rounded-md border border-primary/30 bg-primary/5 p-4"
                  data-testid="contact-form-success"
                >
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-medium">Message received.</p>
                    <p className="text-sm text-muted-foreground">
                      A human will reply to {email} within two business days.
                    </p>
                  </div>
                </div>
              ) : (
                <form onSubmit={onSubmit} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="contact-name">Name</Label>
                      <Input
                        id="contact-name"
                        data-testid="input-contact-name"
                        required
                        minLength={2}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contact-email">Email</Label>
                      <Input
                        id="contact-email"
                        data-testid="input-contact-email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact-topic">Topic</Label>
                    <Select
                      value={topic}
                      onValueChange={(v) => setTopic(v as Topic)}
                    >
                      <SelectTrigger
                        id="contact-topic"
                        data-testid="select-contact-topic"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">General</SelectItem>
                        <SelectItem value="privacy">
                          Privacy &amp; data rights
                        </SelectItem>
                        <SelectItem value="security">Security</SelectItem>
                        <SelectItem value="legal">Legal / DMCA</SelectItem>
                        <SelectItem value="abuse">Report abuse</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact-message">Message</Label>
                    <Textarea
                      id="contact-message"
                      data-testid="textarea-contact-message"
                      rows={6}
                      required
                      minLength={10}
                      maxLength={5000}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      {message.length} / 5000 characters
                    </p>
                  </div>
                  <Button
                    type="submit"
                    disabled={submitting}
                    data-testid="button-contact-submit"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending…
                      </>
                    ) : (
                      "Send message"
                    )}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <div className="space-y-3">
            {CHANNELS.map((c) => (
              <Card
                key={c.title}
                data-testid={`contact-${c.title.toLowerCase().split(" ")[0]}`}
              >
                <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                  <c.icon className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">{c.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  <p className="text-xs text-muted-foreground">{c.body}</p>
                  <a
                    href={`mailto:${c.address}`}
                    className="font-mono text-xs text-primary hover:underline break-all"
                  >
                    {c.address}
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
