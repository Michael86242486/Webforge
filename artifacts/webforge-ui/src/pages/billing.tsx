import { Layout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Info, ShieldAlert } from "lucide-react";

export default function Billing() {
  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Billing & Tiers</h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Manage your subscription tier. Upgrade to unlock more power, higher limits, and priority AI generation.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3 max-w-6xl">
          {/* Starter Tier */}
          <Card className="flex flex-col relative border-border">
            <CardHeader>
              <CardTitle className="text-xl">Starter</CardTitle>
              <CardDescription>For hobbyists and side projects.</CardDescription>
              <div className="mt-4 flex items-baseline text-4xl font-extrabold">
                ₦0
                <span className="ml-1 text-xl font-medium text-muted-foreground">/mo</span>
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              <ul className="space-y-3 text-sm">
                <li className="flex gap-3 text-muted-foreground">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  <span>3 Active Projects</span>
                </li>
                <li className="flex gap-3 text-muted-foreground">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  <span>10 AI Actions / day</span>
                </li>
                <li className="flex gap-3 text-muted-foreground">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  <span>Shared Infrastructure</span>
                </li>
                <li className="flex gap-3 text-muted-foreground opacity-50">
                  <Check className="h-4 w-4 shrink-0" />
                  <span>Custom Domains</span>
                </li>
              </ul>
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="w-full" disabled>Current Tier</Button>
            </CardFooter>
          </Card>

          {/* Pro Tier */}
          <Card className="flex flex-col relative border-primary shadow-lg shadow-primary/10">
            <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4">
              <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>
            </div>
            <CardHeader>
              <CardTitle className="text-xl text-primary">Pro</CardTitle>
              <CardDescription>For professional developers.</CardDescription>
              <div className="mt-4 flex items-baseline text-4xl font-extrabold text-foreground">
                ₦5,000
                <span className="ml-1 text-xl font-medium text-muted-foreground">/mo</span>
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              <ul className="space-y-3 text-sm">
                <li className="flex gap-3 text-foreground">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  <span>Unlimited Projects</span>
                </li>
                <li className="flex gap-3 text-foreground">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  <span>100 AI Actions / day</span>
                </li>
                <li className="flex gap-3 text-foreground">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  <span>Priority Edge Network</span>
                </li>
                <li className="flex gap-3 text-foreground">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  <span>Custom Domains</span>
                </li>
              </ul>
            </CardContent>
            <CardFooter>
              <Button className="w-full" data-testid="btn-upgrade-pro">Upgrade to Pro</Button>
            </CardFooter>
          </Card>

          {/* Elite Tier */}
          <Card className="flex flex-col relative border-amber-500/50">
            <CardHeader>
              <CardTitle className="text-xl text-amber-500">Elite</CardTitle>
              <CardDescription>For production workloads.</CardDescription>
              <div className="mt-4 flex items-baseline text-4xl font-extrabold">
                ₦25,000
                <span className="ml-1 text-xl font-medium text-muted-foreground">/mo</span>
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              <ul className="space-y-3 text-sm">
                <li className="flex gap-3 text-foreground">
                  <Check className="h-4 w-4 text-amber-500 shrink-0" />
                  <span>Unlimited Everything</span>
                </li>
                <li className="flex gap-3 text-foreground">
                  <Check className="h-4 w-4 text-amber-500 shrink-0" />
                  <span>Dedicated GPU Access</span>
                </li>
                <li className="flex gap-3 text-foreground">
                  <Check className="h-4 w-4 text-amber-500 shrink-0" />
                  <span>Always-on Workspaces</span>
                </li>
                <li className="flex gap-3 text-foreground">
                  <Check className="h-4 w-4 text-amber-500 shrink-0" />
                  <span>SLA Guarantee</span>
                </li>
              </ul>
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="w-full border-amber-500/50 text-amber-500 hover:bg-amber-500/10" data-testid="btn-upgrade-elite">Upgrade to Elite</Button>
            </CardFooter>
          </Card>
        </div>

        <div className="max-w-4xl p-6 bg-muted/30 border border-border rounded-xl mt-12 flex gap-4 items-start">
          <ShieldAlert className="w-6 h-6 text-primary shrink-0 mt-0.5" />
          <div>
            <h3 className="text-base font-semibold mb-1">Secure Payments via OPay</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Upgrades are processed securely through our Telegram bot integration with OPay. Clicking 'Upgrade' will open a direct chat with the WebForge payment bot where you can complete your transaction using your OPay account or any major Nigerian bank. Subscriptions are automatically activated upon successful payment.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
