import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router";
import {
  Cable,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@mvp/components/ui/button";
import { BeeNiceLogo } from "@mvp/components/BeeNiceLogo";
import { signOut } from "@mvp/lib/auth";
import { useSession } from "@mvp/lib/session";

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
              : "rounded-full border-[#001E5B]/15 bg-transparent text-[#001E5B]/64 hover:bg-[#001E5B]/06 hover:text-[#001E5B]"
          }
        >
          {children}
        </Button>
      )}
    </NavLink>
  );
}

export function AppChrome({ title, children }: AppChromeProps) {
  const { session } = useSession();
  const [signingOut, setSigningOut] = useState(false);

  const logoHref =
    session?.user.role === "admin"
      ? "/admin/bookings"
      : session?.user.role === "caller"
        ? "/caller"
        : "/";

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      window.location.replace("/login");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Déconnexion impossible. Réessayez.",
      );
      setSigningOut(false);
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="app-shell sticky top-0 z-20 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 md:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              to={logoHref}
              className="inline-flex shrink-0 items-center text-lg font-semibold tracking-tight"
            >
              <BeeNiceLogo compact />
            </Link>
            <h1 className="min-w-0 font-display text-2xl tracking-[-0.08em] text-[#001E5B] md:text-4xl">
              {title}
            </h1>
          </div>

          {session && (
            <div className="flex flex-wrap items-center gap-2">
              {session.user.role === "admin" && (
                <>
                  <NavButton to="/admin/bookings">
                    <LayoutDashboard className="h-4 w-4" />
                    Admin
                  </NavButton>
                  <SettingsMenu />
                </>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full border-[#001E5B]/15 bg-transparent text-[#001E5B]/64 hover:bg-[#001E5B]/06 hover:text-[#001E5B]"
                onClick={handleSignOut}
                disabled={signingOut}
              >
                <LogOut className="h-4 w-4" />
                {signingOut ? "Déconnexion..." : "Déconnexion"}
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4 md:px-6 md:pb-6">
        {children}
      </main>
    </div>
  );
}

function SettingsMenu(): ReactNode {
  const location = useLocation();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const active = location.pathname.startsWith("/admin/settings");

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (
        menuRef.current &&
        event.target instanceof Node &&
        !menuRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={
          active
            ? "rounded-full border-transparent bg-[#F7A600] text-[#001E5B] hover:bg-[#FFC755]"
            : "rounded-full border-[#001E5B]/15 bg-transparent text-[#001E5B]/64 hover:bg-[#001E5B]/06 hover:text-[#001E5B]"
        }
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        <Settings2 className="h-4 w-4" />
        Paramètres
        <ChevronDown className="h-4 w-4" />
      </Button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-56 rounded-xl border border-[#001E5B]/10 bg-[#FFFDF9] p-1 shadow-[0_18px_48px_rgba(0,30,91,0.18)]"
        >
          <SettingsMenuLink
            to="/admin/settings"
            active={location.pathname === "/admin/settings"}
          >
            <Settings2 className="h-4 w-4" />
            Clients / callers
          </SettingsMenuLink>
          <SettingsMenuLink
            to="/admin/settings/connections"
            active={location.pathname === "/admin/settings/connections"}
          >
            <Cable className="h-4 w-4" />
            Connexions
          </SettingsMenuLink>
        </div>
      ) : null}
    </div>
  );
}

function SettingsMenuLink({
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: ReactNode;
}): ReactNode {
  return (
    <Link
      to={to}
      role="menuitem"
      className={
        active
          ? "flex min-h-10 items-center gap-2 rounded-lg bg-[#F7A600] px-3 py-2 text-sm font-medium text-[#001E5B]"
          : "flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[#001E5B] hover:bg-[#F9F4ED]"
      }
    >
      {children}
    </Link>
  );
}
