import { Link } from "wouter";
import {
  ArrowRight,
  Check,
  CircleDollarSign,
  Factory,
  Hammer,
  Receipt,
  Shield,
  Sparkles,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDocumentHead } from "@/hooks/use-document-head";

const FEATURES_FREE = [
  "Unlimited prompts and design sessions",
  "Auto-generated BOM, processes, and concept renders",
  "Browse and order from the marketplace",
  "Public designer profile with portfolio",
];

const FEATURES_DESIGNER = [
  "Publish designs to the marketplace",
  "70% of every license sale, paid out monthly",
  "Quote routing across vetted suppliers",
  "Order, fulfilment, and refund tooling",
];

const STEPS = [
  {
    icon: Sparkles,
    title: "Compile",
    body: "Describe a product. Our model generates a structured spec, BOM, and concept image — free, every time.",
  },
  {
    icon: Hammer,
    title: "Publish",
    body: "Set a license price. We attach quotes from manufacturers and list it in the marketplace.",
  },
  {
    icon: Truck,
    title: "Order",
    body: "Buyers choose a quote and ship-to. Manufacturers fulfil. We collect once, pay everyone.",
  },
  {
    icon: CircleDollarSign,
    title: "Get paid",
    body: "70% of license revenue is held for the dispute window, then paid out monthly once you clear $50.",
  },
];

function exampleEarnings(price: number, units: number) {
  const creator = price * 0.7;
  const platform = price * 0.3;
  return {
    creatorPerUnit: creator,
    platformPerUnit: platform,
    creatorTotal: creator * units,
    platformTotal: platform * units,
  };
}

const EXAMPLES: { name: string; price: number; units: number }[] = [
  { name: "Indie maker", price: 49, units: 25 },
  { name: "Hot drop", price: 129, units: 200 },
  { name: "Hardware classic", price: 299, units: 1000 },
];

