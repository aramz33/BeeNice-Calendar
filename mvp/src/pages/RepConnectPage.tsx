import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { Cable } from "lucide-react";
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
import { apiFetch } from "@mvp/lib/api";
import type {
  PublicRepConnectionField,
  PublicRepConnectionResponse,
  StartRepConnectionResponse,
} from "@mvp/lib/types";

const FIXED_FIELD_IDS = new Set(["firstName", "lastName", "provider", "role"]);

export function RepConnectPage() {
  const { inviteToken = "" } = useParams();
  const [payload, setPayload] = useState<PublicRepConnectionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  const fields = payload?.fields ?? [];

  const fetchPayload = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<PublicRepConnectionResponse>(
        `/api/connect/${inviteToken}`,
      );
      setPayload(data);
      setFormValues((current) => hydrateDefaultFieldValues(data.fields, current));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPayload();
  }, [inviteToken]);

  const customFieldValues = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(formValues).filter(([key]) => !FIXED_FIELD_IDS.has(key)),
      ),
    [formValues],
  );

  const handleConnect = async () => {
    if (!formValues.firstName?.trim() || !formValues.lastName?.trim()) {
      toast.error("Le prénom et le nom sont obligatoires.");
      return;
    }

    if (!formValues.provider) {
      toast.error("Choisissez un provider calendrier.");
      return;
    }

    if (!formValues.role) {
      toast.error("Choisissez un rôle.");
      return;
    }

    setConnecting(true);
    try {
      const result = await apiFetch<StartRepConnectionResponse>(
        `/api/connect/${inviteToken}/start`,
        {
          method: "POST",
          body: JSON.stringify({
            firstName: formValues.firstName,
            lastName: formValues.lastName,
            provider: formValues.provider,
            role: formValues.role,
            extraFields: customFieldValues,
          }),
        },
      );

      if (result.authUrl) {
        window.location.assign(result.authUrl);
        return;
      }

      toast.success("Connexion calendrier activée.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#F9F4ED_0%,#FFFDF9_100%)] px-4 py-8 md:px-6">
      <div className="mx-auto max-w-2xl">
        <Card className="surface-card">
          <CardHeader>
            <CardTitle>Connexion calendrier</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-[1.25rem] border border-[#001E5B]/8 bg-white px-4 py-4">
              <p className="font-semibold text-[#001E5B]">
                {payload?.client.name ?? "Client"}
              </p>
              <p className="mt-2 text-sm text-[#001E5B]/64">
                Renseignez vos informations puis choisissez votre provider
                calendrier pour connecter votre agenda via Nylas.
              </p>
            </div>

            {loading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-12 animate-pulse rounded-[1rem] bg-[#001E5B]/5"
                />
              ))
            ) : (
              <div className="space-y-4">
                {fields.map((field) => (
                  <RepConnectionFieldInput
                    key={field.id}
                    field={field}
                    value={formValues[field.id] ?? ""}
                    onChange={(value) =>
                      setFormValues((current) => ({
                        ...current,
                        [field.id]: value,
                      }))
                    }
                  />
                ))}
              </div>
            )}

            <Button
              className="w-full rounded-full"
              onClick={() => void handleConnect()}
              disabled={connecting || loading}
            >
              <Cable className="h-4 w-4" />
              {connecting ? "Connexion en cours..." : "Connexion"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function hydrateDefaultFieldValues(
  fields: PublicRepConnectionField[],
  currentValues: Record<string, string>,
) {
  const nextValues = { ...currentValues };

  fields.forEach((field) => {
    if (nextValues[field.id]) {
      return;
    }

    if (field.type === "select") {
      nextValues[field.id] = field.options?.[0]?.id ?? "";
      return;
    }

    nextValues[field.id] = "";
  });

  return nextValues;
}

function RepConnectionFieldInput({
  field,
  value,
  onChange,
}: {
  field: PublicRepConnectionField;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={field.id}>
        {field.label}
        {field.required ? " *" : ""}
      </Label>

      {field.type === "select" ? (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={field.id}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          id={field.id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}
