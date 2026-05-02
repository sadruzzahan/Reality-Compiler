import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Sessions from "@/pages/sessions";
import SessionWorkspace from "@/pages/session-workspace";
import Suppliers from "@/pages/suppliers";
import Orders from "@/pages/orders";
import OrderDetail from "@/pages/order-detail";
import About from "@/pages/about";
import { Navbar } from "@/components/navbar";

const queryClient = new QueryClient();

function Router() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans selection:bg-primary/30">
      <Navbar />
      <main className="flex-1 flex flex-col relative overflow-hidden">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/sessions" component={Sessions} />
          <Route path="/sessions/:id" component={SessionWorkspace} />
          <Route path="/suppliers" component={Suppliers} />
          <Route path="/orders" component={Orders} />
          <Route path="/orders/:id" component={OrderDetail} />
          <Route path="/about" component={About} />
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;