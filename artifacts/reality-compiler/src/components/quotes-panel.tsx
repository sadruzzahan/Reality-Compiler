import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  Factory, Loader2, MapPin, Star, Sparkles, RefreshCw,
  DollarSign, Clock, Send,
} from "lucide-react";
import {
  useListQuotes,
  useGenerateQuotes,
  usePlaceOrder,
  getListQuotesQueryKey,
  getListOrdersQueryKey,
  type Quote,
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

interface QuotesPanelProps {
  sessionId: number;
}

export function QuotesPanel({ sessionId }: QuotesPanelProps) {
  const queryClient = useQueryClient();

  const { data: quotes, isLoading } = useListQuotes(sessionId, {
    query: { enabled: !!sessionId, queryKey: getListQuotesQueryKey(sessionId) },
  });

  const generateQuotes = useGenerateQuotes({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey(sessionId) });
      },
    },
  });

  const [orderQuote, setOrderQuote] = useState<Quote | null>(null);
  const hasQuotes = !!quotes && quotes.length > 0;

  return (
    <section className="border-t border-border/60 bg-muted/20">
      <div className="p-6 md:p-8 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold tracking-tight font-sans flex items-center gap-2">
              <Factory className="w-5 h-5 text-primary" />
              Manufacturing Quotes
            </h2>
            <p className="text-xs text-muted-foreground font-mono mt-1 uppercase tracking-wide">
              Vetted suppliers ranked for this design
            </p>
          </div>
          {hasQuotes && (
            <Button
              size="sm"
              variant="outline"
              className="font-mono text-xs"
              disabled={generateQuotes.isPending}
              onClick={() => generateQuotes.mutate({ id: sessionId })}
              data-testid="button-regenerate-quotes"
            >
              {generateQuotes.isPending ? (
                <Loader2 className="w-3 h-3 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3 mr-2" />
              )}
              Regenerate
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-56 rounded-xl" />)}
          </div>
        ) : !hasQuotes ? (
          <Card className="bg-card border-dashed border-border shadow-none">
            <CardContent className="py-10 flex flex-col items-center text-center">
              <Sparkles className="w-10 h-10 text-primary/40 mb-4" />
              <h3 className="font-medium text-base">No quotes yet</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm font-mono">
                Source competitive bids from the manufacturing network for this design.
              </p>
              <Button
                className="mt-5 font-mono"
                disabled={generateQuotes.isPending}
                onClick={() => generateQuotes.mutate({ id: sessionId })}
                data-testid="button-generate-quotes"
              >
                {generateQuotes.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sourcing quotes…
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Get Manufacturing Quotes
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {quotes!.map((quote) => (
              <QuoteCard
                key={quote.id}
                quote={quote}
                onPlaceOrder={() => setOrderQuote(quote)}
              />
            ))}
          </div>
        )}
      </div>

      {orderQuote && (
        <PlaceOrderDialog
          quote={orderQuote}
          open={!!orderQuote}
          onOpenChange={(open) => { if (!open) setOrderQuote(null); }}
        />
      )}
    </section>
  );
}

