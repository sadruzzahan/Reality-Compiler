import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  Store,
  TrendingUp,
  ArrowUpDown,
  Package,
  Search,
  X,
  Loader2,
} from "lucide-react";
import {
  listMarketplaceListings,
  getListMarketplaceListingsQueryKey,
  getCountMarketplaceListingsQueryKey,
  useCountMarketplaceListings,
  type ListMarketplaceListingsParams,
  type MarketplaceListingsPage,
  type MarketplaceListingSummary,
  type ListMarketplaceListingsSort,
} from "@workspace/api-client-react";
import { useInfiniteQuery } from "@tanstack/react-query";
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
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { usePublicPageHead } from "@/lib/seo-defaults";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SORTS: { value: ListMarketplaceListingsSort; label: string }[] = [
  { value: "popular", label: "Most popular" },
  { value: "recent", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
];

const CATEGORIES = [
  "Mechanical",
  "Consumer",
  "Apparel",
  "Electronics",
  "Replacement Parts",
] as const;

const PAGE_SIZE = 24;
const PRICE_FLOOR = 0;
const PRICE_CEILING = 5000;
const PRICE_STEP = 25;

function parseCategorySet(raw: string): Set<string> {
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function serializeCategorySet(set: Set<string>): string {
  // Stable order matches CATEGORIES so URLs are deterministic.
  return CATEGORIES.filter((c) => set.has(c)).join(",");
}

function parseFinitePrice(raw: string): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

interface FilterState {
  q: string;
  category: string;
  minPrice: string;
  maxPrice: string;
  sort: ListMarketplaceListingsSort;
  creator: string;
}

function readFilters(search: string): FilterState {
  const sp = new URLSearchParams(search);
  const sortRaw = sp.get("sort") ?? "popular";
  const sort = SORTS.some((s) => s.value === sortRaw)
    ? (sortRaw as ListMarketplaceListingsSort)
    : "popular";
  return {
    q: sp.get("q") ?? "",
    category: sp.get("category") ?? "",
    minPrice: sp.get("minPrice") ?? "",
    maxPrice: sp.get("maxPrice") ?? "",
    sort,
    creator: sp.get("creator") ?? "",
  };
}

function writeFilters(f: FilterState): string {
  const sp = new URLSearchParams();
  if (f.q) sp.set("q", f.q);
  if (f.category) sp.set("category", f.category);
  if (f.minPrice) sp.set("minPrice", f.minPrice);
  if (f.maxPrice) sp.set("maxPrice", f.maxPrice);
  if (f.sort && f.sort !== "popular") sp.set("sort", f.sort);
  if (f.creator) sp.set("creator", f.creator);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

function toApiParams(
  f: FilterState,
  cursor?: string,
): ListMarketplaceListingsParams {
  const params: ListMarketplaceListingsParams = {
    sort: f.sort,
    limit: PAGE_SIZE,
  };
  if (f.q.trim()) params.q = f.q.trim();
  if (f.category) params.category = f.category;
  const min = parseFinitePrice(f.minPrice);
  const max = parseFinitePrice(f.maxPrice);
  if (min !== undefined) params.minPrice = min;
  if (max !== undefined) params.maxPrice = max;
  if (f.creator) params.creator = f.creator;
  if (cursor) params.cursor = cursor;
  return params;
}

/**
 * Marketplace listing grid. URL is the source of truth for every filter
 * — the search input is debounced (300ms) into the URL, and changing
 * any filter resets pagination. Pagination uses cursor-based infinite
 * scroll via an IntersectionObserver sentinel.
 */
export default function Marketplace() {
  usePublicPageHead(
    "Marketplace — AI-designed hardware, ready to ship",
    "Browse hundreds of AI-designed physical products published by independent creators. Every listing comes with a bill of materials, a vetted manufacturer quote, and a one-click order flow.",
  );

  const search = useSearch();
  const [, setLocation] = useLocation();
  const filters = useMemo(() => readFilters(search), [search]);

  // Local input state for the search box so typing feels instant; the
  // committed value lives in the URL after a 300ms debounce.
  const [searchInput, setSearchInput] = useState(filters.q);
  useEffect(() => {
    // Sync external URL changes (back button, copy/paste link) into the
    // input without clobbering an in-flight edit.
    setSearchInput(filters.q);
    // We intentionally only react to URL-side `q` changes here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.q]);

  const updateFilters = useCallback(
    (patch: Partial<FilterState>) => {
      const next: FilterState = { ...filters, ...patch };
      setLocation(`/marketplace${writeFilters(next)}`, { replace: true });
    },
    [filters, setLocation],
  );

  // Debounce the search input → URL.
  useEffect(() => {
    if (searchInput === filters.q) return;
    const id = window.setTimeout(() => {
      updateFilters({ q: searchInput });
    }, 300);
    return () => window.clearTimeout(id);
  }, [searchInput, filters.q, updateFilters]);

  const baseParams = toApiParams(filters);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
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
      listMarketplaceListings(toApiParams(filters, pageParam), { signal }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const items: MarketplaceListingSummary[] = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data],
  );

  // Total count for "Showing X of Y" — only fetched when filters are set.
  const hasAnyFilter =
    !!filters.q ||
    !!filters.category ||
    !!filters.minPrice ||
    !!filters.maxPrice ||
    !!filters.creator;
  const countMin = parseFinitePrice(filters.minPrice);
  const countMax = parseFinitePrice(filters.maxPrice);
  const countParams = {
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(countMin !== undefined ? { minPrice: countMin } : {}),
    ...(countMax !== undefined ? { maxPrice: countMax } : {}),
    ...(filters.creator ? { creator: filters.creator } : {}),
  };
  const { data: countData } = useCountMarketplaceListings(countParams, {
    query: {
      enabled: hasAnyFilter,
      queryKey: getCountMarketplaceListingsQueryKey(countParams),
    },
  });

  // IntersectionObserver sentinel for infinite scroll.
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

  const clearFilters = () => {
    setSearchInput("");
    setLocation("/marketplace", { replace: true });
  };

  return (
    <div className="flex-1 overflow-auto bg-muted/10">
      <div className="container max-w-6xl mx-auto px-6 py-12">
        <div className="flex flex-col gap-6 mb-8">
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
          <div className="relative max-w-xl">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by title, material, or category…"
              className="pl-9 pr-9 h-11 font-mono text-sm"
              data-testid="input-marketplace-search"
              aria-label="Search marketplace listings"
            />
            {searchInput ? (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
                data-testid="button-clear-search"
              >
                <X className="w-4 h-4" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="grid lg:grid-cols-[220px_1fr] gap-8">
          <aside
            className="space-y-6 lg:sticky lg:top-6 self-start"
            aria-label="Marketplace filters"
          >
            <FilterSection title="Sort">
              <ArrowUpDown
                className="w-3.5 h-3.5 text-muted-foreground absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden
              />
              <Select
                value={filters.sort}
                onValueChange={(v) =>
                  updateFilters({ sort: v as ListMarketplaceListingsSort })
                }
              >
                <SelectTrigger
                  className="font-mono text-xs"
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
            </FilterSection>

            <FilterSection title="Categories">
              <div
                role="group"
                aria-label="Filter by category"
                data-testid="group-category"
                className="space-y-1.5"
              >
                {CATEGORIES.map((c) => {
                  const selected = parseCategorySet(filters.category);
                  const isChecked = selected.has(c);
                  const id = `cat-${c.replace(/\s+/g, "-").toLowerCase()}`;
                  return (
                    <label
                      key={c}
                      htmlFor={id}
                      className="flex items-center gap-2 cursor-pointer select-none rounded px-1 py-0.5 hover:bg-muted/40"
                    >
                      <Checkbox
                        id={id}
                        checked={isChecked}
                        data-testid={`checkbox-category-${c.replace(/\s+/g, "-").toLowerCase()}`}
                        onCheckedChange={(next) => {
                          const set = parseCategorySet(filters.category);
                          if (next === true) set.add(c);
                          else set.delete(c);
                          updateFilters({
                            category: serializeCategorySet(set),
                          });
                        }}
                      />
                      <span className="font-mono text-xs">{c}</span>
                    </label>
                  );
                })}
              </div>
            </FilterSection>

            <FilterSection title="Price (USD)">
              <PriceRangeFilter
                minRaw={filters.minPrice}
                maxRaw={filters.maxPrice}
                onCommit={(min, max) =>
                  updateFilters({
                    minPrice: min === PRICE_FLOOR ? "" : String(min),
                    maxPrice: max >= PRICE_CEILING ? "" : String(max),
                  })
                }
              />
            </FilterSection>

            {filters.creator ? (
              <FilterSection title="Creator">
                <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1.5">
                  <span
                    className="font-mono text-xs truncate"
                    data-testid="text-creator-filter"
                  >
                    @{filters.creator.replace(/^@/, "")}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateFilters({ creator: "" })}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Clear creator filter"
                    data-testid="button-clear-creator"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </FilterSection>
            ) : null}

            {hasAnyFilter ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full font-mono text-xs"
                onClick={clearFilters}
                data-testid="button-clear-filters"
              >
                Clear all filters
              </Button>
            ) : null}
          </aside>

          <section aria-label="Marketplace listings">
            {hasAnyFilter && countData ? (
              <p
                className="font-mono text-xs text-muted-foreground mb-4"
                data-testid="text-results-count"
              >
                {countData.total === 0
                  ? "No matches"
                  : `${countData.total} listing${countData.total === 1 ? "" : "s"} match`}
              </p>
            ) : null}

            {isError ? (
              <Card>
                <CardContent
                  className="py-12 text-center"
                  data-testid="state-error"
                >
                  <p className="text-sm text-destructive font-mono mb-3">
                    Couldn't load listings.
                  </p>
                  <p className="text-xs text-muted-foreground mb-6">
                    {error?.message ?? "Network error"}
                  </p>
                  <Button
                    size="sm"
                    onClick={() => void refetch()}
                    className="font-mono text-xs"
                    data-testid="button-retry"
                  >
                    Try again
                  </Button>
                </CardContent>
              </Card>
            ) : isLoading ? (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    className="h-72 rounded-xl"
                    data-testid="skeleton-listing"
                  />
                ))}
              </div>
            ) : items.length === 0 ? (
              hasAnyFilter ? (
                <Card>
                  <CardContent
                    className="py-16 text-center"
                    data-testid="state-no-matches"
                  >
                    <Search className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-2">
                      No listings match your filters.
                    </p>
                    <p className="text-xs text-muted-foreground font-mono mb-6">
                      Try a broader search or clear some filters.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearFilters}
                      className="font-mono text-xs"
                      data-testid="button-clear-from-empty"
                    >
                      Clear filters
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent
                    className="py-16 text-center"
                    data-testid="state-empty"
                  >
                    <Store className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">
                      No listings yet. Compile a design and publish it.
                    </p>
                    <Button className="mt-6 font-mono text-xs" asChild>
                      <Link href="/">Compile a design</Link>
                    </Button>
                  </CardContent>
                </Card>
              )
            ) : (
              <>
                <div
                  className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5"
                  data-testid="grid-listings"
                >
                  {items.map((l) => (
                    <ListingCard key={l.id} listing={l} />
                  ))}
                </div>
                <div
                  ref={sentinelRef}
                  className="h-12 mt-6 flex items-center justify-center"
                  data-testid="sentinel-load-more"
                >
                  {isFetchingNextPage ? (
                    <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Loading more…
                    </span>
                  ) : !hasNextPage && items.length >= PAGE_SIZE ? (
                    <span className="font-mono text-xs text-muted-foreground">
                      End of results
                    </span>
                  ) : null}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/**
 * Two-thumb price range filter. The slider is the primary control —
 * dragging is local and only commits to the URL on release so we avoid
 * spamming the API mid-drag. Numeric labels reflect the live value.
 *
 * `minRaw === ""` and `maxRaw === ""` represent "no bound", which we
 * map to PRICE_FLOOR and PRICE_CEILING for the slider thumbs.
 */
function PriceRangeFilter({
  minRaw,
  maxRaw,
  onCommit,
}: {
  minRaw: string;
  maxRaw: string;
  onCommit: (min: number, max: number) => void;
}) {
  const initial = useMemo<[number, number]>(() => {
    const min = parseFinitePrice(minRaw) ?? PRICE_FLOOR;
    const max = parseFinitePrice(maxRaw) ?? PRICE_CEILING;
    return [
      Math.max(PRICE_FLOOR, Math.min(min, PRICE_CEILING)),
      Math.max(PRICE_FLOOR, Math.min(max, PRICE_CEILING)),
    ];
  }, [minRaw, maxRaw]);
  const [draft, setDraft] = useState<[number, number]>(initial);

  // Re-sync when URL state changes externally (e.g. clear filters,
  // back button) and the user isn't actively dragging.
  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  const [lo, hi] = draft;
  const minLabel = lo === PRICE_FLOOR ? "$0" : `$${lo.toLocaleString()}`;
  const maxLabel =
    hi >= PRICE_CEILING
      ? `$${PRICE_CEILING.toLocaleString()}+`
      : `$${hi.toLocaleString()}`;

  return (
    <div className="space-y-3" data-testid="price-range-filter">
      <Slider
        min={PRICE_FLOOR}
        max={PRICE_CEILING}
        step={PRICE_STEP}
        value={draft}
        onValueChange={(v) => {
          if (v.length >= 2) setDraft([v[0]!, v[1]!]);
        }}
        onValueCommit={(v) => {
          if (v.length >= 2) onCommit(v[0]!, v[1]!);
        }}
        aria-label="Price range"
        data-testid="slider-price-range"
        className="py-2"
      />
      <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
        <span data-testid="text-min-price">{minLabel}</span>
        <span data-testid="text-max-price">{maxLabel}</span>
      </div>
    </div>
  );
}

function FilterSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
        {title}
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

function ListingCard({ listing: l }: { listing: MarketplaceListingSummary }) {
  return (
    <Link href={`/marketplace/${l.id}`}>
      <Card
        className="h-full hover-elevate cursor-pointer transition-all border-border/60"
        data-testid={`card-listing-${l.id}`}
      >
        <div className="aspect-square bg-gradient-to-br from-primary/10 to-accent/10 rounded-t-xl flex items-center justify-center overflow-hidden">
          {l.thumbnailUrl ? (
            <img
              src={l.thumbnailUrl}
              alt={l.title}
              loading="lazy"
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
                loading="lazy"
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
  );
}
