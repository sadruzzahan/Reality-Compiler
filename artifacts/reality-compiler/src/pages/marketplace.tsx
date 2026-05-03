import { useState } from "react";
import { Link } from "wouter";
import { Store, TrendingUp, ArrowUpDown, Package } from "lucide-react";
import { useListMarketplaceListings } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { usePublicPageHead } from "@/lib/seo-defaults";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SORTS = [
  { value: "popular", label: "Most popular" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
] as const;

const CATEGORIES = [
  "All categories",
  "Mechanical",
  "Consumer",
  "Apparel",
  "Electronics",
  "Replacement Parts",
] as const;

export default function Marketplace() {
  usePublicPageHead(
    "Marketplace — AI-designed hardware, ready to ship",
    "Browse hundreds of AI-designed physical products published by independent creators. Every listing comes with a bill of materials, a vetted manufacturer quote, and a one-click order flow.",
  );
  const [sort, setSort] = useState<(typeof SORTS)[number]["value"]>("popular");
  const [category, setCategory] = useState<string>("All categories");
  const { data: listings, isLoading } = useListMarketplaceListings({
    sort,
    ...(category !== "All categories" ? { category } : {}),
  });

  return (
    <div className="flex-1 overflow-auto bg-muted/10">
      <div className="container max-w-6xl mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Store className="w-5 h-5 text-primary" />
              <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Design IP Marketplace
              </span>
            </div>
            <h1 className="text-4xl font-bold tracking-tight font-sans">
              Buy ready-to-manufacture designs
            </h1>
            <p className="text-muted-foreground mt-2 max-w-2xl">
              Compiled, costed, and supplier-routed. Order any design directly
              from a vetted manufacturing partner — the original creator gets
              attribution.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={category}
              onValueChange={(v) => setCategory(v)}
            >
              <SelectTrigger
                className="w-[200px] font-mono text-xs"
                data-testid="select-category"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem
                    key={c}
                    value={c}
                    className="font-mono text-xs"
                  >
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
            <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
              <SelectTrigger
                className="w-[200px] font-mono text-xs"
                data-testid="select-sort"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((s) => (
                  <SelectItem
                    key={s.value}
                    value={s.value}
                    className="font-mono text-xs"
                  >
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-72 rounded-xl" />
            ))}
          </div>
        ) : listings && listings.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {listings.map((l) => (
              <Link key={l.id} href={`/marketplace/${l.id}`}>
                <Card
                  className="h-full hover-elevate cursor-pointer transition-all border-border/60"
                  data-testid={`card-listing-${l.id}`}
                >
                  <div className="aspect-square bg-gradient-to-br from-primary/10 to-accent/10 rounded-t-xl flex items-center justify-center overflow-hidden">
                    {l.thumbnailUrl ? (
                      <img
                        src={l.thumbnailUrl}
                        alt={l.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Package className="w-16 h-16 text-primary/40" />
                    )}
                  </div>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-lg font-sans line-clamp-1">
                        {l.title}
                      </CardTitle>
                      <Badge variant="outline" className="font-mono text-xs shrink-0">
                        {l.category}
                      </Badge>
                    </div>
                    <CardDescription className="line-clamp-2 text-xs">
                      {l.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between pt-0">
                    <div className="flex items-center gap-2">
                      {l.creatorAvatarUrl ? (
                        <img
                          src={l.creatorAvatarUrl}
                          alt={l.creatorDisplayName ?? l.creatorHandle}
                          className="w-7 h-7 rounded-full object-cover border border-border/40"
                        />
                      ) : null}
                      <div className="flex flex-col">
                        {l.creatorDisplayName ? (
                          <span className="text-xs font-medium line-clamp-1">
                            {l.creatorDisplayName}
                          </span>
                        ) : null}
                        <span className="font-mono text-xs text-muted-foreground">
                          @{l.creatorHandle}
                        </span>
                        {l.orderCount > 0 && (
                          <span className="text-xs text-emerald-400 flex items-center gap-1 mt-0.5">
                            <TrendingUp className="w-3 h-3" />
                            {l.orderCount} order{l.orderCount === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-lg">
                        ${l.listingPrice.toLocaleString()}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">
                        license
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-16 text-center">
              <Store className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                No listings yet. Compile a design and publish it.
              </p>
              <Button className="mt-6 font-mono text-xs" asChild>
                <Link href="/">Compile a design</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