function QuoteCard({ quote, onPlaceOrder }: { quote: Quote; onPlaceOrder: () => void }) {
  const matchPct = Math.round(quote.scoreFactors.total * 100);
  return (
    <Card className="bg-card shadow-sm border-border/60 flex flex-col" data-testid={`card-quote-${quote.rank}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <Badge
            variant={quote.rank === 1 ? "default" : "secondary"}
            className="font-mono text-[10px] uppercase tracking-wide"
          >
            Rank #{quote.rank}
          </Badge>
          <span className="text-[10px] font-mono uppercase text-muted-foreground flex items-center gap-1">
            <Star className="w-3 h-3 text-primary" /> Match: {matchPct}%
          </span>
        </div>
        <CardTitle className="text-base truncate">{quote.supplier.name}</CardTitle>
        <p className="text-[11px] text-muted-foreground font-mono flex items-center gap-1">
          <MapPin className="w-3 h-3" /> {quote.supplier.location}, {quote.supplier.country}
        </p>
      </CardHeader>
      <CardContent className="space-y-3 flex-1 flex flex-col">
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          <div className="bg-muted/40 rounded p-2">
            <div className="text-[9px] uppercase text-muted-foreground mb-0.5">Unit cost</div>
            <div className="font-bold text-sm">${quote.unitCost.toFixed(2)}</div>
          </div>
          <div className="bg-muted/40 rounded p-2">
            <div className="text-[9px] uppercase text-muted-foreground mb-0.5">Setup fee</div>
            <div className="font-bold text-sm">${quote.setupFee.toFixed(2)}</div>
          </div>
          <div className="bg-primary/10 rounded p-2 col-span-2">
            <div className="text-[9px] uppercase text-primary/80 mb-0.5">Total (1 unit + setup)</div>
            <div className="font-bold text-base text-primary">${quote.totalCost.toFixed(2)}</div>
          </div>
        </div>
        <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> {quote.leadTimeDays} days
          </span>
          <span className="flex items-center gap-1">
            <Star className="w-3 h-3" /> {quote.supplier.rating.toFixed(1)}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {quote.supplier.capabilities.slice(0, 3).map((c) => (
            <Badge key={c} variant="outline" className="font-mono text-[9px] border-primary/30 text-primary bg-primary/5">
              {c}
            </Badge>
          ))}
        </div>
        <div className="flex-1" />
        <Button
          size="sm"
          className="w-full font-mono text-xs mt-2"
          onClick={onPlaceOrder}
          data-testid={`button-place-order-${quote.rank}`}
        >
          <DollarSign className="w-3 h-3 mr-1" /> Place Order
        </Button>
      </CardContent>
    </Card>
  );
}

function PlaceOrderDialog({
  quote, open, onOpenChange,
}: {
  quote: Quote;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [quantity, setQuantity] = useState(1);
  const [recipient, setRecipient] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("");

  const placeOrder = usePlaceOrder({
    mutation: {
      onSuccess: (order) => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        onOpenChange(false);
        setLocation(`/orders/${order.id}`);
      },
    },
  });

  const total = quote.unitCost * quantity + quote.setupFee;
  const canSubmit =
    recipient.trim() && line1.trim() && city.trim() && region.trim() &&
    postalCode.trim() && country.trim() && quantity > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    placeOrder.mutate({
      data: {
        quoteId: quote.id,
        quantity,
        shippingAddress: {
          recipient,
          line1,
          line2: line2 || null,
          city,
          region,
          postalCode,
          country,
        },
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-sans">Place Order with {quote.supplier.name}</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            Confirm shipping details and quantity to lock in this manufacturing run.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="quantity" className="font-mono text-xs uppercase">Quantity</Label>
            <Input
              id="quantity"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value || "1", 10)))}
              data-testid="input-order-quantity"
            />
          </div>

          <Separator />
          <div className="text-[11px] font-mono uppercase text-muted-foreground tracking-wide">
            Shipping Address
          </div>

          <div className="space-y-2">
            <Label htmlFor="recipient" className="font-mono text-xs uppercase">Recipient</Label>
            <Input id="recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)} data-testid="input-recipient" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="line1" className="font-mono text-xs uppercase">Address line 1</Label>
            <Input id="line1" value={line1} onChange={(e) => setLine1(e.target.value)} data-testid="input-line1" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="line2" className="font-mono text-xs uppercase">Address line 2 (optional)</Label>
            <Input id="line2" value={line2} onChange={(e) => setLine2(e.target.value)} data-testid="input-line2" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="city" className="font-mono text-xs uppercase">City</Label>
              <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} data-testid="input-city" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="region" className="font-mono text-xs uppercase">Region / State</Label>
              <Input id="region" value={region} onChange={(e) => setRegion(e.target.value)} data-testid="input-region" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postalCode" className="font-mono text-xs uppercase">Postal code</Label>
              <Input id="postalCode" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} data-testid="input-postal" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country" className="font-mono text-xs uppercase">Country</Label>
              <Input id="country" value={country} onChange={(e) => setCountry(e.target.value)} data-testid="input-country" />
            </div>
          </div>

          <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-1 font-mono">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{quantity} × ${quote.unitCost.toFixed(2)}</span>
              <span>${(quote.unitCost * quantity).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Setup fee</span>
              <span>${quote.setupFee.toFixed(2)}</span>
            </div>
            <Separator className="my-1" />
            <div className="flex justify-between font-bold text-primary">
              <span>Total</span>
              <span data-testid="text-order-total">${total.toFixed(2)}</span>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit || placeOrder.isPending}
              data-testid="button-confirm-order"
            >
              {placeOrder.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Placing…</>
              ) : (
                "Confirm Order"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
