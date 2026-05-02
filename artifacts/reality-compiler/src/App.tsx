import { useEffect, useRef } from "react";
import {
  Switch,
  Route,
  Router as WouterRouter,
  useLocation,
  Redirect,
} from "wouter";
import {
  ClerkProvider,
  SignIn,
  SignUp,
  Show,
  useClerk,
} from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
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
import Marketplace from "@/pages/marketplace";
import MarketplaceDetail from "@/pages/marketplace-detail";
import DesignerProfile from "@/pages/designer-profile";
import { Navbar } from "@/components/navbar";

const queryClient = new QueryClient();

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL || undefined;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in env");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(265 89% 70%)",
    colorForeground: "hsl(210 20% 96%)",
    colorMutedForeground: "hsl(215 16% 65%)",
    colorDanger: "hsl(0 84% 60%)",
    colorBackground: "hsl(222 47% 9%)",
    colorInput: "hsl(217 33% 14%)",
    colorInputForeground: "hsl(210 20% 96%)",
    colorNeutral: "hsl(217 33% 22%)",
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox:
      "bg-[hsl(222_47%_9%)] rounded-2xl w-[440px] max-w-full overflow-hidden border border-border/50 shadow-2xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-foreground font-bold tracking-tight",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButtonText: "text-foreground font-medium",
    formFieldLabel: "text-foreground/90 font-mono text-xs uppercase tracking-wider",
    footerActionLink: "text-primary hover:text-primary/80 font-medium",
    footerActionText: "text-muted-foreground",
    dividerText: "text-muted-foreground font-mono text-xs uppercase",
    identityPreviewEditButton: "text-primary",
    formFieldSuccessText: "text-emerald-400",
    alertText: "text-foreground",
    logoBox: "flex justify-center mb-2",
    logoImage: "h-10 w-auto",
    socialButtonsBlockButton:
      "border border-border/60 bg-background/40 hover:bg-background/70",
    formButtonPrimary:
      "bg-primary text-primary-foreground hover:bg-primary/90 font-mono uppercase tracking-wider text-xs",
    formFieldInput:
      "bg-input text-foreground border border-border/60 focus:border-primary",
    footerAction: "",
    dividerLine: "bg-border/60",
    alert: "bg-destructive/10 border border-destructive/30",
    otpCodeFieldInput: "bg-input text-foreground border border-border/60",
    formFieldRow: "",
    main: "",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
      />
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Show when="signed-in">{children}</Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function AppShell() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans selection:bg-primary/30">
      <Navbar />
      <main className="flex-1 flex flex-col relative overflow-hidden">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/marketplace" component={Marketplace} />
          <Route path="/marketplace/:id" component={MarketplaceDetail} />
          <Route path="/designers/:userId" component={DesignerProfile} />
          <Route path="/suppliers" component={Suppliers} />
          <Route path="/about" component={About} />
          <Route path="/sessions">
            <RequireAuth>
              <Sessions />
            </RequireAuth>
          </Route>
          <Route path="/sessions/:id">
            <RequireAuth>
              <SessionWorkspace />
            </RequireAuth>
          </Route>
          <Route path="/orders">
            <RequireAuth>
              <Orders />
            </RequireAuth>
          </Route>
          <Route path="/orders/:id">
            <RequireAuth>
              <OrderDetail />
            </RequireAuth>
          </Route>
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to compile reality",
          },
        },
        signUp: {
          start: {
            title: "Create your studio",
            subtitle: "Start designing physical products from prompts",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Switch>
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route component={AppShell} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
