import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@shared-ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared-ui/card";
import { Input } from "@shared-ui/input";
import { Label } from "@shared-ui/label";
import { AppChrome } from "@mvp/components/AppChrome";
import { apiFetch } from "@mvp/lib/api";
import type { SettingsPayload } from "@mvp/lib/types";

export function AdminSettingsPage() {
  const [payload, setPayload] = useState<SettingsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [clientName, setClientName] = useState("");
  const [clientTimezone, setClientTimezone] = useState("Europe/Paris");
  const [callerName, setCallerName] = useState("");

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<SettingsPayload>("/api/admin/settings");
      setPayload(data);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSettings();
  }, []);

  const createClient = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await apiFetch("/api/admin/settings/clients", {
        method: "POST",
        body: JSON.stringify({
          name: clientName,
          timezone: clientTimezone,
        }),
      });
      toast.success("Client ajouté.");
      setClientName("");
      setClientTimezone("Europe/Paris");
      await fetchSettings();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const createCaller = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await apiFetch("/api/admin/settings/callers", {
        method: "POST",
        body: JSON.stringify({ name: callerName }),
      });
      toast.success("Caller ajouté.");
      setCallerName("");
      await fetchSettings();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const toggleClient = async (clientId: string, active: boolean) => {
    try {
      await apiFetch(`/api/admin/settings/clients/${clientId}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !active }),
      });
      await fetchSettings();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const toggleCaller = async (callerId: string, active: boolean) => {
    try {
      await apiFetch(`/api/admin/settings/callers/${callerId}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !active }),
      });
      await fetchSettings();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <AppChrome
      title="Paramètres BeeNice"
      subtitle="Gérez les clients et callers sans repasser par les seeds locales."
    >
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="surface-card">
          <CardHeader>
            <CardTitle>Clients</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <form className="grid gap-3 md:grid-cols-[1fr_220px_auto]" onSubmit={createClient}>
              <div className="space-y-2">
                <Label htmlFor="client-name">Nom du client</Label>
                <Input
                  id="client-name"
                  value={clientName}
                  onChange={(event) => setClientName(event.target.value)}
                  placeholder="Doctolib"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-timezone">Timezone</Label>
                <Input
                  id="client-timezone"
                  value={clientTimezone}
                  onChange={(event) => setClientTimezone(event.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" className="w-full rounded-full">
                  Ajouter
                </Button>
              </div>
            </form>

            <div className="space-y-3">
              {loading ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="h-20 animate-pulse rounded-[1.25rem] bg-[#001E5B]/5" />
                ))
              ) : (
                payload?.clients.map((client) => (
                  <div
                    key={client.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-[#001E5B]/8 bg-white px-4 py-4"
                  >
                    <div>
                      <p className="font-semibold text-[#001E5B]">{client.name}</p>
                      <p className="text-sm text-[#001E5B]/56">{client.timezone}</p>
                    </div>
                    <Button
                      variant={client.active ? "outline" : "default"}
                      className="rounded-full"
                      onClick={() => void toggleClient(client.id, client.active)}
                    >
                      {client.active ? "Désactiver" : "Réactiver"}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="surface-card">
          <CardHeader>
            <CardTitle>Callers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <form className="grid gap-3 md:grid-cols-[1fr_auto]" onSubmit={createCaller}>
              <div className="space-y-2">
                <Label htmlFor="caller-name">Nom du caller</Label>
                <Input
                  id="caller-name"
                  value={callerName}
                  onChange={(event) => setCallerName(event.target.value)}
                  placeholder="Nouveau caller"
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" className="w-full rounded-full">
                  Ajouter
                </Button>
              </div>
            </form>

            <div className="space-y-3">
              {loading ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="h-20 animate-pulse rounded-[1.25rem] bg-[#001E5B]/5" />
                ))
              ) : (
                payload?.callers.map((caller) => (
                  <div
                    key={caller.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-[#001E5B]/8 bg-white px-4 py-4"
                  >
                    <p className="font-semibold text-[#001E5B]">{caller.name}</p>
                    <Button
                      variant={caller.active ? "outline" : "default"}
                      className="rounded-full"
                      onClick={() => void toggleCaller(caller.id, caller.active)}
                    >
                      {caller.active ? "Désactiver" : "Réactiver"}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppChrome>
  );
}
