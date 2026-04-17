import type { ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { LayoutDashboard, Settings2 } from "lucide-react";
import { Button } from "@shared-ui/button";
import { BeeNiceLogo } from "@mvp/components/BeeNiceLogo";

interface AppChromeProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

export function AppChrome({ title, subtitle, children }: AppChromeProps) {
  return (
    <div className="min-h-screen px-4 py-4 md:px-6">
      <header className="app-shell sticky top-4 z-20 mb-6 rounded-[2rem] px-5 py-5 md:px-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div>
              <Link to="/" className="inline-flex items-center gap-3 text-lg font-semibold tracking-tight">
                <BeeNiceLogo compact />
              </Link>
              <p className="mt-3 max-w-2xl text-sm text-[#001E5B]/64">{subtitle}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <NavLink to="/book/teamstarter-discovery">
              {({ isActive }) => (
                <Button variant={isActive ? "default" : "outline"} size="sm" className="rounded-full">
                  Workspace caller
                </Button>
              )}
            </NavLink>
            <NavLink to="/admin/bookings">
              {({ isActive }) => (
                <Button variant={isActive ? "default" : "outline"} size="sm" className="rounded-full">
                  <LayoutDashboard className="h-4 w-4" />
                  Admin
                </Button>
              )}
            </NavLink>
            <NavLink to="/admin/settings">
              {({ isActive }) => (
                <Button variant={isActive ? "default" : "outline"} size="sm" className="rounded-full">
                  <Settings2 className="h-4 w-4" />
                  Paramètres
                </Button>
              )}
            </NavLink>
          </div>
        </div>
        <div className="mt-4">
          <h1 className="font-display text-4xl tracking-[-0.08em] text-[#001E5B] md:text-5xl">
            {title}
          </h1>
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}
