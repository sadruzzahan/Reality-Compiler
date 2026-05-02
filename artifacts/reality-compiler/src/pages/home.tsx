import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Loader2, BarChart3, Package, Layers, Calendar, ChevronRight } from "lucide-react";
import { 
  useGetSessionStats, 
  useCreateSession, 
  getListSessionsQueryKey,
  getGetSessionStatsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  
  const { data: stats, isLoading: isStatsLoading } = useGetSessionStats();
  
  const createSession = useCreateSession({
    mutation: {
      onSuccess: (session) => {
        queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSessionStatsQueryKey() });
        setLocation(`/sessions/${session.id}`);
      }
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    createSession.mutate({ data: { prompt } });
  };

  return (
    <div className="flex-1 overflow-auto pb-12">
      {/* Hero Section */}
      <section className="bg-muted/30 border-b border-border/40 py-20 px-6 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, hsl(var(--primary)) 1px, transparent 0)', backgroundSize: '32px 32px' }} />
        
        <div className="container max-w-4xl mx-auto relative z-10">
          <div className="text-center mb-10">
            <Badge variant="outline" className="mb-4 bg-background px-3 py-1 font-mono text-xs text-primary border-primary/20">
              v1.0.0 Online
            </Badge>
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-4 font-sans">
              Compile reality from <span className="text-primary italic">plain text.</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Describe a physical product idea. Instantly generate concept art, materials list, manufacturing processes, and cost estimates.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="relative group max-w-3xl mx-auto">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary to-chart-2 rounded-xl blur opacity-30 group-hover:opacity-60 transition duration-500"></div>
            <div className="relative flex items-center bg-background rounded-lg border border-border shadow-lg p-2 transition-all group-focus-within:border-primary/50">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your product... (e.g. A sleek desktop coffee grinder made of anodized aluminum and walnut wood)"
                className="w-full bg-transparent border-0 focus:ring-0 resize-none px-4 py-3 min-h-[80px] text-lg placeholder:text-muted-foreground/60 outline-none"
                disabled={createSession.isPending}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
              />
              <div className="flex-shrink-0 self-end p-2">
                <Button 
                  type="submit" 
                  size="lg" 
                  disabled={!prompt.trim() || createSession.isPending}
                  className="rounded-md font-mono transition-all"
                >
                  {createSession.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Compiling...</>
                  ) : (
                    <>Compile <ArrowRight className="ml-2 h-4 w-4" /></>
                  )}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </section>

      {/* Stats Dashboard */}
      <section className="container max-w-6xl mx-auto px-6 py-16 space-y-12">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Global Production Stats
          </h2>
        </div>

        {isStatsLoading || !stats ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="bg-card">
              <CardContent className="p-6">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-muted-foreground font-mono">TOTAL DESIGNS</span>
                  <span className="text-4xl font-bold tracking-tight">{stats.totalDesigns.toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-card">
              <CardContent className="p-6">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-muted-foreground font-mono">AVG COST BAND</span>
                  <span className="text-3xl font-bold tracking-tight text-primary">
                    ${Math.round(stats.avgCostLow).toLocaleString()} - ${Math.round(stats.avgCostHigh).toLocaleString()}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card md:col-span-2 lg:col-span-2">
              <CardContent className="p-6">
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <span className="text-sm font-medium text-muted-foreground font-mono mb-3 block">TOP MATERIALS</span>
                    <div className="flex flex-wrap gap-2">
                      {stats.topMaterials.slice(0, 4).map(m => (
                        <Badge key={m.material} variant="secondary" className="font-mono text-xs">
                          {m.material} ({m.count})
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-muted-foreground font-mono mb-3 block">TOP CATEGORIES</span>
                    <div className="flex flex-wrap gap-2">
                      {stats.topCategories.slice(0, 4).map(c => (
                        <Badge key={c.category} variant="outline" className="font-mono text-xs border-primary/20">
                          {c.category} ({c.count})
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="mt-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Layers className="w-5 h-5 text-primary" />
              Recent Sessions
            </h2>
            <Button variant="ghost" onClick={() => setLocation("/sessions")} className="font-mono text-xs">
              View All <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>

          {isStatsLoading || !stats ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}
            </div>
          ) : stats.recentSessions.length === 0 ? (
            <div className="text-center py-12 border border-dashed rounded-xl bg-muted/10">
              <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4 opacity-50" />
              <h3 className="text-lg font-medium">No sessions yet</h3>
              <p className="text-muted-foreground mt-1">Be the first to compile a product.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {stats.recentSessions.map(session => (
                <Card 
                  key={session.id} 
                  className="group cursor-pointer hover:border-primary/50 transition-all hover:shadow-md bg-card overflow-hidden flex flex-col"
                  onClick={() => setLocation(`/sessions/${session.id}`)}
                >
                  {session.thumbnailUrl && (
                    <div className="h-32 w-full overflow-hidden bg-muted">
                      <img 
                        src={session.thumbnailUrl} 
                        alt={session.productName || "Product thumbnail"} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                  )}
                  <CardContent className="p-5 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant={session.status === 'ready' ? 'default' : session.status === 'error' ? 'destructive' : 'secondary'} className="font-mono text-[10px] uppercase">
                          {session.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground flex items-center">
                          <Calendar className="w-3 h-3 mr-1" />
                          {formatDistanceToNow(new Date(session.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                      <h3 className="font-bold text-lg leading-tight mb-1 line-clamp-2">
                        {session.productName || session.title}
                      </h3>
                      {session.category && (
                        <p className="text-sm text-muted-foreground font-mono">{session.category}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}