import { toast } from "sonner";

export function buildInviteLink(inviteToken?: string | null): string {
  if (!inviteToken) return "";
  const relativePath = `/connect/${inviteToken}`;
  if (typeof window === "undefined") return relativePath;
  return `${window.location.origin}${relativePath}`;
}

export async function copyInviteLink(inviteToken?: string | null): Promise<void> {
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