export default function PricingPage() {
  useDocumentHead({
    title: "Pricing — Free to compile, 70/30 split when you sell",
    description:
      "Reality Compiler is free to use. When a design sells, the creator earns 70% of the license fee and the platform keeps 30%. Manufacturing is paid separately to the supplier.",
  });

  return (
    <div className="flex-1 overflow-auto" data-testid="page-pricing">
      <section className="container max-w-5xl mx-auto px-6 pt-16 pb-10">
        <Badge
          variant="outline"
          className="mb-4 bg-background px-3 py-1 font-mono text-xs text-primary border-primary/20"
        >
          Pricing
        </Badge>
        <h1 className="text-4xl lg:text-5xl font-bold tracking-tight">
          Free to compile.{" "}
          <span className="text-primary italic">70/30</span> when you sell.
        </h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-2xl">
          Reality Compiler is free for designers and buyers. There are no
          subscriptions and no per-prompt fees. We only earn when one of your
          designs ships.
        </p>
      </section>

      <section className="container max-w-5xl mx-auto px-6 grid gap-6 md:grid-cols-2 pb-12">
        <Card data-testid="card-tier-free" className="border-border/60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="font-mono uppercase tracking-wider text-sm">
                Compiler
              </CardTitle>
              <Badge variant="secondary" className="font-mono text-xs">
                Always free
              </Badge>
            </div>
            <div className="flex items-baseline gap-2 pt-2">
              <span className="text-5xl font-bold">$0</span>
              <span className="text-muted-foreground font-mono text-sm">
                / forever
              </span>
            </div>
            <CardDescription className="pt-2">
              Use the compiler to spec real hardware, browse the marketplace,
              and place orders.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {FEATURES_FREE.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button asChild className="w-full mt-6 font-mono">
              <Link href="/" data-testid="button-pricing-cta-free">
                Start compiling <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card
          data-testid="card-tier-designer"
          className="border-primary/40 ring-1 ring-primary/20 bg-card"
        >
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="font-mono uppercase tracking-wider text-sm">
                Designer
              </CardTitle>
              <Badge className="font-mono text-xs">Earn 70%</Badge>
            </div>
            <div className="flex items-baseline gap-2 pt-2">
              <span className="text-5xl font-bold">70%</span>
              <span className="text-muted-foreground font-mono text-sm">
                of every license sale
              </span>
            </div>
            <CardDescription className="pt-2">
              Same compiler. Set a price, publish, and we route orders to
              manufacturers and pay you out.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {FEATURES_DESIGNER.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button asChild className="w-full mt-6 font-mono">
              <Link href="/sign-up" data-testid="button-pricing-cta-designer">
                Create an account{" "}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="container max-w-5xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold tracking-tight">
          How a sale flows
        </h2>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          Every order is split between the designer (license), the
          manufacturer (production), shipping, and platform fees. Here's
          where each dollar goes.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <Card
              key={s.title}
              className="border-border/60"
              data-testid={`pricing-step-${i}`}
            >
              <CardHeader className="pb-3 flex-row items-center gap-3 space-y-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted/40">
                  <s.icon className="h-4 w-4 text-primary" />
                </div>
                <CardTitle className="font-mono text-sm tracking-tight">
                  {String(i + 1).padStart(2, "0")} · {s.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {s.body}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="container max-w-5xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold tracking-tight">
          Example designer earnings
        </h2>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          The license price is whatever you set. Manufacturing is paid
          directly to the supplier the buyer picks; it's not part of your
          cut. Numbers below assume a US-issued payout, before sales tax.
        </p>
        <div className="mt-8 overflow-x-auto">
          <table
            className="w-full text-sm border border-border/60 rounded-lg overflow-hidden"
            data-testid="table-pricing-examples"
          >
            <thead className="bg-muted/40 font-mono text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Scenario</th>
                <th className="text-right px-4 py-3">License price</th>
                <th className="text-right px-4 py-3">Units sold</th>
                <th className="text-right px-4 py-3 text-emerald-400">
                  You earn
                </th>
                <th className="text-right px-4 py-3 text-muted-foreground">
                  Platform
                </th>
              </tr>
            </thead>
            <tbody>
              {EXAMPLES.map((e) => {
                const earn = exampleEarnings(e.price, e.units);
                return (
                  <tr
                    key={e.name}
                    className="border-t border-border/40 font-mono"
                  >
                    <td className="px-4 py-3">{e.name}</td>
                    <td className="px-4 py-3 text-right">
                      ${e.price.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {e.units.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-400 font-bold">
                      ${earn.creatorTotal.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      ${earn.platformTotal.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="container max-w-5xl mx-auto px-6 py-12 grid gap-4 sm:grid-cols-2">
        <Card className="border-border/60">
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <Receipt className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Payout terms</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              License revenue is held until the order is marked delivered
              and the 14-day dispute window closes.
            </p>
            <p>
              Payouts run monthly once your unpaid balance crosses{" "}
              <strong className="text-foreground">$50</strong>. Smaller
              balances roll forward.
            </p>
            <p>
              Refunds, chargebacks, and policy violations may withhold or
              reverse a pending payout — see the{" "}
              <Link href="/terms" className="text-primary underline">
                Terms
              </Link>
              .
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <Factory className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Supported categories</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              We currently support consumer goods, mechanical parts,
              electronics enclosures, apparel, and replacement parts.
            </p>
            <p>
              Categories that need certifications (medical, food contact,
              children's products) require evidence on the listing. The full
              prohibited list lives in the{" "}
              <Link href="/acceptable-use" className="text-primary underline">
                Acceptable Use Policy
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="container max-w-5xl mx-auto px-6 py-16 text-center">
        <Shield className="h-8 w-8 mx-auto text-primary mb-3" />
        <h2 className="text-2xl font-bold tracking-tight">
          No surprises in the small print.
        </h2>
        <p className="text-muted-foreground mt-2 max-w-xl mx-auto">
          Read the{" "}
          <Link href="/terms" className="text-primary underline">
            Terms of Service
          </Link>
          ,{" "}
          <Link href="/privacy" className="text-primary underline">
            Privacy Policy
          </Link>
          , and{" "}
          <Link href="/acceptable-use" className="text-primary underline">
            Acceptable Use Policy
          </Link>
          . Have a question?{" "}
          <Link href="/contact" className="text-primary underline">
            Contact us
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
