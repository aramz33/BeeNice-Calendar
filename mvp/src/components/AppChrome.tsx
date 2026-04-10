import type { ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { CalendarDays, LayoutDashboard, Moon, Sun } from "lucide-react";
import { Button } from "@shared-ui/button";
import { useTheme } from "@shared-hooks/useTheme";

interface AppChromeProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

export function AppChrome({ title, subtitle, children }: AppChromeProps) {
  const { theme, setTheme } = useTheme();

  return (
    <div className="min-h-screen px-4 py-4 md:px-6">
      <header className="glass-card sticky top-4 z-20 mb-6 rounded-[1.5rem] px-4 py-4 md:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <Link to="/" className="text-lg font-semibold tracking-tight">
                Be Nice MVP
              </Link>
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <NavLink to="/book/teamstarter-discovery">
              {({ isActive }) => (
                <Button variant={isActive ? "default" : "outline"} size="sm">
                  Workspace caller
                </Button>
              )}
            </NavLink>
            <NavLink to="/admin/bookings">
              {({ isActive }) => (
                <Button variant={isActive ? "default" : "outline"} size="sm">
                  <LayoutDashboard className="h-4 w-4" />
                  Admin
                </Button>
              )}
            </NavLink>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title="Changer le thème"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
        <div className="mt-4">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}
