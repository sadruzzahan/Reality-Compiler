import { useEffect, useRef, useState } from "react";
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
import { shadcn } from "@clerk/themes";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useDocumentHead } from "@/hooks/use-document-head";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Sessions from "@/pages/sessions";
import SessionWorkspace from "@/pages/session-workspace";
import Suppliers from "@/pages/suppliers";
import Orders from "@/pages/orders";
import OrderDetail from "@/pages/order-detail";
import Payouts from "@/pages/payouts";
import About from "@/pages/about";
import Marketplace from "@/pages/marketplace";
import MarketplaceDetail from "@/pages/marketplace-detail";
import DesignerProfile from "@/pages/designer-profile";
import MyProfile from "@/pages/my-profile";
import TermsPage from "@/pages/legal/terms";
import PrivacyPage from "@/pages/legal/privacy";
import AcceptableUsePage from "@/pages/legal/acceptable-use";
import CookiesPage from "@/pages/legal/cookies";
import DpaPage from "@/pages/legal/dpa";
import ContactPage from "@/pages/contact";
import PricingPage from "@/pages/pricing";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { CookieBanner } from "@/components/cookie-banner";

const queryClient = new QueryClient();

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

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
  useDocumentHead({
    title: "Sign in to Reality Compiler",
    description:
      "Sign in to your Reality Compiler account to access your design sessions, marketplace orders, and designer payouts.",
    noIndex: true,
  });
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
  useDocumentHead({
    title: "Create your Reality Compiler account",
    description:
      "Sign up free to compile physical-product designs from plain text and earn 70% of every license sale on the marketplace.",
    noIndex: true,
  });
  const STORAGE_KEY = "rc_signup_consent_v1";
  const [accepted, setAccepted] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  const onAccept = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore quota / private-mode failures
    }
    setAccepted(true);
  };

  if (!accepted) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-10">
        <div
          className="w-full max-w-md rounded-lg border border-border/60 bg-card p-6 space-y-5"
          data-testid="signup-consent-gate"
        >
          <div className="space-y-2">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
              Before you continue
            </p>
            <h1 className="text-2xl font-semibold">Two quick confirmations</h1>
            <p className="text-sm text-muted-foreground">
              Reality Compiler is for adults building real hardware. We need
              your acknowledgement before creating an account.
            </p>
          </div>
          <label
            className="flex items-start gap-3 cursor-pointer"
            data-testid="checkbox-signup-consent-label"
          >
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-primary"
              data-testid="checkbox-signup-consent"
              onChange={(e) => {
                if (e.target.checked) onAccept();
              }}
            />
            <span className="text-sm text-foreground/90">
              I confirm I am at least <strong>18 years old</strong> and I
              accept the{" "}
              <a
                href={`${basePath}/terms`}
                className="text-primary underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Terms
              </a>
              ,{" "}
              <a
                href={`${basePath}/acceptable-use`}
                className="text-primary underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Acceptable Use Policy
              </a>
              , and{" "}
              <a
                href={`${basePath}/privacy`}
                className="text-primary underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Privacy Policy
              </a>
              .
            </span>
          </label>
          <p className="text-xs text-muted-foreground">
            You must tick this box to continue. Already have an account?{" "}
            <a
              href={`${basePath}/sign-in`}
              className="text-primary underline"
            >
              Sign in
            </a>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-4 py-10">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
      />
      <p
        className="mt-6 text-center text-xs text-muted-foreground max-w-sm"
        data-testid="signup-legal-notice"
      >
        You confirmed you are 18+ and accepted our{" "}
        <a href={`${basePath}/terms`} className="text-primary underline">
          Terms
        </a>
        ,{" "}
        <a
          href={`${basePath}/acceptable-use`}
          className="text-primary underline"
        >
          Acceptable Use
        </a>
        , and{" "}
        <a href={`${basePath}/privacy`} className="text-primary underline">
          Privacy Policy
        </a>
        .
      </p>
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
          <Route path="/my-profile">
            <RequireAuth>
              <MyProfile />
            </RequireAuth>
          </Route>
          <Route path="/suppliers" component={Suppliers} />
          <Route path="/about" component={About} />
          <Route path="/terms" component={TermsPage} />
          <Route path="/privacy" component={PrivacyPage} />
          <Route path="/acceptable-use" component={AcceptableUsePage} />
          <Route path="/cookies" component={CookiesPage} />
          <Route path="/legal/dpa" component={DpaPage} />
          <Route path="/contact" component={ContactPage} />
          <Route path="/pricing" component={PricingPage} />
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
          <Route path="/payouts">
            <RequireAuth>
              <Payouts />
            </RequireAuth>
          </Route>
          <Route component={NotFound} />
        </Switch>
      </main>
      <Footer />
      <CookieBanner />
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
            subtitle:
              "By creating an account you confirm you are 18+ and agree to our Terms of Service, Acceptable Use Policy, and Privacy Policy.",
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
