import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { Cable, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@shared-ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared-ui/card";
import { Label } from "@shared-ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared-ui/select";
import { AppChrome } from "@mvp/components/AppChrome";
import { apiFetch } from "@mvp/lib/api";
import { formatRelativeShort } from "@mvp/lib/time";
import type {
  PublicRepConnectionResponse,
  StartRepConnectionResponse,
} from "@mvp/lib/types";

export function RepConnectPage() {
  const { inviteToken = "" } = useParams();
  const [payload, setPayload] = useState<PublicRepConnectionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRepId, setSelectedRepId] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<"google" | "microsoft">(
    "google",
  );
  const [connecting, setConnecting] = useState(false);

  const fetchPayload = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<PublicRepConnectionResponse>(
        `/api/connect/${inviteToken}`,
      );
      setPayload(data);
      setSelectedRepId((current) => current || data.reps[0]?.id || "");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

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
        next ? `/connect/${inviteToken}?${next}` : `/connect/${inviteToken}`,
      );
    }
  }, [inviteToken]);

  useEffect(() => {
    void fetchPayload();
  }, [inviteToken]);

  const handleConnect = async () => {
    if (!selectedRepId) {
      toast.error("Sélectionnez un commercial.");
      return;
    }

    setConnecting(true);
    try {
      const result = await apiFetch<StartRepConnectionResponse>(
        `/api/connect/${inviteToken}/start`,
        {
          method: "POST",
          body: JSON.stringify({
            repId: selectedRepId,
            provider: selectedProvider,
          }),
        },
      );

      if (result.authUrl) {
        window.location.assign(result.authUrl);
        return;
      }

      toast.success("Connexion calendrier activée.");
      await fetchPayload();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setConnecting(false);
    }
  };

  const inviteUrl =
    typeof window === "undefined"
      ? `/connect/${inviteToken}`
      : `${window.location.origin}/connect/${inviteToken}`;

  return (
    <AppChrome title="Connexion calendrier">
      <div className="mx-auto grid max-w-5xl gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="surface-card">
          <CardHeader>
            <CardTitle>Connecter votre agenda</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-[1.25rem] border border-[#001E5B]/8 bg-white px-4 py-4">
              <p className="font-semibold text-[#001E5B]">
                {payload?.client.name ?? "Client"}
              </p>
              <p className="mt-2 text-sm text-[#001E5B]/64">
                Choisissez votre nom puis votre provider calendrier pour autoriser
                Be Nice a placer les rendez-vous directement dans votre agenda.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rep-select">Commercial</Label>
              <Select value={selectedRepId} onValueChange={setSelectedRepId}>
                <SelectTrigger id="rep-select">
                  <SelectValue placeholder="Choisir un commercial" />
                </SelectTrigger>
                <SelectContent>
                  {(payload?.reps ?? []).map((rep) => (
                    <SelectItem key={rep.id} value={rep.id}>
                      {rep.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="provider-select">Provider calendrier</Label>
              <Select
                value={selectedProvider}
                onValueChange={(value) =>
                  setSelectedProvider(value as "google" | "microsoft")
                }
              >
                <SelectTrigger id="provider-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(payload?.providers ?? []).map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              className="w-full rounded-full"
              onClick={() => void handleConnect()}
              disabled={connecting || loading}
            >
              <Cable className="h-4 w-4" />
              {connecting ? "Connexion en cours..." : "Connecter mon agenda"}
            </Button>

            <div className="rounded-[1.25rem] border border-dashed border-[#001E5B]/12 bg-[#F9F4ED] px-4 py-4 text-sm text-[#001E5B]/64">
              <p className="font-medium text-[#001E5B]">Lien partagé</p>
              <p className="mt-2 break-all">{inviteUrl}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="surface-card">
          <CardHeader>
            <CardTitle>Etat des commerciaux</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="h-24 animate-pulse rounded-[1.25rem] bg-[#001E5B]/5"
                />
              ))
            ) : payload?.reps.length ? (
              payload.reps.map((rep) => (
                <div
                  key={rep.id}
                  className="rounded-[1.25rem] border border-[#001E5B]/8 bg-white px-4 py-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#001E5B]">{rep.name}</p>
                      <p className="text-sm text-[#001E5B]/56">{rep.email}</p>
                      <p className="mt-2 text-xs text-[#001E5B]/48">
                        Derniere synchro:{" "}
                        {rep.lastSyncAt ? formatRelativeShort(rep.lastSyncAt) : "jamais"}
                      </p>
                    </div>
                    <div className="rounded-full border border-[#001E5B]/10 bg-[#F9F4ED] px-3 py-1 text-xs font-medium text-[#001E5B]">
                      {rep.connectionStatus}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[1.25rem] border border-dashed border-[#001E5B]/12 px-4 py-8 text-sm text-[#001E5B]/44">
                Aucun commercial actif n'est disponible sur ce lien.
              </div>
            )}

            <Button
              variant="outline"
              className="w-full rounded-full"
              onClick={() => {
                navigator.clipboard
                  .writeText(inviteUrl)
                  .then(() => toast.success("Lien copie."))
                  .catch(() => toast.error("Copie du lien impossible."));
              }}
            >
              <Copy className="h-4 w-4" />
              Copier le lien
            </Button>

            <Button
              variant="outline"
              className="w-full rounded-full"
              onClick={() => void fetchPayload()}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Rafraichir les connexions
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppChrome>
  );
}
