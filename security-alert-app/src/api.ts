/**
 * The SurgeGuard REST calls this app makes - sign-in and operator actions.
 *
 * Same origin, session cookie, and the backend's `{status, message, data}`
 * envelope. Live state never comes from here; it arrives on the socket.
 */

import type { AuthStatus, User } from "@/types/auth";
import type { OperationalState } from "@/types/contracts";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface Envelope<T> {
  status: string;
  message: string;
  data: T;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<{ data: T; message: string }> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      ...init,
    });
  } catch {
    throw new ApiError(0, "SurgeGuard could not be reached.");
  }

  let body: Partial<Envelope<T>> | null = null;
  try {
    body = (await response.json()) as Partial<Envelope<T>>;
  } catch {
    // A proxy error page, or an empty body.
  }

  if (!response.ok || !body || body.status === "error") {
    const fallback =
      response.status === 401
        ? "Sign in to continue."
        : response.status >= 500
          ? "SurgeGuard could not be reached."
          : "The request could not be completed.";
    throw new ApiError(response.status, body?.message || fallback);
  }
  return { data: body.data as T, message: body.message ?? "" };
}

export async function getAuthStatus(): Promise<AuthStatus> {
  return (await request<AuthStatus>("/auth/status")).data;
}

export async function signIn(email: string, password: string): Promise<User> {
  const { data } = await request<User>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return data;
}

export async function signOut(): Promise<void> {
  await request<null>("/auth/logout", { method: "POST" });
}

/**
 * The three responses a guard can make, and the backend operator action each
 * one is (backend services/operational_state.py):
 *
 * - Acknowledge -> ACKNOWLEDGE (Observing -> Investigating)
 * - Responding  -> LOG_ACTION  (-> Responding)
 * - Resolve     -> CLOSE       (-> Monitoring; refused until the crowd is Stable)
 */
export type GuardResponse = "acknowledge" | "responding" | "resolve";

const ACTIONS: Record<GuardResponse, { action: string; note?: string }> = {
  acknowledge: { action: "ACKNOWLEDGE" },
  responding: { action: "LOG_ACTION", note: "Security staff responding (Security Alert App)." },
  resolve: { action: "CLOSE" },
};

export interface ActionResult {
  operationalState: OperationalState;
  message: string;
}

export async function respond(cameraId: string, response: GuardResponse): Promise<ActionResult> {
  const { data, message } = await request<{ operational_state: OperationalState }>(
    `/cameras/${encodeURIComponent(cameraId)}/operations`,
    { method: "POST", body: JSON.stringify(ACTIONS[response]) },
  );
  return { operationalState: data.operational_state, message };
}
