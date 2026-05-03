import { Link, useLocation, Redirect } from "wouter";
import {
  ShieldCheck,
  LayoutDashboard,
  Store,
  Truck,
  Users,
  Flag,
} from "lucide-react";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useDocumentHead } from "@/hooks/use-document-head";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/listings", label: "Listings", icon: Store },
  { href: "/admin/orders", label: "Orders", icon: Truck },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/reports", label: "Reports", icon: Flag },
];

export function AdminLayout({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { isAdmin, isLoading } = useIsAdmin();
  const [location] = useLocation();
  useDocumentHead({ title: `${title} · Admin · Reality Compiler`, noIndex: true });

  if (isLoading) {
    return (
      <div className="container py-12 text-sm text-muted-foreground">
        Checking access…
      </div>
    );
  }
  if (!isAdmin) return <Redirect to="/" />;

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin · {title}</h1>
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
            Restricted area · all actions are audit-logged
          </p>
        </div>
      </div>
      <nav className="flex flex-wrap gap-1 border-b border-border/40">
        {NAV.map((item) => {
          const active = item.exact
            ? location === item.href
            : location.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-2 text-sm flex items-center gap-2 border-b-2 -mb-px transition-colors ${
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`link-admin-${item.label.toLowerCase()}`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
