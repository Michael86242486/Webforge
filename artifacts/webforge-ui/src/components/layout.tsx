import { Link, useLocation } from "wouter";
import { LayoutDashboard, FolderKanban, CreditCard, TerminalSquare, Rocket, Cpu, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { user, isAuthenticated, logout, isLoading } = useAuth();

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/projects", label: "Projects", icon: FolderKanban },
    { href: "/runtime", label: "WRE Admin", icon: Cpu },
    { href: "/billing", label: "Billing", icon: CreditCard },
  ];

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card hidden md:flex flex-col">
        <div className="p-6">
          <Link href="/" className="flex items-center gap-2 text-xl font-bold tracking-tight text-primary transition-opacity hover:opacity-80">
            <TerminalSquare className="w-6 h-6" />
            <span>WebForge</span>
          </Link>
        </div>
        <nav className="flex-1 px-4 space-y-2">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                data-testid={`nav-${item.label.toLowerCase().replace(" ", "-")}`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
                {item.href === "/runtime" && (
                  <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono">
                    WRE
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Auth section */}
        <div className="px-4 pb-2">
          {!isLoading && (
            isAuthenticated && user ? (
              <div className="bg-muted/30 rounded-lg p-3 border border-border">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate">{user.username}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{user.email}</div>
                  </div>
                </div>
                <button
                  onClick={logout}
                  className="w-full text-xs text-muted-foreground hover:text-foreground py-1 text-left transition-colors"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <LogIn className="w-4 h-4" />
                Sign In
              </Link>
            )
          )}
        </div>

        <div className="p-4 mt-auto">
          <div className="bg-muted/50 rounded-lg p-4 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Rocket className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">WebForge CLI</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">Deploy from Telegram in seconds.</p>
            <a
              href="https://t.me/webforge_bot"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center bg-primary text-primary-foreground text-xs font-medium py-2 rounded-md hover:bg-primary/90 transition-colors"
              data-testid="link-telegram-bot-sidebar"
            >
              Open Bot
            </a>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-screen max-w-full overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold text-primary">
            <TerminalSquare className="w-5 h-5" />
            <span>WebForge</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/runtime" className="text-xs px-2 py-1 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              WRE
            </Link>
            {!isAuthenticated && (
              <Link href="/login" className="text-xs text-muted-foreground hover:text-foreground">
                Sign in
              </Link>
            )}
          </div>
        </header>

        <div className="flex-1 p-6 md:p-8 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
