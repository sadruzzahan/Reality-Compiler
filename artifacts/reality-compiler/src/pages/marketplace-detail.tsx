import { useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import {
  ArrowLeft,
  Package,
  TrendingUp,
  Loader2,
  ShoppingCart,
  Cpu,
  Ruler,
  DollarSign,
  Clock,
} from "lucide-react";
import { Show } from "@clerk/react";
import {
  useGetMarketplaceListing,
  usePlaceOrder,
  getGetMarketplaceListingQueryKey,
  getListOrdersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDocumentHead } from "@/hooks/use-document-head";

export default function MarketplaceDetail() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: listing, isLoading } = useGetMarketplaceListing(id);
  const placeOrder = usePlaceOrder();

  useDocumentHead(
    listing
      ? {
          title: `${listing.title} by @${listing.creatorHandle}`,
          description:
            listing.description.length > 160
              ? `${listing.description.slice(0, 157)}…`
              : listing.description,
          image: listing.designOutput.imageUrl ?? undefined,
          ogType: "product",
          jsonLd: {
            "@context": "https://schema.org",
            "@type": "Product",
            name: listing.title,
            description: listing.description,
            sku: `rc-listing-${listing.id}`,
            image: listing.designOutput.imageUrl
              ? [listing.designOutput.imageUrl]
              : undefined,
            category: listing.category,
            brand: {
              "@type": "Brand",
              name: `@${listing.creatorHandle}`,
            },
            material: listing.designOutput.primaryMaterial,
            offers: {
              "@type": "Offer",
              priceCurrency: "USD",
              price: listing.listingPrice.toFixed(2),
              availability: "https://schema.org/InStock",
            },
          },
        }
      : { title: "Marketplace listing", noIndex: true },
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedQuoteId, setSelectedQuoteId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState("100");
  const [recipient, setRecipient] = useState("");
  const [line1, setLine1] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("US");

  const handleStartOrder = () => {
    if (!listing) return;
    setSelectedQuoteId(listing.quotes[0]?.id ?? null);
    setDialogOpen(true);
  };

  const handlePlaceOrder = async () => {
    if (!listing || !selectedQuoteId) return;
    try {
      const order = await placeOrder.mutateAsync({
        data: {
          quoteId: selectedQuoteId,
          quantity: Number(quantity),
          marketplaceListingId: listing.id,
          shippingAddress: {
            recipient,
            line1,
            city,
            region,
            postalCode,
            country,
          },
        },
      });
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      queryClient.invalidateQueries({
        queryKey: getGetMarketplaceListingQueryKey(listing.id),
      });
      toast({
        title: "Order placed",
        description: `Order #${order.id} queued with ${order.supplier.name}`,
      });
      setDialogOpen(false);
      setLocation(`/orders/${order.id}`);
    } catch (e) {
      toast({
        title: "Couldn't place order",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="container max-w-5xl mx-auto px-6 py-12">
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="container max-w-5xl mx-auto px-6 py-12">
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">Listing not found.</p>
            <Button asChild className="mt-4">
              <Link href="/marketplace">Back to marketplace</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const out = listing.designOutput;
  const sortedQuotes = listing.quotes;
  const creatorShare = Math.round(listing.listingPrice * 0.7 * 100) / 100;
  const platformShare = Math.round(listing.listingPrice * 0.3 * 100) / 100;

  return (
    <div className="flex-1 overflow-auto bg-muted/10">
      <div className="container max-w-6xl mx-auto px-6 py-10">
        <Button
          variant="ghost"
          size="sm"
          className="mb-6 font-mono text-xs"
          onClick={() => setLocation("/marketplace")}
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to marketplace
        </Button>

        <div className="grid lg:grid-cols-2 gap-8">
          <div>
            <div className="aspect-square bg-gradient-to-br from-primary/10 to-accent/10 rounded-2xl flex items-center justify-center overflow-hidden border border-border/60">
              {out.imageUrl ? (
                <img
                  src={out.imageUrl}
                  alt={listing.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Package className="w-32 h-32 text-primary/30" />
              )}
            </div>
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="font-mono text-xs">
                {listing.category}
              </Badge>
              {listing.orderCount > 0 && (
                <Badge variant="secondary" className="font-mono text-xs">
                  <TrendingUp className="w-3 h-3 mr-1" />
                  {listing.orderCount} ordered
                </Badge>
              )}
            </div>
            <h1 className="text-3xl font-bold tracking-tight font-sans">
              {listing.title}
            </h1>
            <Link
              href={`/designers/${listing.userId}`}
              className="text-sm text-primary hover:underline font-mono mt-1"
              data-testid="link-designer"
            >
              by @{listing.creatorHandle}
            </Link>
            <p className="text-muted-foreground mt-4">{listing.description}</p>

            <div className="mt-6 p-4 rounded-xl bg-card border border-border/60">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold font-mono">
                  ${listing.listingPrice.toLocaleString()}
                </span>
                <span className="text-sm text-muted-foreground font-mono">
                  / license, manufacturing extra
                </span>
              </div>
              <div
                className="mt-3 grid grid-cols-2 gap-2 text-xs font-mono"
                data-testid="revenue-split"
              >
                <div className="rounded-md border border-border/40 bg-muted/30 p-2">
                  <div className="text-muted-foreground uppercase tracking-wider">
                    Creator (70%)
                  </div>
                  <div className="font-bold text-foreground">
                    ${creatorShare.toLocaleString()}
                  </div>
                </div>
                <div className="rounded-md border border-border/40 bg-muted/30 p-2">
                  <div className="text-muted-foreground uppercase tracking-wider">
                    Platform (30%)
                  </div>
                  <div className="font-bold text-foreground">
                    ${platformShare.toLocaleString()}
                  </div>
                </div>
              </div>
              <Show when="signed-in">
                <Button
                  size="lg"
                  className="w-full mt-4 font-mono"
                  onClick={handleStartOrder}
                  disabled={sortedQuotes.length === 0}
                  data-testid="button-order-design"
                >
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Order this design
                </Button>
              </Show>
              <Show when="signed-out">
                <Button size="lg" className="w-full mt-4 font-mono" asChild>
                  <Link href="/sign-in" data-testid="button-sign-in-to-order">
                    Sign in to order
                  </Link>
                </Button>
              </Show>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-6">
              <DetailStat
                icon={Cpu}
                label="Material"
                value={out.primaryMaterial}
              />
              <DetailStat icon={Ruler} label="Dimensions" value={out.dimensions} />
              <DetailStat
                icon={DollarSign}
                label="Unit cost est."
                value={`$${out.costEstimate.low}–$${out.costEstimate.high}`}
              />
              <DetailStat
                icon={Clock}
                label="Lead time"
                value={`${out.costEstimate.leadTimeDays} days`}
              />
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mt-10">
          <Card>
            <CardHeader>
              <CardTitle className="font-mono text-sm">Bill of materials</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {out.bom.map((b, i) => (
                <div
                  key={i}
                  className="flex justify-between text-sm border-b border-border/40 pb-2 last:border-0"
                >
                  <div>
                    <div className="font-medium">{b.component}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {b.material} · {b.quantity} {b.unit}
                    </div>
                  </div>
                  <div className="font-mono">${b.totalCost.toFixed(2)}</div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="font-mono text-sm">
                Manufacturing notes
              </CardTitle>
              <CardDescription className="text-xs">
                Processes: {out.processes.join(" → ")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {out.manufacturingNotes}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Order {listing.title}</DialogTitle>
            <DialogDescription className="font-mono text-xs">
              Pick a manufacturer and ship it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            <div>
              <Label className="font-mono text-xs uppercase tracking-wider">
                Manufacturer
              </Label>
              <div className="space-y-2 mt-2">
                {sortedQuotes.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setSelectedQuoteId(q.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedQuoteId === q.id
                        ? "border-primary bg-primary/5"
                        : "border-border/60 hover:border-border"
                    }`}
                    data-testid={`button-quote-${q.id}`}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <div className="font-semibold text-sm">
                          {q.supplier.name}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {q.supplier.location} · {q.leadTimeDays}d lead time
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-bold">
                          ${q.unitCost.toFixed(2)}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          /unit
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="qty" className="font-mono text-xs uppercase">
                Quantity
              </Label>
              <Input
                id="qty"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                data-testid="input-quantity"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="font-mono text-xs uppercase">Recipient</Label>
                <Input
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  data-testid="input-recipient"
                />
              </div>
              <div className="col-span-2">
                <Label className="font-mono text-xs uppercase">Address</Label>
                <Input
                  value={line1}
                  onChange={(e) => setLine1(e.target.value)}
                  data-testid="input-line1"
                />
              </div>
              <div>
                <Label className="font-mono text-xs uppercase">City</Label>
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  data-testid="input-city"
                />
              </div>
              <div>
                <Label className="font-mono text-xs uppercase">Region</Label>
                <Input
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  data-testid="input-region"
                />
              </div>
              <div>
                <Label className="font-mono text-xs uppercase">Postal</Label>
                <Input
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  data-testid="input-postal"
                />
              </div>
              <div>
                <Label className="font-mono text-xs uppercase">Country</Label>
                <Input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  data-testid="input-country"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="font-mono text-xs"
            >
              Cancel
            </Button>
            <Button
              onClick={handlePlaceOrder}
              disabled={
                placeOrder.isPending ||
                !selectedQuoteId ||
                !recipient ||
                !line1 ||
                !city ||
                !region ||
                !postalCode
              }
              className="font-mono text-xs"
              data-testid="button-place-order"
            >
              {placeOrder.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Place order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="p-3 rounded-lg bg-card border border-border/40">
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono uppercase tracking-wider">
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <div className="font-mono text-sm mt-1">{value}</div>
    </div>
  );
}
