import { useCallback, useEffect, useState } from "react";

import type { AuthStatus } from "@/types/auth";

import { ApiError, getAuthStatus, respond, signIn, signOut, type GuardResponse } from "./api";
import { noticeText } from "./format";
import {
  alertDevice,
  deviceNotificationStatus,
  registerServiceWorker,
  requestDeviceNotifications,
  unlockSound,
  type DeviceNotifications,
} from "./notify";
import { useAlerts, type NoticeHandler } from "./useAlerts";
import {
  ConnectionBanner,
  ConnectionPill,
  Detail,
  History,
  Home,
  Icon,
  icons,
  SignIn,
  ThemeToggle,
  ToastStack,
  type Toast,
} from "./views";
import { useTheme } from "./theme";

type Tab = "alerts" | "history";

/** The open alert lives in the URL hash, so a phone's back button closes it. */
function hashAlert(): string | null {
  const match = /^#\/alert\/(.+)$/.exec(window.location.hash);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

const WARNING_TOAST_MS = 10_000;

/** Stand-in while the backend cannot be asked who is signed in. */
const OFFLINE_AUTH: AuthStatus = { auth_enabled: false, setup_required: false, user: null };

export function App() {
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const loadAuth = useCallback(async () => {
    try {
      setAuth(await getAuthStatus());
      setAuthError(null);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "SurgeGuard could not be reached.");
    }
  }, []);

  // Load at start, and keep asking every few seconds until the backend answers.
  const answered = auth !== null;
  useEffect(() => {
    if (answered) return;
    const first = setTimeout(() => void loadAuth(), 0);
    const retry = setInterval(() => void loadAuth(), 3000);
    return () => {
      clearTimeout(first);
      clearInterval(retry);
    };
  }, [answered, loadAuth]);

  const onSignedOut = useCallback(() => void loadAuth(), [loadAuth]);

  const signedIn = auth !== null && (!auth.auth_enabled || auth.user !== null);

  // Backend unreachable at start-up: open anyway with the alerts this phone
  // already holds, under "Connection lost", rather than a blank waiting screen.
  // The socket keeps retrying; if the session turns out to have expired, its
  // 4401 close brings the sign-in screen.
  if (auth === null && authError) {
    return <AlertApp auth={OFFLINE_AUTH} onSignedOut={onSignedOut} />;
  }

  if (!signedIn) {
    if (auth && auth.auth_enabled) {
      return (
        <SignIn
          setupRequired={auth.setup_required}
          onSignIn={async (email, password) => {
            await signIn(email, password);
            await loadAuth();
          }}
        />
      );
    }
    return (
      <main className="boot">
        <div className="brand-mark">
          <Icon path={icons.shield} size={30} />
        </div>
        <p>Connecting to SurgeGuard…</p>
      </main>
    );
  }

  return <AlertApp auth={auth} onSignedOut={onSignedOut} />;
}

