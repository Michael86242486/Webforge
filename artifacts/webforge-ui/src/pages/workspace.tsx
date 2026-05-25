import { useParams } from "wouter";
import { useEffect } from "react";
import { Terminal } from "lucide-react";
import { Link } from "wouter";

export default function Workspace() {
  const params = useParams();
  const id = params.id;

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, []);

  if (!id) return null;

  const iframeSrc = `/api/workspace/${id}`;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      <div className="h-12 border-b border-border bg-card flex items-center px-4 justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Terminal className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold tracking-tight">Workspace: {id}</span>
        </div>
        <Link 
          href="/projects" 
          className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md hover:bg-muted"
        >
          Exit Workspace
        </Link>
      </div>
      <div className="flex-1 w-full bg-black relative">
        <iframe 
          src={iframeSrc}
          className="absolute inset-0 w-full h-full border-none"
          title={`Workspace ${id}`}
          allow="accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; payment; usb; vr; xr-spatial-tracking"
          sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
        />
      </div>
    </div>
  );
}
