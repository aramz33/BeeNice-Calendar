import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@mvp/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@mvp/components/ui/card";
import { Input } from "@mvp/components/ui/input";
import { Label } from "@mvp/components/ui/label";
import { AppChrome } from "@mvp/components/AppChrome";
import { apiFetch } from "@mvp/lib/api";
import { copyInviteLink } from "@mvp/lib/invite-link";
import type { ClientCreationResponse, SettingsPayload } from "@mvp/lib/types";

const EMPTY_CLIENT_FORM = {
  name: "",
  primaryContactFirstName: "",
  primaryContactLastName: "",
  primaryContactPhone: "",
  primaryContactEmail: "",
};

export function AdminSettingsPage() {
  const [payload, setPayload] = useState<SettingsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [clientForm, setClientForm] = useState(EMPTY_CLIENT_FORM);
  const [callerName, setCallerName] = useState("");

  const updateClientField =
    (field: keyof typeof EMPTY_CLIENT_FORM) =>
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setClientForm((current) => ({ ...current, [field]: event.target.value }));

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
    const email = clientForm.primaryContactEmail.trim().toLowerCase();
    const duplicate = payload?.clients.find(
      (client) => client.primaryContactEmail.toLowerCase() === email,
    );
    if (
      duplicate &&
      !window.confirm(
        `L'email ${email} est déjà associé au client « ${duplicate.name} ». Créer quand même ?`,
      )
    ) {
      return;
    }
    try {
      await apiFetch<ClientCreationResponse>("/api/admin/settings/clients", {
        method: "POST",
        body: JSON.stringify({
          name: clientForm.name,
          primaryContactFirstName: clientForm.primaryContactFirstName,
          primaryContactLastName: clientForm.primaryContactLastName,
          primaryContactPhone: clientForm.primaryContactPhone,
          primaryContactEmail: clientForm.primaryContactEmail,
        }),
      });
      toast.success("Client ajouté.");
      setClientForm(EMPTY_CLIENT_FORM);
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

  const toggleEntity = async (path: string, active: boolean) => {
    try {
      await apiFetch(path, {
        method: "PATCH",
        body: JSON.stringify({ active: !active }),
      });
      await fetchSettings();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <AppChrome title="Paramètres">
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="surface-card">
          <CardHeader>
            <CardTitle>Clients</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <form className="grid gap-3 md:grid-cols-2" onSubmit={createClient}>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="client-name">Entreprise</Label>
                <Input
                  id="client-name"
                  required
                  value={clientForm.name}
                  onChange={updateClientField("name")}
                  placeholder="Doctolib"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-contact-first-name">
                  Prénom du responsable commercial
                </Label>
                <Input
                  id="client-contact-first-name"
                  required
                  value={clientForm.primaryContactFirstName}
                  onChange={updateClientField("primaryContactFirstName")}
                  placeholder="Camille"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-contact-last-name">
                  Nom du responsable commercial
                </Label>
                <Input
                  id="client-contact-last-name"
                  required
                  value={clientForm.primaryContactLastName}
                  onChange={updateClientField("primaryContactLastName")}
                  placeholder="Durand"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-contact-phone">Téléphone</Label>
                <Input
                  id="client-contact-phone"
                  required
                  type="tel"
                  inputMode="tel"
                  value={clientForm.primaryContactPhone}
                  onChange={updateClientField("primaryContactPhone")}
                  placeholder="+33612345678"
                />
                <p className="text-xs text-[#001E5B]/56">
                  Format international, ex. +336…
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-contact-email">Email</Label>
                <Input
                  id="client-contact-email"
                  required
                  type="email"
                  value={clientForm.primaryContactEmail}
                  onChange={updateClientField("primaryContactEmail")}
                  placeholder="camille.durand@doctolib.com"
                />
              </div>
              <div className="flex items-end md:col-span-2">
                <Button type="submit" className="rounded-full">
                  Ajouter
                </Button>
              </div>
            </form>

            <div className="space-y-3">
              {loading
                ? Array.from({ length: 3 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-20 animate-pulse rounded-[1.25rem] bg-[#001E5B]/5"
                    />
                  ))
                : payload?.clients.map((client) => (
                    <div
                      key={client.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-[#001E5B]/8 bg-white px-4 py-4"
                    >
                      <div>
                        <p className="font-semibold text-[#001E5B]">
                          {client.name}
                        </p>
                        <p className="text-sm text-[#001E5B]/56">
                          Responsable commercial :{" "}
                          {client.primaryContactFirstName}{" "}
                          {client.primaryContactLastName}
                        </p>
                        <p className="text-sm text-[#001E5B]/56">
                          {client.primaryContactEmail} ·{" "}
                          {client.primaryContactPhone}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="outline"
                          className="rounded-full"
                          onClick={() =>
                            void copyInviteLink(client.connectionInviteToken)
                          }
                        >
                          <Copy className="h-4 w-4" />
                          Copier le lien rep
                        </Button>
                        <Button
                          variant={client.active ? "outline" : "default"}
                          className="rounded-full"
                          onClick={() =>
                            void toggleEntity(
                              `/api/admin/settings/clients/${client.id}`,
                              client.active,
                            )
                          }
                        >
                          {client.active ? "Désactiver" : "Réactiver"}
                        </Button>
                      </div>
                    </div>
                  ))}
            </div>
          </CardContent>
        </Card>

        <Card className="surface-card">
          <CardHeader>
            <CardTitle>Callers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <form
              className="grid gap-3 md:grid-cols-[1fr_auto]"
              onSubmit={createCaller}
            >
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
              {loading
                ? Array.from({ length: 3 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-20 animate-pulse rounded-[1.25rem] bg-[#001E5B]/5"
                    />
                  ))
                : payload?.callers.map((caller) => (
                    <div
                      key={caller.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-[#001E5B]/8 bg-white px-4 py-4"
                    >
                      <p className="font-semibold text-[#001E5B]">
                        {caller.name}
                      </p>
                      <Button
                        variant={caller.active ? "outline" : "default"}
                        className="rounded-full"
                        onClick={() =>
                          void toggleEntity(
                            `/api/admin/settings/callers/${caller.id}`,
                            caller.active,
                          )
                        }
                      >
                        {caller.active ? "Désactiver" : "Réactiver"}
                      </Button>
                    </div>
                  ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppChrome>
  );
}
