import { Layout } from "@/components/layout";
import { useGetUserStats, getGetUserStatsQueryKey, useListProjects, getListProjectsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Users, Star, Crown, Server } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const MOCK_USER_ID = 1;

  const { data: stats, isLoading: statsLoading } = useGetUserStats({
    query: {
      queryKey: getGetUserStatsQueryKey()
    }
  });

  const { data: projects, isLoading: projectsLoading } = useListProjects(
    { userId: MOCK_USER_ID },
    {
      query: {
        enabled: true,
        queryKey: getListProjectsQueryKey({ userId: MOCK_USER_ID })
      }
    }
  );

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Mission Control</h1>
          <p className="text-muted-foreground mt-1">Platform overview and recent activity.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Projects</CardTitle>
              <Server className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              {statsLoading ? <Skeleton className="h-8 w-[100px]" /> : (
                <div className="text-2xl font-bold">{stats?.totalProjects.toLocaleString() || 0}</div>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? <Skeleton className="h-8 w-[100px]" /> : (
                <div className="text-2xl font-bold">{stats?.totalUsers.toLocaleString() || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pro Subscriptions</CardTitle>
              <Star className="h-4 w-4 text-blue-400" />
            </CardHeader>
            <CardContent>
              {statsLoading ? <Skeleton className="h-8 w-[100px]" /> : (
                <div className="text-2xl font-bold">{stats?.proUsers.toLocaleString() || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Elite Subscriptions</CardTitle>
              <Crown className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              {statsLoading ? <Skeleton className="h-8 w-[100px]" /> : (
                <div className="text-2xl font-bold">{stats?.eliteUsers.toLocaleString() || 0}</div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold tracking-tight">Recent Projects</h2>
            <Link href="/projects" className="text-sm font-medium text-primary hover:underline">
              View all
            </Link>
          </div>
          
          <Card className="border-border">
            {projectsLoading ? (
              <div className="p-6 space-y-4">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : projects?.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <Activity className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>No projects found. Create one via the Telegram bot.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {projects?.slice(0, 5).map((project, i) => (
                  <div key={project.id} className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors animate-in fade-in slide-in-from-left-4" style={{ animationDelay: `${i * 100}ms` }}>
                    <div>
                      <Link href={`/workspace/${project.id}`} className="font-semibold hover:text-primary transition-colors block mb-1">
                        {project.name}
                      </Link>
                      <div className="text-xs text-muted-foreground font-mono">
                        {project.techStack || 'unknown'} • Port: {project.port || 'N/A'}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {project.status === 'running' && (
                        <Badge variant="outline" className="border-green-500/30 text-green-500 bg-green-500/10">Running</Badge>
                      )}
                      {project.status === 'building' && (
                        <Badge variant="outline" className="border-amber-500/30 text-amber-500 bg-amber-500/10 animate-pulse">Building</Badge>
                      )}
                      {project.status === 'idle' && (
                        <Badge variant="outline" className="text-muted-foreground">Idle</Badge>
                      )}
                      {project.status === 'planned' && (
                        <Badge variant="outline" className="border-blue-500/30 text-blue-500 bg-blue-500/10">Planned</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </Layout>
  );
}
