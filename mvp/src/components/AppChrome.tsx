import type { ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { LayoutDashboard, Settings2 } from "lucide-react";
import { Button } from "@shared-ui/button";
import { BeeNiceLogo } from "@mvp/components/BeeNiceLogo";

interface AppChromeProps {
  title: string;
  children: ReactNode;
}

function NavButton({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}): ReactNode {
  return (
    <NavLink to={to}>
      {({ isActive }) => (
        <Button
          variant="outline"
          size="sm"
          className={
            isActive
              ? "rounded-full border-transparent bg-[#F7A600] text-[#001E5B] hover:bg-[#FFC755]"
              : "rounded-full border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
          }
        >
          {children}
        </Button>
      )}
    </NavLink>
  );
}

export function AppChrome({ title, children }: AppChromeProps) {
  return (
    <div className="min-h-screen">
      <header className="app-shell sticky top-0 z-20 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 md:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              to="/"
              className="inline-flex shrink-0 items-center text-lg font-semibold tracking-tight"
            >
              <BeeNiceLogo compact theme="amber" />
            </Link>
            <h1 className="min-w-0 font-display text-2xl tracking-[-0.08em] text-white md:text-4xl">
              {title}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <NavButton to="/">Accueil</NavButton>
            <NavButton to="/admin/bookings">
              <LayoutDashboard className="h-4 w-4" />
              Admin
            </NavButton>
            <NavButton to="/admin/settings">
              <Settings2 className="h-4 w-4" />
              Paramètres
            </NavButton>
          </div>
        </div>
      </header>

      <main className="px-4 pb-4 md:px-6 md:pb-6">{children}</main>
    </div>
  );
}
