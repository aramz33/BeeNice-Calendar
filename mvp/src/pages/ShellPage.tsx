import type { ComponentType } from "react";
import { Link } from "react-router";
import {
  ArrowRight,
  BrainCircuit,
  CalendarSync,
  ShieldCheck,
  TimerReset,
} from "lucide-react";
import { Button } from "@shared-ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared-ui/card";
import { AppChrome } from "@mvp/components/AppChrome";
import { BeeNiceLogo } from "@mvp/components/BeeNiceLogo";

export function ShellPage() {
  return (
    <AppChrome
      title="Hub agenda BeeNice"
      subtitle="Un workspace caller simple, un agenda admin live et une file de tâches de repositionnement alignée sur le calendrier client."
    >
      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="surface-card rounded-[2rem]">
          <CardContent className="flex flex-col gap-8 pt-6">
            <div className="space-y-4">
              <BeeNiceLogo />
              <p className="inline-flex rounded-full border border-[#001E5B]/10 bg-[#F9F4ED] px-3 py-1 text-xs uppercase tracking-[0.2em] text-[#001E5B]">
                BeeNice agenda hub
              </p>
              <h2 className="max-w-3xl font-display text-5xl tracking-[-0.08em] text-[#001E5B] md:text-6xl">
                Réserver vite, voir les déplacements live, relancer sans perdre le fil.
              </h2>
              <p className="max-w-2xl text-base text-[#001E5B]/68 md:text-lg">
                Cette version couvre la disponibilité consolidée, le routing métier,
                l’agenda admin synchronisé et les tâches automatiques pour
                repositionner les rendez-vous annulés ou no-show.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <FeatureCard
                icon={CalendarSync}
                title="Disponibilité consolidée"
                description="Créneaux live sans choix manuel du rep."
              />
              <FeatureCard
                icon={BrainCircuit}
                title="Routing opérationnel"
                description="Qualification société et assignation pondérée."
              />
              <FeatureCard
                icon={ShieldCheck}
                title="Agenda admin"
                description="Liste + agenda semaine connectés aux calendriers clients."
              />
              <FeatureCard
                icon={TimerReset}
                title="Tâches de relance"
                description="No-show et annulations renvoyés au caller d’origine."
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
          <Card className="surface-card">
            <CardHeader>
              <CardTitle>Ce que le MVP prouve</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-[#001E5B]/64">
              <p>1. Un caller choisit un créneau et qualifie le compte sans gérer l’agenda du rep.</p>
              <p>2. Le backend choisit le bon rep selon la qualification et le load balancing.</p>
              <p>3. L’admin voit ensuite le cycle complet: planifié, déplacé, honoré, annulé, relancé.</p>
            </CardContent>
          </Card>

          <Card className="surface-card">
            <CardHeader>
              <CardTitle>Runbook</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-[#001E5B]/64">
              <p>`npm run dev` lance le frontend et l’API locale.</p>
              <p>`MVP_CALENDAR_PROVIDER=mock` est le mode par défaut pour le dev.</p>
              <p>Le backend supporte le mode `mock` pour simuler annulations et déplacements.</p>
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
    <div className="rounded-[1.5rem] border border-[#001E5B]/8 bg-white p-5">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFF3DA] text-[#F7A600]">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-base font-semibold text-[#001E5B]">{title}</h3>
      <p className="mt-2 text-sm text-[#001E5B]/60">{description}</p>
    </div>
  );
}
