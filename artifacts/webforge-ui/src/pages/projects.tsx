import { Layout } from "@/components/layout";
import { useListProjects, getListProjectsQueryKey } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Terminal, ExternalLink, Search, ServerOff, Code2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { useState } from "react";

export default function Projects() {
  const MOCK_USER_ID = 1;
  const [search, setSearch] = useState("");

  const { data: projects, isLoading } = useListProjects(
    { userId: MOCK_USER_ID },
    {
      query: {
        enabled: true,
        queryKey: getListProjectsQueryKey({ userId: MOCK_USER_ID })
      }
    }
  );

  const filteredProjects = projects?.filter(p => p.name.toLowerCase().includes(search.toLowerCase())) || [];

  return (
    <Layout>
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Projects</h1>
            <p className="text-muted-foreground mt-1">Manage and monitor your deployed applications.</p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search projects..." 
              className="pl-9 bg-card"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-projects"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}
          </div>
        ) : filteredProjects.length === 0 ? (
          <Card className="p-12 text-center flex flex-col items-center justify-center border-dashed">
            <ServerOff className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-foreground mb-1">No projects found</h3>
            <p className="text-muted-foreground text-sm max-w-sm">
              {search ? "No projects match your search criteria." : "You haven't created any projects yet. Use the Telegram bot to get started."}
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredProjects.map((project, i) => (
              <Card 
                key={project.id} 
                className="flex flex-col overflow-hidden transition-all hover:border-primary/50 group animate-in fade-in slide-in-from-bottom-4"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-semibold text-lg truncate pr-2 group-hover:text-primary transition-colors">
                      {project.name}
                    </h3>
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
                  
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-4 flex-1">
                    {project.description || "No description provided."}
                  </p>

                  <div className="flex flex-wrap gap-2 mb-6">
                    <Badge variant="secondary" className="bg-secondary/50 font-mono text-xs">
                      {project.techStack || 'unknown'}
                    </Badge>
                    {project.port && (
                      <Badge variant="secondary" className="bg-secondary/50 font-mono text-xs">
                        :{project.port}
                      </Badge>
                    )}
                    {project.isHosted && (
                      <Badge variant="outline" className="border-primary/30 text-primary">Hosted</Badge>
                    )}
                  </div>
                </div>
                
                <div className="bg-muted/30 p-3 border-t border-border flex gap-2">
                  <Button asChild variant="default" className="w-full flex-1" data-testid={`btn-workspace-${project.id}`}>
                    <Link href={`/workspace/${project.id}`}>
                      <Terminal className="w-4 h-4 mr-2" />
                      Workspace
                    </Link>
                  </Button>
                  <Button variant="outline" size="icon" disabled={!project.isHosted || project.status !== 'running'} data-testid={`btn-external-${project.id}`}>
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
