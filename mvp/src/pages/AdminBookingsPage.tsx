import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Cable, ChartColumn, Clock3, Filter } from "lucide-react";
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
import { AppChrome } from "@mvp/components/AppChrome";
import { MetricCard } from "@mvp/components/MetricCard";
import { StatusBadge } from "@mvp/components/StatusBadge";
import { apiFetch } from "@mvp/lib/api";
import { formatDateTime, formatRelativeShort } from "@mvp/lib/time";
import type {
  AdminBookingsResponse,
  BookingDetailResponse,
  BookingStatus,
  StartRepConnectionResponse,
} from "@mvp/lib/types";

export function AdminBookingsPage() {
  const [payload, setPayload] = useState<AdminBookingsResponse | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BookingDetailResponse | null>(null);
  const [statusReason, setStatusReason] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [connectingRepId, setConnectingRepId] = useState<string | null>(null);
  const [providerChoiceByRep, setProviderChoiceByRep] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState({
    status: "all",
    callerId: "all",
    repId: "all",
    query: "",
  });

  const fetchBookings = async () => {
    setLoadingList(true);
    try {
      const params = new URLSearchParams();
      if (filters.status !== "all") {
        params.set("status", filters.status);
      }
      if (filters.callerId !== "all") {
        params.set("callerId", filters.callerId);
      }
      if (filters.repId !== "all") {
        params.set("repId", filters.repId);
      }
      if (filters.query) {
        params.set("query", filters.query);
      }

      const data = await apiFetch<AdminBookingsResponse>(
        `/api/admin/bookings?${params.toString()}`,
      );
      setPayload(data);
      setSelectedBookingId((current) => {
        if (current && data.bookings.some((booking) => booking.id === current)) {
          return current;
        }
        return data.bookings[0]?.id ?? null;
      });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoadingList(false);
    }
  };

  const fetchDetail = async (bookingId: string) => {
    setLoadingDetail(true);
    try {
      const data = await apiFetch<BookingDetailResponse>(`/api/admin/bookings/${bookingId}`);
      setDetail(data);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    void fetchBookings();
  }, [filters.status, filters.callerId, filters.repId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetchBookings();
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [filters.query]);

  useEffect(() => {
    if (!selectedBookingId) {
      setDetail(null);
      return;
    }

    void fetchDetail(selectedBookingId);
  }, [selectedBookingId]);

  const handleStatusChange = async (status: BookingStatus) => {
    if (!detail) {
      return;
    }

    setUpdatingStatus(true);
    try {
      await apiFetch(`/api/admin/bookings/${detail.booking.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          reason: statusReason,
        }),
      });
      toast.success("Statut mis à jour.");
      setStatusReason("");
      await fetchBookings();
      await fetchDetail(detail.booking.id);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleConnectRep = async (repId: string) => {
    setConnectingRepId(repId);
    try {
      const result = await apiFetch<StartRepConnectionResponse>(
        `/api/admin/reps/${repId}/connect-nylas/start`,
        {
          method: "POST",
          body: JSON.stringify({
            provider: providerChoiceByRep[repId] ?? "google",
          }),
        },
      );

      if (result.authUrl) {
        window.location.assign(result.authUrl);
        return;
      }

      toast.success("Connexion calendrier simulée activée.");
      await fetchBookings();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setConnectingRepId(null);
    }
  };

  const liveConnectedCount = useMemo(
    () => payload?.filters.reps.filter((rep) => rep.connectionStatus === "connected").length ?? 0,
    [payload],
  );
  const integrationMode = payload?.integrations.providerMode ?? "mock";
  const nylasConfigured = payload?.integrations.nylasConfigured ?? false;

  useEffect(() => {
    if (!payload) {
      return;
    }

    setProviderChoiceByRep((current) => {
      const next = { ...current };
      payload.filters.reps.forEach((rep) => {
        if (!next[rep.id]) {
          next[rep.id] =
            rep.provider === "microsoft" || rep.provider === "google"
              ? rep.provider
              : "google";
        }
      });
      return next;
    });
  }, [payload]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const connectionError = params.get("connectionError");

    if (connected) {
      toast.success("Connexion calendrier terminée.");
      params.delete("connected");
      const next = params.toString();
      window.history.replaceState({}, "", next ? `/admin/bookings?${next}` : "/admin/bookings");
      void fetchBookings();
    }

    if (connectionError) {
      toast.error(connectionError);
      params.delete("connectionError");
      const next = params.toString();
      window.history.replaceState({}, "", next ? `/admin/bookings?${next}` : "/admin/bookings");
    }
  }, []);

  return (
    <AppChrome
      title="Console admin bookings"
      subtitle="Supervision consolidée par caller, rep, résultat et historique de statut."
    >
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          label="Réservés"
          value={payload?.counts.booked ?? 0}
          helper="Volume actuel dans le pipe."
        />
        <MetricCard
          label="Validés"
          value={payload?.counts.completed ?? 0}
          helper="Rendez-vous menés à terme."
        />
        <MetricCard
          label="À replacer"
          value={(payload?.counts.no_show ?? 0) + (payload?.counts.cancelled ?? 0)}
          helper="No-show + annulations à relancer."
        />
        <MetricCard
          label="Connexions"
          value={liveConnectedCount}
          helper="Reps connectés et actifs dans le pool."
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="space-y-6">
          <Card className="glass-card rounded-[1.5rem] border-white/10">
            <CardHeader>
              <CardTitle>Filtres</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="query">Recherche</Label>
                <Input
                  id="query"
                  placeholder="Société, prospect..."
                  value={filters.query}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, query: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status-filter">Statut</Label>
                <Select
                  value={filters.status}
                  onValueChange={(value) =>
                    setFilters((current) => ({ ...current, status: value }))
                  }
                >
                  <SelectTrigger id="status-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les statuts</SelectItem>
                    {payload?.filters.statuses.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="caller-filter">Caller</Label>
                <Select
                  value={filters.callerId}
                  onValueChange={(value) =>
                    setFilters((current) => ({ ...current, callerId: value }))
                  }
                >
                  <SelectTrigger id="caller-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les callers</SelectItem>
                    {payload?.filters.callers.map((caller) => (
                      <SelectItem key={caller.id} value={caller.id}>
                        {caller.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rep-filter">Rep</Label>
                <Select
                  value={filters.repId}
                  onValueChange={(value) =>
                    setFilters((current) => ({ ...current, repId: value }))
                  }
                >
                  <SelectTrigger id="rep-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les reps</SelectItem>
                    {payload?.filters.reps.map((rep) => (
                      <SelectItem key={rep.id} value={rep.id}>
                        {rep.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card rounded-[1.5rem] border-white/10">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Bookings</CardTitle>
                <p className="mt-2 text-sm text-muted-foreground">
                  Attribution caller + rep, statut courant et heure de rendez-vous.
                </p>
              </div>
              <div className="rounded-full border border-white/10 px-3 py-1 text-xs text-muted-foreground">
                {payload?.bookings.length ?? 0} résultat
                {(payload?.bookings.length ?? 0) > 1 ? "s" : ""}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingList ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-24 animate-pulse rounded-[1.25rem] bg-muted/60"
                  />
                ))
              ) : payload?.bookings.length ? (
                payload.bookings.map((booking) => {
                  const selected = booking.id === selectedBookingId;
                  return (
                    <button
                      key={booking.id}
                      type="button"
                      className={`w-full rounded-[1.25rem] border px-4 py-4 text-left transition ${
                        selected
                          ? "border-primary/40 bg-primary/10"
                          : "border-white/10 bg-background/20 hover:bg-background/35"
                      }`}
                      onClick={() => setSelectedBookingId(booking.id)}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{booking.companyName}</p>
                            <StatusBadge status={booking.status} />
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {booking.prospectName} · {booking.callerName} → {booking.assignedRepName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatRelativeShort(booking.startAt)}
                          </p>
                        </div>
                        <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-[1.25rem] border border-dashed border-white/10 px-4 py-6 text-sm text-muted-foreground">
                  Aucun booking ne correspond à ces filtres.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="glass-card rounded-[1.5rem] border-white/10">
            <CardHeader>
              <CardTitle>État des connexions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-[1.25rem] border border-white/10 bg-background/20 px-4 py-3 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">
                  Mode {integrationMode === "nylas" ? "Nylas" : "mock"}
                </p>
                <p className="mt-2">
                  {integrationMode === "nylas"
                    ? nylasConfigured
                      ? "Les connexions rep ouvrent le flow Hosted OAuth Nylas."
                      : "Configuration Nylas incomplète côté serveur. Renseignez les variables d'environnement avant de connecter un rep."
                    : "Le MVP peut simuler une connexion calendrier sans dépendance externe."}
                </p>
              </div>
              {payload?.filters.reps.map((rep) => (
                <div
                  key={rep.id}
                  className="rounded-[1.25rem] border border-white/10 bg-background/20 px-4 py-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="font-medium">{rep.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {rep.seniority === "senior" ? "Senior" : "Junior"}
                        {rep.providerEmail ? ` · ${rep.providerEmail}` : ""}
                      </p>
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        <p>
                          Dernière synchro:{" "}
                          {rep.lastSyncAt
                            ? formatRelativeShort(rep.lastSyncAt)
                            : "jamais"}
                        </p>
                        <p>
                          Dernier webhook:{" "}
                          {rep.lastWebhookAt
                            ? formatRelativeShort(rep.lastWebhookAt)
                            : "aucun"}
                        </p>
                        {rep.lastError ? <p>Erreur: {rep.lastError}</p> : null}
                      </div>
                    </div>
                    <div className="min-w-[16rem] space-y-3">
                      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Cable className="h-4 w-4" />
                          {rep.connectionStatus}
                        </div>
                        <span className="rounded-full border border-white/10 px-2 py-1 text-xs uppercase tracking-[0.14em]">
                          {rep.provider}
                        </span>
                      </div>

                      {integrationMode === "nylas" ? (
                        <div className="space-y-2">
                          <Label htmlFor={`provider-${rep.id}`}>Provider</Label>
                          <Select
                            value={providerChoiceByRep[rep.id] ?? "google"}
                            onValueChange={(value) =>
                              setProviderChoiceByRep((current) => ({
                                ...current,
                                [rep.id]: value,
                              }))
                            }
                          >
                            <SelectTrigger id={`provider-${rep.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="google">Google</SelectItem>
                              <SelectItem value="microsoft">Microsoft</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}

                      <Button
                        type="button"
                        className="w-full rounded-full"
                        variant={rep.connectionStatus === "connected" ? "outline" : "default"}
                        disabled={
                          connectingRepId === rep.id ||
                          (integrationMode === "nylas" && !nylasConfigured)
                        }
                        onClick={() => void handleConnectRep(rep.id)}
                      >
                        {connectingRepId === rep.id
                          ? "Connexion..."
                          : rep.connectionStatus === "connected"
                            ? integrationMode === "nylas"
                              ? "Reconnecter via Nylas"
                              : "Reconnecter en mock"
                            : integrationMode === "nylas"
                              ? "Connecter via Nylas"
                              : "Simuler la connexion"}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="glass-card rounded-[1.5rem] border-white/10">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Détail booking</CardTitle>
                <p className="mt-2 text-sm text-muted-foreground">
                  Historique complet et changement de statut manuel.
                </p>
              </div>
              <ChartColumn className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingDetail ? (
                <div className="h-56 animate-pulse rounded-[1.25rem] bg-muted/60" />
              ) : detail ? (
                <>
                  <div className="rounded-[1.25rem] border border-white/10 bg-background/20 px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-lg font-semibold">{detail.booking.companyName}</p>
                          <StatusBadge status={detail.booking.status} />
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {detail.booking.prospectName} · {detail.booking.prospectEmail}
                        </p>
                      </div>
                      <div className="text-right text-sm text-muted-foreground">
                        <p className="font-medium text-foreground">{detail.booking.callerName}</p>
                        <p>{detail.booking.assignedRepName}</p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <MetaLine
                        icon={<Clock3 className="h-4 w-4 text-primary" />}
                        label="Date"
                        value={formatDateTime(detail.booking.startAt, detail.booking.timezone)}
                      />
                      <MetaLine
                        icon={<Filter className="h-4 w-4 text-primary" />}
                        label="Qualification"
                        value={`${detail.booking.companySize} salariés`}
                      />
                    </div>
                    <div className="mt-4 rounded-[1rem] border border-white/10 bg-background/25 p-3 text-sm text-muted-foreground">
                      <p className="font-medium text-foreground">Raison d’assignation</p>
                      <p className="mt-2">
                        Pool: {detail.booking.assignmentReason.seniorityPool}. Rôle retenu:{" "}
                        {detail.booking.assignmentReason.chosenRole}. Déficits: senior{" "}
                        {detail.booking.assignmentReason.roleDeficits.senior?.toFixed(2)} / junior{" "}
                        {detail.booking.assignmentReason.roleDeficits.junior?.toFixed(2)}.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="status-reason">Motif / note admin</Label>
                    <Textarea
                      id="status-reason"
                      value={statusReason}
                      onChange={(event) => setStatusReason(event.target.value)}
                      placeholder="Ex. Prospect à rappeler sous 48h, meeting non qualifié, annulation client..."
                      rows={3}
                    />
                  </div>

                  <div className="grid gap-2 md:grid-cols-2">
                    {(
                      [
                        "completed",
                        "no_show",
                        "cancelled",
                        "rescheduled",
                        "not_qualified",
                      ] as BookingStatus[]
                    ).map((status) => (
                      <Button
                        key={status}
                        type="button"
                        variant={detail.booking.status === status ? "default" : "outline"}
                        disabled={updatingStatus || detail.booking.status === status}
                        onClick={() => void handleStatusChange(status)}
                      >
                        {status}
                      </Button>
                    ))}
                  </div>

                  <div className="space-y-3">
                    <p className="text-sm font-medium">Historique</p>
                    {detail.history.map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-[1.25rem] border border-white/10 bg-background/20 px-4 py-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <StatusBadge status={entry.toStatus} />
                            <p className="text-sm text-muted-foreground">
                              {entry.fromStatus ? `${entry.fromStatus} → ` : ""}
                              {entry.toStatus}
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatRelativeShort(entry.createdAt)}
                          </p>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {entry.actorLabel}
                          {entry.reason ? ` · ${entry.reason}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="rounded-[1.25rem] border border-dashed border-white/10 px-4 py-6 text-sm text-muted-foreground">
                  Sélectionnez un booking pour voir le détail.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppChrome>
  );
}

function MetaLine({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[1rem] border border-white/10 bg-background/25 px-3 py-3">
      <div>{icon}</div>
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </p>
        <p className="text-sm">{value}</p>
      </div>
    </div>
  );
}