function AlertApp({ auth, onSignedOut }: { auth: AuthStatus; onSignedOut: () => void }) {
  const [tab, setTab] = useState<Tab>("alerts");
  const [openId, setOpenId] = useState<string | null>(hashAlert);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState<GuardResponse | null>(null);
  const [device, setDevice] = useState<DeviceNotifications>(deviceNotificationStatus);
  const [now, setNow] = useState(Date.now);
  const [theme, toggleTheme] = useTheme();

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onHash = () => setOpenId(hashAlert());
    window.addEventListener("popstate", onHash);
    const onGesture = () => unlockSound();
    window.addEventListener("pointerdown", onGesture);
    if (deviceNotificationStatus() === "granted") void registerServiceWorker();
    return () => {
      window.removeEventListener("popstate", onHash);
      window.removeEventListener("pointerdown", onGesture);
    };
  }, []);

  const dismiss = useCallback((key: string) => {
    setToasts((current) => current.filter((toast) => toast.key !== key));
  }, []);

  const onNotice = useCallback<NoticeHandler>(
    (notice, current) => {
      const text = noticeText(current, notice.alert, notice.kind);
      alertDevice(notice, text);
      const toast: Toast = {
        key: `${notice.alert.id}:${notice.alert.level}`,
        alertId: notice.alert.id,
        level: notice.alert.level,
        ...text,
      };
      // An escalation replaces the same alert's earlier banner.
      setToasts((shown) =>
        [toast, ...shown.filter((other) => other.alertId !== toast.alertId)].slice(0, 3),
      );
      if (toast.level === "WARNING") setTimeout(() => dismiss(toast.key), WARNING_TOAST_MS);
    },
    [dismiss],
  );

  const feed = useAlerts(true, onNotice);
  const { state, link } = feed;

  // A 4401 from the socket: the session ended elsewhere.
  useEffect(() => {
    if (link?.state === "unauthorized") onSignedOut();
  }, [link?.state, onSignedOut]);

  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), 5000);
    return () => clearTimeout(timer);
  }, [status]);

  const open = (id: string) => {
    window.history.pushState({ alert: id }, "", `#/alert/${encodeURIComponent(id)}`);
    setOpenId(id);
  };
  const close = () => {
    // Back only when this app pushed the entry; opened from a link, just clear it.
    if ((window.history.state as { alert?: string } | null)?.alert) window.history.back();
    else window.history.replaceState(null, "", window.location.pathname);
    setOpenId(null);
  };

  const openAlert = openId ? state.alerts.find((alert) => alert.id === openId) : undefined;

  async function onRespond(response: GuardResponse) {
    if (!openAlert) return;
    setBusy(response);
    try {
      const result = await respond(openAlert.cameraId, response);
      feed.applyLocalWorkflow(openAlert.cameraId, result.operationalState);
      setStatus({ text: result.message || "Sent.", error: false });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onSignedOut();
      setStatus({
        text: error instanceof Error ? error.message : "The action could not be sent.",
        error: true,
      });
    } finally {
      setBusy(null);
    }
  }

  async function enableNotifications() {
    unlockSound();
    setDevice(await requestDeviceNotifications());
  }

  return (
    <div className="app">
      <ToastStack
        toasts={toasts}
        onOpen={(toast) => {
          dismiss(toast.key);
          open(toast.alertId);
        }}
        onDismiss={dismiss}
      />

      {openAlert ? (
        <Detail
          alert={openAlert}
          state={state}
          now={now}
          busy={busy}
          onBack={close}
          onRespond={(response) => void onRespond(response)}
        />
      ) : (
        <>
          <header className="top">
            <div className="brand">
              <span className="brand-mark small">
                <Icon path={icons.shield} size={18} />
              </span>
              <span className="brand-text">
                <strong>SurgeGuard</strong>
                <small>Security</small>
              </span>
            </div>
            <div className="top-right">
              <ConnectionPill link={link} />
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
            </div>
          </header>

          <main className="content">
            <ConnectionBanner link={link} onRetry={feed.retry} now={now} />

            {device === "default" && (
              <button type="button" className="enable-notify" onClick={() => void enableNotifications()}>
                <Icon path={icons.bell} size={20} />
                <span>
                  <strong>Turn on notifications</strong>
                  <small>Get WARNING and CRITICAL alerts while the app is in the background.</small>
                </span>
              </button>
            )}
            {device === "insecure" && tab === "history" && (
              <p className="note">
                System notifications need HTTPS. In-app alerts, sound and vibration still work while
                this app is open.
              </p>
            )}

            {tab === "alerts" ? (
              <Home
                state={state}
                now={now}
                live={link?.state === "live" && !link.isStale}
                onOpen={open}
              />
            ) : (
              <History
                state={state}
                onOpen={open}
                onClear={feed.clearHistory}
                onSignOut={
                  auth.auth_enabled
                    ? () => {
                        void signOut().finally(onSignedOut);
                      }
                    : null
                }
              />
            )}
          </main>

          <nav className="tabs" aria-label="Sections">
            <button
              type="button"
              className={tab === "alerts" ? "active" : ""}
              onClick={() => setTab("alerts")}
            >
              <Icon path={icons.alert} size={22} />
              Alerts
            </button>
            <button
              type="button"
              className={tab === "history" ? "active" : ""}
              onClick={() => setTab("history")}
            >
              <Icon path={icons.history} size={22} />
              History
            </button>
          </nav>
        </>
      )}

      {status && (
        <output className={`status-toast ${status.error ? "status-error" : ""}`}>{status.text}</output>
      )}
    </div>
  );
}
