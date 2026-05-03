import { useEffect, useMemo, useRef } from "react";
import { Link, useParams } from "wouter";
import { User, Package, TrendingUp, Store, Loader2 } from "lucide-react";
import {
  useGetDesignerProfile,
  listMarketplaceListings,
  getListMarketplaceListingsQueryKey,
  type ListMarketplaceListingsParams,
  type MarketplaceListingsPage,
  type MarketplaceListingSummary,
} from "@workspace/api-client-react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentHead } from "@/hooks/use-document-head";

const PAGE_SIZE = 24;

export default function DesignerProfile() {
  const params = useParams();
  const userId = params.userId!;
  const { data, isLoading } = useGetDesignerProfile(userId);

  // Listings come from the same paginated endpoint as the marketplace
  // grid, scoped to this creator. This means infinite scroll, ordering,
  // and image hydration logic stay in one place.
  const baseParams: ListMarketplaceListingsParams = useMemo(
    () => ({ creator: userId, sort: "recent", limit: PAGE_SIZE }),
    [userId],
  );
  const {
    data: pages,
    isLoading: isListingsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<
    MarketplaceListingsPage,
    Error,
    { pages: MarketplaceListingsPage[]; pageParams: (string | undefined)[] },
    readonly unknown[],
    string | undefined
  >({
    queryKey: getListMarketplaceListingsQueryKey(baseParams),
    queryFn: ({ pageParam, signal }) =>
      listMarketplaceListings(
        { ...baseParams, ...(pageParam ? { cursor: pageParam } : {}) },
        { signal },
      ),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const listings: MarketplaceListingSummary[] = useMemo(
    () => pages?.pages.flatMap((p) => p.items) ?? [],
    [pages],
  );

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          hasNextPage &&
          !isFetchingNextPage
        ) {
          void fetchNextPage();
        }
      },
      { rootMargin: "400px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useDocumentHead(
    data
      ? {
          title: `${data.displayName ?? `@${data.handle}`} — designer on Reality Compiler`,
          description:
            data.bio?.slice(0, 200) ??
            `${data.displayName ?? `@${data.handle}`} has published ${data.totalListings} design${data.totalListings === 1 ? "" : "s"} on Reality Compiler.`,
          image: data.avatarUrl ?? undefined,
          ogType: "profile",
        }
      : { title: "Designer profile", noIndex: true },
  );

  if (isLoading) {
    return (
      <div className="container max-w-6xl mx-auto px-6 py-12">
        <Skeleton className="h-40 mb-6" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container max-w-6xl mx-auto px-6 py-12">
        <p className="text-muted-foreground">Designer not found.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-muted/10">
      <div className="container max-w-6xl mx-auto px-6 py-12">
        <Card className="mb-8 border-border/60">
          <CardContent className="pt-8 pb-6">
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center overflow-hidden">
                {data.avatarUrl ? (
                  <img
                    src={data.avatarUrl}
                    alt={data.displayName ?? data.handle}
                    className="w-full h-full object-cover"
                    data-testid="img-designer-avatar"
                  />
                ) : (
                  <User className="w-10 h-10 text-primary" />
                )}
              </div>
              <div className="flex-1">
                <h1
                  className="text-3xl font-bold font-sans"
                  data-testid="text-designer-name"
                >
                  {data.displayName ?? `@${data.handle}`}
                </h1>
                <p className="text-muted-foreground mt-1 font-mono text-sm">
                  {data.displayName ? `@${data.handle} · ` : ""}Designer ·
                  Reality Compiler studio
                </p>
                {data.bio ? (
                  <p
                    className="mt-3 text-sm text-foreground/80 max-w-2xl whitespace-pre-line"
                    data-testid="text-designer-bio"
                  >
                    {data.bio}
                  </p>
                ) : null}
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold font-mono">
                    {data.totalListings}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                    Designs
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold font-mono text-emerald-400">
                    {data.totalOrders}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                    Orders
                  </div>
                </div>
                <div>
                  <div
                    className="text-2xl font-bold font-mono text-primary"
                    data-testid="text-designer-total-payouts"
                  >
                    ${data.totalPayouts.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                    Earned
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center gap-2 mb-4">
          <Store className="w-4 h-4 text-primary" />
          <h2 className="font-mono text-sm uppercase tracking-widest">
            Published designs
          </h2>
        </div>

        {isListingsLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-72 rounded-xl" />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No published designs yet.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {listings.map((l) => (
                <Link key={l.id} href={`/marketplace/${l.id}`}>
                  <Card
                    className="h-full hover-elevate cursor-pointer"
                    data-testid={`card-designer-listing-${l.id}`}
                  >
                    <div className="aspect-square bg-gradient-to-br from-primary/10 to-accent/10 rounded-t-xl flex items-center justify-center">
                      {l.thumbnailUrl ? (
                        <img
                          src={l.thumbnailUrl}
                          alt={l.title}
                          loading="lazy"
                          className="w-full h-full object-cover rounded-t-xl"
                        />
                      ) : (
                        <Package className="w-14 h-14 text-primary/40" />
                      )}
                    </div>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base font-sans line-clamp-1">
                          {l.title}
                        </CardTitle>
                        <Badge
                          variant="outline"
                          className="font-mono text-xs shrink-0"
                        >
                          {l.category}
                        </Badge>
                      </div>
                      <CardDescription className="line-clamp-2 text-xs">
                        {l.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between">
                      {l.orderCount > 0 ? (
                        <span className="text-xs text-emerald-400 flex items-center gap-1 font-mono">
                          <TrendingUp className="w-3 h-3" />
                          {l.orderCount}
                        </span>
                      ) : (
                        <span />
                      )}
                      <span className="font-mono font-bold">
                        ${l.listingPrice.toLocaleString()}
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
            <div
              ref={sentinelRef}
              className="h-12 mt-6 flex items-center justify-center"
            >
              {isFetchingNextPage ? (
                <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Loading more…
                </span>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
