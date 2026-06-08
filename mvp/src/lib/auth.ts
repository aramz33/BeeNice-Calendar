export interface Session {
  user: {
    id: string;
    email: string;
    name: string;
    role: "admin" | "caller";
    active: boolean;
    callerId?: string | null;
  };
}

export async function getSession(): Promise<Session | null> {
  const response = await fetch("/api/auth/get-session", {
    credentials: "include",
  });
  if (!response.ok) return null;
  const body = await response.json();
  if (!body?.user) return null;
  return { user: body.user };
}

export async function signIn(
  email: string,
  password: string,
): Promise<Session> {
  const response = await fetch("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error ?? body?.message ?? "Identifiants incorrects.");
  }
  const body = await response.json();
  return { user: body.user };
}

export const TASKS_MODAL_SHOWN_KEY = "benice-tasks-modal-shown";

export async function signOut(): Promise<void> {
  await fetch("/api/auth/sign-out", {
    method: "POST",
    credentials: "include",
  });
  sessionStorage.removeItem(TASKS_MODAL_SHOWN_KEY);
}
