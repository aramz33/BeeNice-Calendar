import type { ComponentType } from "react";
import { Link } from "react-router";
import { ArrowRight, BrainCircuit, CalendarSync, ShieldCheck } from "lucide-react";
import { Button } from "@shared-ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared-ui/card";
import { AppChrome } from "@mvp/components/AppChrome";

export function ShellPage() {
  return (
    <AppChrome
      title="Hub calendrier interne pour Be Nice"
      subtitle="MVP isolé dans /mvp avec booking caller, routing et supervision admin."
    >
      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="glass-card rounded-[2rem] border-white/10">
          <CardContent className="flex flex-col gap-8 pt-6">
            <div className="space-y-4">
              <p className="inline-flex rounded-full border border-primary/25 bg-primary/12 px-3 py-1 text-xs uppercase tracking-[0.2em] text-primary">
                Calendly replacement MVP
              </p>
              <h2 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">
                Un lien par client, des créneaux live pour les callers, une vue
                admin consolidée pour Be Nice.
              </h2>
              <p className="max-w-2xl text-base text-muted-foreground md:text-lg">
                Cette version travaille sur un client seedé, un routing pondéré
                avec règle de qualification et un historique de statuts exploitable
                en coaching.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <FeatureCard
                icon={CalendarSync}
                title="Disponibilité consolidée"
                description="Créneaux fusionnés en direct, buffers inclus, avec disparition instantanée via SSE."
              />
              <FeatureCard
                icon={BrainCircuit}
                title="Routing opérationnel"
                description="Règle company size ≥ 200 => seniors, puis pondération 80/20 sur les reps éligibles."
              />
              <FeatureCard
                icon={ShieldCheck}
                title="Supervision interne"
                description="Attribution caller, statuts post-rendez-vous, historique immuable et vue admin dédiée."
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="rounded-full px-6">
                <Link to="/book/teamstarter-discovery">
                  Ouvrir le workspace caller
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="rounded-full px-6">
                <Link to="/admin/bookings">Voir la console admin</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="glass-card rounded-[1.5rem] border-white/10">
            <CardHeader>
              <CardTitle>Ce que le MVP prouve</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>1. Un caller choisit un critère de qualification puis réserve un créneau live.</p>
              <p>2. Le backend choisit automatiquement le bon rep à partir de la règle et des poids.</p>
              <p>3. L’admin voit immédiatement qui a booké, pour quel client, avec quel résultat.</p>
            </CardContent>
          </Card>

          <Card className="glass-card rounded-[1.5rem] border-white/10">
            <CardHeader>
              <CardTitle>Runbook</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>`npm run dev` lance le frontend et l’API locale.</p>
              <p>`MVP_CALENDAR_PROVIDER=mock` est le mode par défaut pour le dev.</p>
              <p>Le backend est Nylas-ready mais fonctionne sans credentials pour la démo locale.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppChrome>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-background/35 p-5">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/12 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
