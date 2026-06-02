import { useEffect, useMemo, useState } from "react";
import {
  Cable,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@mvp/components/ui/badge";
import { Button } from "@mvp/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@mvp/components/ui/card";
import { AppChrome } from "@mvp/components/AppChrome";
import { apiFetch } from "@mvp/lib/api";
import { formatRepSeniority } from "@mvp/lib/format";
import { formatRelativeShort } from "@mvp/lib/time";
import type { AdminRepsResponse, SettingsPayload } from "@mvp/lib/types";

const CONNECTIONS_PATH = "/admin/settings/connections";

type AdminRep = AdminRepsResponse["reps"][number];
type SettingsClient = SettingsPayload["clients"][number];

interface ConnectionGroup {
  client: SettingsClient;
  reps: AdminRep[];
  connectedCount: number;
  disconnectedCount: number;
  errorCount: number;
}

export function AdminConnectionsPage() {
  const [repsPayload, setRepsPayload] = useState<AdminRepsResponse | null>(null);
  const [settingsPayload, setSettingsPayload] = useState<SettingsPayload | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);

  const fetchConnections = async () => {
    setLoading(true);
    try {
      const [repsData, settingsData] = await Promise.all([
        apiFetch<AdminRepsResponse>("/api/admin/reps"),
        apiFetch<SettingsPayload>("/api/admin/settings"),
      ]);
      setRepsPayload(repsData);
      setSettingsPayload(settingsData);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchConnections();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const connectionError = params.get("connectionError");

    if (connected) {
      toast.success("Connexion calendrier terminée.");
      params.delete("connected");
    }

    if (connectionError) {
      toast.error(connectionError);
      params.delete("connectionError");
    }

    if (connected || connectionError) {
      const next = params.toString();
      window.history.replaceState(
        {},
        "",
        next ? `${CONNECTIONS_PATH}?${next}` : CONNECTIONS_PATH,
      );
    }
  }, []);

  useEffect(() => {
    const source = new EventSource("/api/admin/stream");
    const refresh = () => {
      void fetchConnections();
    };

    source.addEventListener("connections.updated", refresh);
    source.addEventListener("settings.updated", refresh);
    source.onerror = () => {
      source.close();
    };

    return () => source.close();
  }, []);

  const connectionGroups = useMemo<ConnectionGroup[]>(() => {
    const reps = repsPayload?.reps ?? [];
    const clients = (settingsPayload?.clients ?? []).filter((client) => client.active);

    return clients.map((client) => {
      const clientReps = reps.filter((rep) => rep.clientId === client.id);
      const connectedCount = clientReps.filter(
        (rep) => rep.connectionStatus === "connected",
      ).length;
      const errorCount = clientReps.filter((rep) => rep.lastError).length;

      return {
        client,
        reps: clientReps,
        connectedCount,
        disconnectedCount: clientReps.length - connectedCount,
        errorCount,
      };
    });
  }, [repsPayload?.reps, settingsPayload?.clients]);

  const totalReps = repsPayload?.reps.length ?? 0;
  const connectedReps =
    repsPayload?.reps.filter((rep) => rep.connectionStatus === "connected").length ?? 0;
  const integrationMode = repsPayload?.integrations.providerMode ?? "mock";

  return (
    <AppChrome title="Connexions">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="surface-card">
          <CardHeader>
            <CardTitle>Mode</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Cable className="h-5 w-5 text-[#F7A600]" />
              <p className="text-2xl font-semibold text-[#001E5B]">
                {integrationMode === "nylas" ? "Nylas" : "Mock"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="surface-card">
          <CardHeader>
            <CardTitle>Connectés</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-[#001E5B]">
              {connectedReps}/{totalReps}
            </p>
          </CardContent>
        </Card>
        <Card className="surface-card">
          <CardHeader>
            <CardTitle>Clients actifs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-[#001E5B]">
              {connectionGroups.length}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="surface-card mt-6">
        <CardHeader>
          <CardTitle>Connexions calendrier</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-24 animate-pulse rounded-[1.25rem] bg-[#001E5B]/5"
              />
            ))
          ) : connectionGroups.length ? (
            connectionGroups.map((group) => (
              <ConnectionGroupRow
                key={group.client.id}
                group={group}
                expanded={expandedClientId === group.client.id}
                onToggle={() =>
                  setExpandedClientId((current) =>
                    current === group.client.id ? null : group.client.id,
                  )
                }
              />
            ))
          ) : (
            <div className="rounded-[1.25rem] border border-dashed border-[#001E5B]/12 px-4 py-10 text-center text-sm text-[#001E5B]/44">
              Aucun client actif.
            </div>
          )}
        </CardContent>
      </Card>
    </AppChrome>
  );
}

