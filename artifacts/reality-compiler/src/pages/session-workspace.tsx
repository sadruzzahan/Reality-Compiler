import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { format } from "date-fns";
import { 
  ArrowLeft, Send, Trash2, Loader2, Factory, Package, 
  Ruler, Weight, DollarSign, Clock, Component, PenTool,
  AlertTriangle
} from "lucide-react";
import { 
  useGetSession, 
  useDeleteSession, 
  useSendMessage,
  getGetSessionQueryKey,
  getListSessionsQueryKey,
  getGetSessionStatsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { QuotesPanel } from "@/components/quotes-panel";

export default function SessionWorkspace() {
  const { id } = useParams();
  const sessionId = parseInt(id || "0", 10);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: session, isLoading, isError, refetch } = useGetSession(sessionId, {
    query: {
      enabled: !!sessionId,
      queryKey: getGetSessionQueryKey(sessionId),
      refetchInterval: (query) => {
        // Poll every 3s if generating
        return query.state.data?.status === "generating" ? 3000 : false;
      }
    }
  });

  const deleteSession = useDeleteSession({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSessionStatsQueryKey() });
        setLocation("/sessions");
      }
    }
  });

  const sendMessage = useSendMessage({
    mutation: {
      onSuccess: () => {
        setMessage("");
        queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(sessionId) });
      }
    }
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages?.length]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !sessionId || session?.status === "generating") return;
    sendMessage.mutate({ id: sessionId, data: { content: message } });
  };

  if (isError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-muted/10">
        <AlertTriangle className="w-12 h-12 text-destructive mb-4" />
        <h2 className="text-2xl font-bold mb-2">Session Not Found</h2>
        <p className="text-muted-foreground mb-6">This engineering session may have been deleted or never existed.</p>
        <Button onClick={() => setLocation("/sessions")} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Sessions
        </Button>
      </div>
    );
  }

  const isGenerating = session?.status === "generating";
  const output = session?.latestOutput;

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden bg-background">
      {/* Top Bar */}
      <header className="h-14 shrink-0 flex items-center justify-between px-4 border-b bg-card">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/sessions")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex flex-col">
            {isLoading ? (
              <Skeleton className="h-4 w-48 mb-1" />
            ) : (
              <span className="font-bold text-sm truncate max-w-[300px]">
                {session?.title || `Session #${sessionId}`}
              </span>
            )}
            {isLoading ? (
              <Skeleton className="h-3 w-24" />
            ) : (
              <div className="flex items-center gap-2 text-xs">
                <Badge variant={session?.status === 'ready' ? 'default' : session?.status === 'error' ? 'destructive' : 'secondary'} className="h-4 px-1 text-[9px] uppercase font-mono rounded-sm">
                  {session?.status}
                </Badge>
                {session?.updatedAt && (
                  <span className="text-muted-foreground font-mono opacity-60">
                    Last updated {format(new Date(session.updatedAt), 'HH:mm')}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {session?.status === "ready" && (
            <Button variant="outline" size="sm" className="font-mono text-xs" onClick={() => refetch()}>
              Refresh
            </Button>
          )}
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => {
              if (confirm("Are you sure you want to delete this session? This cannot be undone.")) {
                deleteSession.mutate({ id: sessionId });
              }
            }}
            disabled={deleteSession.isPending}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* LEFT PANEL: Latest Design Output */}
        <div className="flex-1 overflow-auto border-r bg-muted/5 relative">
          {isLoading ? (
            <div className="p-8 max-w-4xl mx-auto space-y-8">
              <Skeleton className="aspect-video w-full rounded-xl" />
              <div className="space-y-4">
                <Skeleton className="h-8 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Skeleton className="h-32 rounded-xl" />
                <Skeleton className="h-32 rounded-xl" />
              </div>
            </div>
          ) : isGenerating ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-10">
              <div className="relative w-24 h-24 mb-8">
                <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                <Factory className="absolute inset-0 m-auto w-8 h-8 text-primary animate-pulse" />
              </div>
              <h3 className="text-2xl font-bold font-sans tracking-tight mb-2">Compiling Reality</h3>
              <p className="text-muted-foreground font-mono text-sm max-w-xs text-center">
                Generating geometry, specifying materials, estimating costs, and formulating manufacturing steps...
              </p>
            </div>
          ) : !output ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center text-muted-foreground">
              <Package className="w-16 h-16 mb-4 opacity-20" />
              <p>No design output generated yet.</p>
            </div>
          ) : (
            <div className="p-6 md:p-8 max-w-5xl mx-auto">
              <div className="mb-8">
                {output.imageUrl && (
                  <div className="mb-8 rounded-xl overflow-hidden border shadow-sm bg-card relative group">
                    <img 
                      src={output.imageUrl} 
                      alt={output.productName} 
                      className="w-full aspect-[16/9] object-cover object-center"
                    />
                    <div className="absolute inset-0 ring-1 ring-inset ring-black/10 rounded-xl pointer-events-none"></div>
                  </div>
                )}
                
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h1 className="text-3xl font-bold font-sans tracking-tight mb-2">{output.productName}</h1>
                    <div className="flex items-center gap-3 flex-wrap">
                      <Badge variant="secondary" className="font-mono text-xs">{output.category}</Badge>
                      <Badge variant="outline" className="font-mono text-xs border-primary/30 text-primary bg-primary/5">
                        {output.primaryMaterial}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right shrink-0 bg-card border rounded-lg p-3 shadow-sm min-w-[160px]">
                    <div className="text-[10px] uppercase font-mono text-muted-foreground mb-1 font-bold">Est. Unit Cost</div>
                    <div className="text-xl font-bold text-primary font-mono tracking-tight">
                      {output.costEstimate.currency} {output.costEstimate.low.toLocaleString()} - {output.costEstimate.high.toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center justify-end">
                      <Clock className="w-3 h-3 mr-1" />
                      Lead: {output.costEstimate.leadTimeDays} days
                    </div>
                  </div>
                </div>
                
                <p className="text-lg leading-relaxed text-foreground/80 mt-6">{output.summary}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <Card className="bg-card shadow-sm border-border/60">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-mono flex items-center uppercase text-muted-foreground">
                      <Ruler className="w-4 h-4 mr-2" /> Specifications
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="text-xs text-muted-foreground font-medium mb-1">Dimensions</div>
                      <div className="font-mono text-sm">{output.dimensions}</div>
                    </div>
                    {output.weightGrams != null && (
                      <div>
                        <div className="text-xs text-muted-foreground font-medium mb-1">Estimated Weight</div>
                        <div className="font-mono text-sm flex items-center">
                          <Weight className="w-3 h-3 mr-1.5 opacity-50" />
                          {(output.weightGrams / 1000).toFixed(2)} kg ({output.weightGrams}g)
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-card shadow-sm border-border/60">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-mono flex items-center uppercase text-muted-foreground">
                      <Component className="w-4 h-4 mr-2" /> Materials & Finishes
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {output.materials.map((m, i) => (
                        <Badge key={i} variant="secondary" className="bg-muted/50 hover:bg-muted font-mono text-xs">
                          {m}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card className="mb-8 shadow-sm border-border/60 overflow-hidden">
                <CardHeader className="bg-muted/30 border-b border-border/40 py-4">
                  <CardTitle className="text-sm font-mono flex items-center uppercase text-foreground">
                    <DollarSign className="w-4 h-4 mr-2" /> Bill of Materials (BOM)
                  </CardTitle>
                </CardHeader>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-border/40">
                      <TableHead className="font-mono text-xs font-semibold">Component</TableHead>
                      <TableHead className="font-mono text-xs font-semibold">Material</TableHead>
                      <TableHead className="font-mono text-xs font-semibold text-right">Qty</TableHead>
                      <TableHead className="font-mono text-xs font-semibold text-right">Unit Cost</TableHead>
                      <TableHead className="font-mono text-xs font-semibold text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {output.bom.map((item, i) => (
                      <TableRow key={i} className="border-border/20">
                        <TableCell className="font-medium text-sm">{item.component}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{item.material}</TableCell>
                        <TableCell className="text-right text-sm font-mono">
                          {item.quantity} <span className="text-[10px] text-muted-foreground">{item.unit}</span>
                        </TableCell>
                        <TableCell className="text-right text-sm font-mono">${item.unitCost.toFixed(2)}</TableCell>
                        <TableCell className="text-right text-sm font-mono font-medium">${item.totalCost.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/10 hover:bg-muted/10">
                      <TableCell colSpan={4} className="text-right font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground pt-4">
                        Estimated Total Unit Cost
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-primary text-base pt-4">
                        ${output.bom.reduce((acc, item) => acc + item.totalCost, 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                <div>
                  <h3 className="text-sm font-mono flex items-center uppercase text-muted-foreground font-bold mb-4">
                    <Factory className="w-4 h-4 mr-2" /> Manufacturing Processes
                  </h3>
                  <ul className="space-y-3">
                    {output.processes.map((p, i) => (
                      <li key={i} className="flex gap-3 text-sm">
                        <div className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary font-mono text-[10px] font-bold">
                          {i + 1}
                        </div>
                        <span className="leading-snug">{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                
                {output.manufacturingNotes && (
                  <div>
                    <h3 className="text-sm font-mono flex items-center uppercase text-muted-foreground font-bold mb-4">
                      <PenTool className="w-4 h-4 mr-2" /> Engineering Notes
                    </h3>
                    <div className="bg-muted/30 p-4 rounded-lg border border-border/50 text-sm leading-relaxed text-muted-foreground">
                      {output.manufacturingNotes}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {!isLoading && !isGenerating && session?.status === "ready" && output && (
            <QuotesPanel sessionId={sessionId} />
          )}
        </div>

        {/* RIGHT PANEL: Chat Thread */}
        <div className="w-full max-w-[400px] shrink-0 flex flex-col bg-card border-l relative">
          <div className="px-4 py-3 border-b bg-muted/20 shrink-0">
            <h2 className="font-bold text-sm tracking-tight flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary inline-block"></span>
              Refinement Thread
            </h2>
            <p className="text-xs text-muted-foreground font-mono mt-1">Iterate on the design specs.</p>
          </div>
          
          <ScrollArea className="flex-1 p-4">
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-16 w-3/4 ml-auto rounded-lg rounded-tr-sm" />
                <Skeleton className="h-24 w-5/6 rounded-lg rounded-tl-sm" />
              </div>
            ) : session?.messages?.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-10 px-4">
                Send a message to adjust materials, constraints, or the core concept. The compiler will generate a new output.
              </div>
            ) : (
              <div className="space-y-6 pb-4">
                {session?.messages?.map((msg, i) => {
                  const isUser = msg.role === 'user';
                  return (
                    <div key={msg.id || i} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                      <div className={`text-[10px] font-mono uppercase mb-1.5 opacity-50 px-1 ${isUser ? 'text-right' : 'text-left'}`}>
                        {msg.role} • {format(new Date(msg.createdAt), 'HH:mm')}
                      </div>
                      <div 
                        className={`text-sm px-4 py-3 max-w-[85%] leading-relaxed ${
                          isUser 
                            ? 'bg-primary text-primary-foreground rounded-2xl rounded-tr-sm' 
                            : 'bg-muted text-foreground rounded-2xl rounded-tl-sm border border-border/50'
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  );
                })}
                {isGenerating && (
                  <div className="flex flex-col items-start">
                    <div className="text-[10px] font-mono uppercase mb-1.5 opacity-50 px-1">
                      compiler • generating
                    </div>
                    <div className="bg-muted text-foreground rounded-2xl rounded-tl-sm border border-border/50 px-4 py-3">
                      <div className="flex space-x-1.5 items-center h-4">
                        <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>

          <div className="p-4 bg-card border-t shrink-0">
            <form onSubmit={handleSendMessage} className="relative flex items-end">
              <Textarea 
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={isGenerating ? "Compiling..." : "Refine the design..."}
                disabled={isGenerating || sendMessage.isPending}
                className="resize-none min-h-[60px] pr-12 text-sm bg-muted/50 border-muted-foreground/20 focus-visible:ring-primary/30 rounded-xl"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(e);
                  }
                }}
              />
              <Button 
                type="submit" 
                size="icon"
                disabled={!message.trim() || isGenerating || sendMessage.isPending}
                className="absolute bottom-1.5 right-1.5 w-8 h-8 rounded-lg"
              >
                {sendMessage.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 ml-0.5" />}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}