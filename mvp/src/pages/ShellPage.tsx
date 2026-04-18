import { Link } from "react-router";
import { Button } from "@shared-ui/button";
import { AppChrome } from "@mvp/components/AppChrome";

export function ShellPage() {
  return (
    <AppChrome title="Be nice agenda hub">
      <div className="mx-auto flex min-h-[calc(100vh-13rem)] max-w-2xl items-center justify-center">
        <div className="surface-card w-full rounded-[2rem] px-6 py-8 md:px-8 md:py-10">
          <div className="space-y-4">
            <Button asChild size="lg" className="w-full rounded-full px-6">
              <Link to="/book/teamstarter-discovery">
                Workspace caller · TeamStarter
              </Link>
            </Button>

            <Button asChild size="lg" className="w-full rounded-full px-6">
              <Link to="/book/doctolib-discovery">
                Workspace caller · Doctolib
              </Link>
            </Button>

            <Button
              asChild
              variant="outline"
              size="lg"
              className="w-full rounded-full px-6"
            >
              <Link to="/admin/bookings">Console admin</Link>
            </Button>
          </div>
        </div>
      </div>
    </AppChrome>
  );
}
