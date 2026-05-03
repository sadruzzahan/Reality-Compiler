import { useState } from "react";
import { Factory, MapPin, Star, Layers, Clock, ShieldCheck } from "lucide-react";
import { useListSuppliers, type Supplier } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePublicPageHead } from "@/lib/seo-defaults";

const CAPABILITY_BUCKETS: { label: string; value: string | null }[] = [
  { label: "All", value: null },
  { label: "CNC", value: "CNC" },
  { label: "3D Printing", value: "3D Printing" },
  { label: "Laser", value: "Laser" },
  { label: "Injection Molding", value: "Injection Molding" },
  { label: "PCB", value: "PCB" },
  { label: "Textile", value: "Textile" },
  { label: "Wood", value: "Wood" },
];

function capacityVariant(level: Supplier["capacityLevel"]) {
  switch (level) {
    case "high":
      return "default";
    case "medium":
      return "secondary";
    default:
      return "outline";
  }
}

export default function Suppliers() {
  usePublicPageHead(
    "Vetted suppliers — manufacturing partners on Reality Compiler",
    "Browse the contract manufacturers we've vetted for marketplace orders. Filter by capability (CNC, injection molding, sheet metal, electronics, soft goods) and lead time.",
  );

  const [capability, setCapability] = useState<string | null>(null);
  const { data: suppliers, isLoading } = useListSuppliers(
    capability ? { capability } : {},
  );

  return (
    <div className="flex-1 overflow-auto bg-muted/10">
      <div className="container max-w-6xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight font-sans flex items-center gap-3">
            <Factory className="w-7 h-7 text-primary" />
            Manufacturing Network
          </h1>
          <p className="text-muted-foreground mt-2 font-mono text-sm">
            Vetted partners across processes, materials, and geographies. Filter to find a fabricator that matches your design.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 mb-8">
          {CAPABILITY_BUCKETS.map((bucket) => {
            const active = capability === bucket.value;
            return (
              <Button
                key={bucket.label}
                size="sm"
                variant={active ? "default" : "outline"}
                onClick={() => setCapability(bucket.value)}
                data-testid={`filter-capability-${bucket.label.toLowerCase().replace(/\s+/g, "-")}`}
                className="font-mono text-xs uppercase tracking-wide"
              >
                {bucket.label}
              </Button>
            );
          })}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-64 rounded-xl" />
            ))}
          </div>
        ) : !suppliers || suppliers.length === 0 ? (
          <div className="text-center py-24 border border-dashed rounded-xl bg-card">
            <Factory className="w-12 h-12 mx-auto text-muted-foreground mb-4 opacity-30" />
            <h3 className="text-xl font-medium">No suppliers match this filter</h3>
            <p className="text-muted-foreground mt-2 max-w-sm mx-auto font-mono text-sm">
              Try a different capability bucket or clear the filter.
            </p>
            <Button
              variant="outline"
              className="mt-6 font-mono"
              onClick={() => setCapability(null)}
              data-testid="button-clear-filter"
            >
              Clear filter
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {suppliers.map((s) => (
              <Card
                key={s.id}
                className="hover-elevate flex flex-col bg-card border-border/60 shadow-sm"
                data-testid={`card-supplier-${s.id}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-base font-bold truncate">{s.name}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.tagline}</p>
                    </div>
                    <Badge variant={capacityVariant(s.capacityLevel)} className="font-mono text-[10px] uppercase shrink-0">
                      {s.capacityLevel} cap
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground font-mono">
                    <MapPin className="w-3 h-3" />
                    <span>{s.location}, {s.country}</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 flex-1 flex flex-col">
                  <div className="flex flex-wrap gap-1.5">
                    {s.capabilities.slice(0, 5).map((c) => (
                      <Badge key={c} variant="outline" className="font-mono text-[10px] border-primary/30 text-primary bg-primary/5">
                        {c}
                      </Badge>
                    ))}
                    {s.capabilities.length > 5 && (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        +{s.capabilities.length - 5}
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/40 text-xs font-mono">
                    <div>
                      <div className="text-[9px] uppercase text-muted-foreground mb-1 flex items-center gap-1">
                        <Layers className="w-3 h-3" /> Materials
                      </div>
                      <div className="font-bold">{s.materials.length}</div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase text-muted-foreground mb-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Lead
                      </div>
                      <div className="font-bold">{s.leadTimeMinDays}–{s.leadTimeMaxDays}d</div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase text-muted-foreground mb-1 flex items-center gap-1">
                        <Star className="w-3 h-3" /> Rating
                      </div>
                      <div className="font-bold">{s.rating.toFixed(1)}</div>
                    </div>
                  </div>

                  {s.certifications.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-border/40">
                      <ShieldCheck className="w-3 h-3 text-muted-foreground shrink-0" />
                      {s.certifications.slice(0, 4).map((cert) => (
                        <span key={cert} className="font-mono text-[10px] text-muted-foreground uppercase">
                          {cert}
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
