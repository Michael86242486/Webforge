import { Link } from "wouter";
import { TerminalSquare, Shield, Zap, Globe, ArrowRight } from "lucide-react";
import { useGetUserStats, getGetUserStatsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

export default function Landing() {
  const { data: stats } = useGetUserStats({
    query: {
      queryKey: getGetUserStatsQueryKey()
    }
  });

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
      {/* Navigation */}
      <nav className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <TerminalSquare className="w-6 h-6 text-primary" />
            <span>WebForge</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Dashboard
            </Link>
            <Button asChild size="sm" className="font-semibold" data-testid="btn-open-telegram-nav">
              <a href="https://t.me/webforge_bot" target="_blank" rel="noopener noreferrer">
                Open in Telegram
              </a>
            </Button>
          </div>
        </div>
      </nav>

      <main>
        {/* Hero Section */}
        <section className="relative py-24 md:py-32 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 via-background to-background" />
          <div className="max-w-7xl mx-auto px-6 relative z-10 text-center">
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-foreground mb-6 max-w-4xl mx-auto leading-tight">
              Build, deploy, and scale from <span className="text-primary">Telegram.</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
              WebForge is the mission control for your full-stack applications. A terminal in your pocket, backed by enterprise-grade infrastructure.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button asChild size="lg" className="h-12 px-8 text-base font-semibold" data-testid="btn-hero-cta">
                <a href="https://t.me/webforge_bot" target="_blank" rel="noopener noreferrer">
                  Start Building <ArrowRight className="w-4 h-4 ml-2" />
                </a>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-12 px-8 text-base font-medium" data-testid="btn-hero-dashboard">
                <Link href="/dashboard">View Dashboard</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-16 border-y border-border/40 bg-card/30">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              <div className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-foreground mb-2">
                  {stats ? stats.totalProjects.toLocaleString() : "..."}
                </div>
                <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Projects Deployed</div>
              </div>
              <div className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-foreground mb-2">
                  {stats ? stats.totalUsers.toLocaleString() : "..."}
                </div>
                <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Active Developers</div>
              </div>
              <div className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-foreground mb-2">
                  {stats ? stats.proUsers.toLocaleString() : "..."}
                </div>
                <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Pro Users</div>
              </div>
              <div className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-foreground mb-2">
                  {stats ? stats.eliteUsers.toLocaleString() : "..."}
                </div>
                <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Elite Teams</div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-24 max-w-7xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-16">Everything you need to ship faster</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-card border border-border p-8 rounded-xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <Zap className="w-10 h-10 text-primary mb-6" />
              <h3 className="text-xl font-semibold mb-3">Instant Deployments</h3>
              <p className="text-muted-foreground">Push code directly from Telegram and watch your changes go live in seconds. Zero config required.</p>
            </div>
            <div className="bg-card border border-border p-8 rounded-xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <Globe className="w-10 h-10 text-primary mb-6" />
              <h3 className="text-xl font-semibold mb-3">Global Edge Network</h3>
              <p className="text-muted-foreground">Your applications are deployed across our global edge network for lowest latency everywhere.</p>
            </div>
            <div className="bg-card border border-border p-8 rounded-xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <Shield className="w-10 h-10 text-primary mb-6" />
              <h3 className="text-xl font-semibold mb-3">Enterprise Security</h3>
              <p className="text-muted-foreground">DDoS protection, automated SSL certificates, and isolated environments come standard.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/40 py-8 text-center text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} WebForge Platform. Built for developers.</p>
      </footer>
    </div>
  );
}