function ConnectionGroupRow({
  group,
  expanded,
  onToggle,
}: {
  group: ConnectionGroup;
  expanded: boolean;
  onToggle: () => void;
}) {
  const inviteLink = buildInviteLink(group.client.connectionInviteToken);
  const Icon = expanded ? ChevronDown : ChevronRight;

  return (
    <div className="rounded-[1.25rem] border border-[#001E5B]/8 bg-white">
      <button
        type="button"
        className="flex w-full min-w-0 items-center justify-between gap-4 px-4 py-4 text-left"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <div className="flex min-w-0 items-center gap-3">
          <Icon className="h-5 w-5 shrink-0 text-[#001E5B]/56" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-[#001E5B]">
              {group.client.name}
            </p>
            <p className="text-sm text-[#001E5B]/56">
              {formatRoutingMode(group.client.routingMode)}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <CounterBadge
            label={`${group.connectedCount} connecté${
              group.connectedCount > 1 ? "s" : ""
            }`}
            tone="success"
          />
          <CounterBadge
            label={`${group.disconnectedCount} à connecter`}
            tone={group.disconnectedCount ? "warning" : "neutral"}
          />
          {group.errorCount ? (
            <CounterBadge label={`${group.errorCount} erreur`} tone="danger" />
          ) : null}
        </div>
      </button>

      {expanded ? (
        <div className="border-t border-[#001E5B]/8 px-4 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 rounded-[1rem] border border-dashed border-[#001E5B]/12 bg-[#F9F4ED] px-3 py-2 text-xs text-[#001E5B]/64">
              <p className="truncate">{inviteLink || "Lien indisponible"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => void copyInviteLink(group.client.connectionInviteToken)}
              >
                <Copy className="h-4 w-4" />
                Copier
              </Button>
              <Button asChild variant="outline" className="rounded-full">
                <a href={inviteLink} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Ouvrir
                </a>
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {group.reps.length ? (
              group.reps.map((rep) => <RepConnectionRow key={rep.id} rep={rep} />)
            ) : (
              <div className="rounded-[1rem] border border-dashed border-[#001E5B]/12 px-4 py-8 text-sm text-[#001E5B]/44">
                Aucun rep pour ce client.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RepConnectionRow({ rep }: { rep: AdminRep }) {
  return (
    <div className="rounded-[1rem] border border-[#001E5B]/8 bg-[#FFFDF9] px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-[#001E5B]">{rep.name}</p>
          <p className="text-sm text-[#001E5B]/56">
            {formatRepSeniority(rep.seniority)}
            {rep.businessEmail ? ` · ${rep.businessEmail}` : ""}
          </p>
        </div>
        <ConnectionStatusBadge status={rep.connectionStatus} />
      </div>

      <div className="mt-3 space-y-1 text-xs text-[#001E5B]/56">
        {rep.providerEmail ? <p>Calendrier: {rep.providerEmail}</p> : null}
        {rep.connectedAt ? (
          <p>Connecté: {formatRelativeShort(rep.connectedAt)}</p>
        ) : null}
        <p>
          Dernière synchro:{" "}
          {rep.lastSyncAt ? formatRelativeShort(rep.lastSyncAt) : "jamais"}
        </p>
        <p>
          Dernier webhook:{" "}
          {rep.lastWebhookAt ? formatRelativeShort(rep.lastWebhookAt) : "jamais"}
        </p>
        {rep.lastError ? <p className="text-rose-600">{rep.lastError}</p> : null}
      </div>
    </div>
  );
}

function ConnectionStatusBadge({ status }: { status: string }) {
  if (status === "connected") {
    return (
      <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
        <CheckCircle2 className="h-3 w-3" />
        connected
      </Badge>
    );
  }

  return (
    <Badge className="border-[#001E5B]/10 bg-[#F9F4ED] text-[#001E5B]">
      {status}
    </Badge>
  );
}

function CounterBadge({
  label,
  tone,
}: {
  label: string;
  tone: "success" | "warning" | "danger" | "neutral";
}) {
  const className =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "danger"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : tone === "warning"
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-[#001E5B]/10 bg-[#F9F4ED] text-[#001E5B]";

  return <Badge className={className}>{label}</Badge>;
}

function formatRoutingMode(routingMode: string): string {
  return routingMode === "weighted_seniority"
    ? "Routing senior/junior"
    : "Pool unique";
}

function buildInviteLink(inviteToken?: string | null): string {
  if (!inviteToken) return "";
  const relativePath = `/connect/${inviteToken}`;
  if (typeof window === "undefined") return relativePath;
  return `${window.location.origin}${relativePath}`;
}

async function copyInviteLink(inviteToken?: string | null): Promise<void> {
  const inviteLink = buildInviteLink(inviteToken);
  if (!inviteLink) {
    toast.error("Lien de connexion indisponible.");
    return;
  }

  try {
    await navigator.clipboard.writeText(inviteLink);
    toast.success("Lien de connexion copié.");
  } catch {
    toast.error("Copie du lien impossible.");
  }
}
