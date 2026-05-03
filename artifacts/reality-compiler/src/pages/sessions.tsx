import { useLocation } from "wouter";
import { formatDistanceToNow, format } from "date-fns";
import { Plus, Package, Calendar, Activity, Cpu } from "lucide-react";
import { useListSessions } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePrivatePageHead } from "@/lib/seo-defaults";

export default function Sessions() {
  usePrivatePageHead(
    "Your sessions",
    "Your private design sessions on Reality Compiler.",
  );
  const [, setLocation] = useLocation();
  const { data: sessions, isLoading } = useListSessions();

  return (
    <div className="flex-1 overflow-auto bg-muted/10">
      <div className="container max-w-6xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight font-sans">Engineering Sessions</h1>
            <p className="text-muted-foreground mt-1 font-mono text-sm">All compiled reality jobs.</p>
          </div>
          <Button onClick={() => setLocation("/")} className="font-mono transition-all">
            <Plus className="w-4 h-4 mr-2" />
            New Session
          </Button>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead>Cost Est.</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[1, 2, 3, 4, 5].map(i => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : !sessions || sessions.length === 0 ? (
          <div className="text-center py-24 border border-dashed rounded-xl bg-card">
            <Cpu className="w-12 h-12 mx-auto text-muted-foreground mb-4 opacity-30" />
            <h3 className="text-xl font-medium">No sessions yet</h3>
            <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
              Your engineering queue is empty. Start a new session to compile your first product.
            </p>
            <Button onClick={() => setLocation("/")} className="mt-6 font-mono">
              <Plus className="w-4 h-4 mr-2" />
              Start Compiling
            </Button>
          </div>
        ) : (
          <Card className="overflow-hidden bg-card border-border shadow-sm">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="font-mono text-xs w-[300px]">PRODUCT</TableHead>
                  <TableHead className="font-mono text-xs">CATEGORY</TableHead>
                  <TableHead className="font-mono text-xs">PRIMARY MATERIAL</TableHead>
                  <TableHead className="font-mono text-xs text-right">COST EST.</TableHead>
                  <TableHead className="font-mono text-xs">STATUS</TableHead>
                  <TableHead className="font-mono text-xs text-right">LAST UPDATED</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map(session => (
                  <TableRow 
                    key={session.id}
                    className="cursor-pointer group hover:bg-muted/50 transition-colors"
                    onClick={() => setLocation(`/sessions/${session.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center space-x-3">
                        {session.thumbnailUrl ? (
                          <div className="h-10 w-10 rounded overflow-hidden bg-muted border border-border shrink-0">
                            <img src={session.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="h-10 w-10 rounded bg-muted border border-border flex items-center justify-center shrink-0">
                            <Package className="w-4 h-4 text-muted-foreground opacity-50" />
                          </div>
                        )}
                        <div>
                          <div className="font-medium group-hover:text-primary transition-colors line-clamp-1">
                            {session.productName || session.title}
                          </div>
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                            ID: #{session.id.toString().padStart(4, '0')}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {session.category ? (
                        <span className="text-sm">{session.category}</span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {session.primaryMaterial ? (
                        <Badge variant="outline" className="font-mono text-[10px] bg-background">
                          {session.primaryMaterial}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {session.estimatedCostLow != null && session.estimatedCostHigh != null ? (
                        <span className="text-sm font-mono text-primary font-medium">
                          ${session.estimatedCostLow.toLocaleString()} - ${session.estimatedCostHigh.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={session.status === 'ready' ? 'default' : session.status === 'error' ? 'destructive' : 'secondary'} className="font-mono text-[10px] uppercase">
                        {session.status === 'generating' ? (
                          <span className="flex items-center">
                            <Activity className="w-3 h-3 mr-1 animate-pulse" />
                            {session.status}
                          </span>
                        ) : session.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="text-sm text-muted-foreground flex items-center justify-end">
                        <Calendar className="w-3 h-3 mr-1.5 opacity-70" />
                        {format(new Date(session.updatedAt), 'MMM d, yyyy')}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
}