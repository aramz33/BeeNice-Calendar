import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { BellRing, CalendarClock, Orbit, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@shared-ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared-ui/card";
import { Input } from "@shared-ui/input";
import { Label } from "@shared-ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared-ui/select";
import { Textarea } from "@shared-ui/textarea";
import { Badge } from "@shared-ui/badge";
import { AppChrome } from "@mvp/components/AppChrome";
import { MetricCard } from "@mvp/components/MetricCard";
import { SlotPicker } from "@mvp/components/SlotPicker";
import { StatusBadge } from "@mvp/components/StatusBadge";
import { apiFetch } from "@mvp/lib/api";
import { formatDateTime, formatRelativeShort } from "@mvp/lib/time";
import type {
  AvailabilityResponse,
  BookingLinkResponse,
  BookingStatus,
  CallerBookingsResponse,
} from "@mvp/lib/types";

const COMPANY_SIZE_OPTIONS = [
  { label: "1 à 49 salariés", value: "49" },
  { label: "50 à 199 salariés", value: "150" },
  { label: "200 à 499 salariés", value: "250" },
  { label: "500+ salariés", value: "500" },
];

const CALLER_STORAGE_KEY = "benice-mvp-caller";

const ACTION_STATUSES: BookingStatus[] = [
  "no_show",
  "cancelled",
  "rescheduled",
];

export function BookingWorkspacePage() {
  const { slug = "teamstarter-discovery" } = useParams();
  const [payload, setPayload] = useState<BookingLinkResponse | null>(null);
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(
    null,
  );
  const [recentBookings, setRecentBookings] =
    useState<CallerBookingsResponse | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [callerId, setCallerId] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [prospectName, setProspectName] = useState("");
  const [prospectEmail, setProspectEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [notes, setNotes] = useState("");

  const timezone = payload?.bookingLink.timezone ?? "Europe/Paris";
  const selectedSlotLabel = selectedSlot
    ? formatDateTime(selectedSlot, timezone)
    : "Aucun créneau sélectionné";

  useEffect(() => {
    let ignore = false;
    setLoadingMeta(true);
    apiFetch<BookingLinkResponse>(`/api/book/${slug}`)
      .then((data) => {
        if (ignore) {
          return;
        }
        setPayload(data);
        const stored = window.localStorage.getItem(CALLER_STORAGE_KEY);
        const firstCaller =
          stored && data.callers.some((caller) => caller.id === stored)
            ? stored
            : (data.callers[0]?.id ?? "");
        setCallerId(firstCaller);
      })
      .catch((error) => toast.error(error.message))
      .finally(() => {
        if (!ignore) {
          setLoadingMeta(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!callerId) {
      return;
    }
    window.localStorage.setItem(CALLER_STORAGE_KEY, callerId);
  }, [callerId]);

  const fetchAvailability = async () => {
    if (!companySize) {
      setAvailability(null);
      setSelectedSlot(null);
      return;
    }

    setLoadingAvailability(true);

    try {
      const params = new URLSearchParams({
        companySize,
      });
      const data = await apiFetch<AvailabilityResponse>(
        `/api/book/${slug}/availability?${params.toString()}`,
      );
      setAvailability(data);
      setSelectedSlot((current) =>
        current && data.slots.some((slot) => slot.startAt === current)
          ? current
          : null,
      );
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoadingAvailability(false);
    }
  };

  const fetchRecentBookings = async () => {
    if (!callerId) {
      setRecentBookings(null);
      return;
    }

    try {
      const data = await apiFetch<CallerBookingsResponse>(
        `/api/book/${slug}/callers/${callerId}/bookings`,
      );
      setRecentBookings(data);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  useEffect(() => {
    void fetchAvailability();
  }, [slug, companySize]);

  useEffect(() => {
    void fetchRecentBookings();
  }, [slug, callerId]);

  useEffect(() => {
    const source = new EventSource(`/api/book/${slug}/stream`);

    source.addEventListener("availability.updated", () => {
      void fetchAvailability();
      void fetchRecentBookings();
    });

    source.onerror = () => {
      source.close();
      setTimeout(() => {
        void fetchAvailability();
      }, 1000);
    };

    return () => source.close();
  }, [slug, callerId, companySize]);

  const eligiblePoolLabel = useMemo(() => {
    if (!companySize || !payload) {
      return "Choisissez une tranche";
    }

    return Number(companySize) >= payload.bookingLink.companySizeThreshold
      ? "Pool senior uniquement"
      : "Pool complet";
  }, [companySize, payload]);

  const sortedRecentBookings = useMemo(() => {
    if (!recentBookings?.bookings) return [];
    return [...recentBookings.bookings].sort((a, b) => {
      const aAction = ACTION_STATUSES.includes(a.status) ? 0 : 1;
      const bAction = ACTION_STATUSES.includes(b.status) ? 0 : 1;
      return aAction - bAction;
    });
  }, [recentBookings]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!selectedSlot) {
      toast.error("Choisissez un créneau avant de réserver.");
      return;
    }

    if (
      !callerId ||
      !companySize ||
      !prospectName ||
      !prospectEmail ||
      !companyName
    ) {
      toast.error("Complétez les informations prospect obligatoires.");
      return;
    }

    setSubmitting(true);

    try {
      const result = await apiFetch<{
        bookingId: string;
        assignedRepName: string;
      }>(`/api/book/${slug}/bookings`, {
        method: "POST",
        body: JSON.stringify({
          callerId,
          companySize: Number(companySize),
          companyName,
          prospectName,
          prospectEmail,
          notes,
          slotStart: selectedSlot,
        }),
      });

      toast.success(`Rendez-vous réservé chez ${result.assignedRepName}.`);
      setProspectName("");
      setProspectEmail("");
      setCompanyName("");
      setNotes("");
      setSelectedSlot(null);
      await Promise.all([fetchAvailability(), fetchRecentBookings()]);
    } catch (error) {
      toast.error((error as Error).message);
      await fetchAvailability();
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingMeta || !payload) {
    return (
      <AppChrome
        title="Chargement du workspace caller"
        subtitle="Récupération de la configuration du client et des callers."
      >
        <div className="grid gap-6 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="glass-card h-52 animate-pulse rounded-[1.5rem]"
            />
          ))}
        </div>
      </AppChrome>
    );
  }

  return (
    <AppChrome
      title={`${payload.bookingLink.clientName} · Workspace caller`}
      subtitle="Un seul lien, des créneaux live consolidés, un routing invisible pour le caller."
    >
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.35fr]">
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-1">
            <MetricCard
              label="Lien"
              value={payload.bookingLink.slug}
              helper="Un slug unique par client pour l’équipe caller."
            />
            <MetricCard
              label="Routing"
              value="80 / 20"
              helper={`Qualification à partir de ${payload.bookingLink.companySizeThreshold} salariés.`}
            />
            <MetricCard
              label="Calendriers"
              value={payload.bookingLink.reps.length}
              helper={`${payload.bookingLink.providerMode === "mock" ? "Mode mock" : "Mode Nylas"} actif.`}
            />
          </div>

          <Card className="glass-card rounded-[1.5rem] border-white/10">
            <CardHeader>
              <CardTitle>Contexte d’appel</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="caller">Caller</Label>
                    <Select value={callerId} onValueChange={setCallerId}>
                      <SelectTrigger id="caller">
                        <SelectValue placeholder="Choisir un caller" />
                      </SelectTrigger>
                      <SelectContent>
                        {payload.callers.map((caller) => (
                          <SelectItem key={caller.id} value={caller.id}>
                            {caller.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company-size">Taille de société</Label>
                    <Select value={companySize} onValueChange={setCompanySize}>
                      <SelectTrigger id="company-size">
                        <SelectValue placeholder="Choisir une tranche" />
                      </SelectTrigger>
                      <SelectContent>
                        {COMPANY_SIZE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="rounded-[1.25rem] border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <Orbit className="h-4 w-4 text-primary" />
                    Pool de qualification actif
                  </div>
                  <p className="mt-2">{eligiblePoolLabel}</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="prospect-name">Nom du prospect</Label>
                    <Input
                      id="prospect-name"
                      value={prospectName}
                      onChange={(event) => setProspectName(event.target.value)}
                      placeholder="Ex. Anne Dubois"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prospect-email">Email</Label>
                    <Input
                      id="prospect-email"
                      type="email"
                      value={prospectEmail}
                      onChange={(event) => setProspectEmail(event.target.value)}
                      placeholder="anne@entreprise.com"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company-name">Société</Label>
                  <Input
                    id="company-name"
                    value={companyName}
                    onChange={(event) => setCompanyName(event.target.value)}
                    placeholder="Ex. Doctolib"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Contexte call</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Rappeler avant le rendez-vous, besoin centré sur l’acquisition outbound..."
                    rows={4}
                  />
                </div>

                <div className="rounded-[1.25rem] border border-white/10 bg-background/30 px-4 py-4">
                  <p className="text-sm font-medium">Créneau sélectionné</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {selectedSlotLabel}
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full rounded-full"
                  disabled={submitting || !selectedSlot}
                >
                  {submitting
                    ? "Réservation en cours..."
                    : "Réserver le rendez-vous"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="glass-card rounded-[1.5rem] border-white/10">
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle>Rendez-vous du caller</CardTitle>
                <p className="mt-2 text-sm text-muted-foreground">
                  Historique récent pour le client en cours.
                </p>
              </div>
              <Badge variant="outline" className="border-white/10">
                <Users className="mr-1 h-3 w-3" />
                {recentBookings?.bookings.length ?? 0}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {sortedRecentBookings.length ? (
                sortedRecentBookings.map((booking) => {
                  const needsAction = ACTION_STATUSES.includes(booking.status);
                  return (
                    <div
                      key={booking.id}
                      className={`rounded-[1.25rem] border px-4 py-3 ${
                        needsAction
                          ? "border-amber-400/30 bg-amber-400/5"
                          : "border-white/10 bg-background/25"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{booking.companyName}</p>
                            {needsAction && (
                              <Badge className="border-amber-400/40 bg-amber-400/10 text-amber-400 text-xs">
                                À relancer
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {booking.prospectName} · {booking.assignedRepName}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatRelativeShort(booking.startAt)}
                          </p>
                        </div>
                        <StatusBadge status={booking.status} />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-[1.25rem] border border-dashed border-white/10 px-4 py-6 text-sm text-muted-foreground">
                  Aucun rendez-vous récent pour ce caller sur ce client.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <SlotPicker
            availability={availability}
            selectedSlot={selectedSlot}
            onSelect={setSelectedSlot}
            loading={loadingAvailability}
          />

          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <Card className="glass-card rounded-[1.5rem] border-white/10">
              <CardHeader>
                <CardTitle>Pool de reps connectés</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {payload.bookingLink.reps.map((rep) => (
                  <div
                    key={rep.id}
                    className="flex items-center justify-between rounded-[1.25rem] border border-white/10 bg-background/25 px-4 py-3"
                  >
                    <div>
                      <p className="font-medium">{rep.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {rep.seniority === "senior" ? "Senior" : "Junior"}
                      </p>
                    </div>
                    <Badge variant="outline" className="border-white/10">
                      {rep.connectionStatus}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="glass-card rounded-[1.5rem] border-white/10">
              <CardHeader>
                <CardTitle>Garanties MVP</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                  <CalendarClock className="mt-0.5 h-4 w-4 text-primary" />
                  <p>
                    Le slot affiché est recalculé à partir du pool éligible
                    selon la taille de société.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <BellRing className="mt-0.5 h-4 w-4 text-primary" />
                  <p>
                    Les autres pages ouvertes reçoivent une mise à jour live dès
                    qu’un booking valide le créneau.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <Users className="mt-0.5 h-4 w-4 text-primary" />
                  <p>
                    Le rep est choisi automatiquement. Le caller ne voit jamais
                    la complexité de dispatch.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppChrome>
  );
}
