import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { BeeNiceLogo } from "@mvp/components/BeeNiceLogo";
import { Button } from "@mvp/components/ui/button";
import { Input } from "@mvp/components/ui/input";
import { Label } from "@mvp/components/ui/label";
import { signIn } from "@mvp/lib/auth";
import { useSession } from "@mvp/lib/session";

function roleHome(role: "admin" | "caller"): string {
  return role === "admin" ? "/admin/bookings" : "/caller";
}

export function LoginPage() {
  const navigate = useNavigate();
  const { session, loading, refresh } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading || !session) return;
    navigate(roleHome(session.user.role), { replace: true });
  }, [session, loading, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const result = await signIn(email, password);
      refresh();
      navigate(roleHome(result.user.role), { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connexion impossible.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#FFFDF9] px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-4">
          <BeeNiceLogo compact theme="amber" className="h-16 w-16" />
          <h1 className="font-display text-3xl tracking-[-0.08em] text-[#001E5B]">
            bee nice
          </h1>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-[2rem] border border-[#001E5B]/08 bg-white px-6 py-8 shadow-[0_8px_32px_rgba(0,30,91,0.08)]"
        >
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@beeniceagency.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <Button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full"
          >
            {submitting ? "Connexion…" : "Se connecter"}
          </Button>
        </form>
      </div>
    </div>
  );
}
