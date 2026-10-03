import { useState, type FormEvent, type ReactNode } from "react";

import type { LinkSnapshot } from "@/realtime/socketClient";

import { activeAlerts, isOpen, type AlertRecord, type AlertState } from "./alerts";
import type { GuardResponse } from "./api";
import {
  ago,
  cameraLabel,
  cameraOf,
  clockTime,
  CROWD_STATUS,
  csiText,
  dateTime,
  RESPONSE_STEPS,
  responseStep,
  statusLabel,
  zoneOf,
} from "./format";
import type { Theme } from "./theme";

// -- Icons --------------------------------------------------------------------

export function Icon({ path, size = 20 }: { path: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

export const icons = {
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  shieldCheck: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5M12 7v5l3 3" />
    </>
  ),
  back: <path d="m15 18-6-6 6-6" />,
  chevron: <path d="m9 18 6-6-6-6" />,
  bell: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
    </>
  ),
  close: <path d="M18 6 6 18M6 6l12 12" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  wifiOff: (
    <>
      <path d="m2 2 20 20" />
      <path d="M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 5.2-2.8M19 12.9a10 10 0 0 0-2.3-1.7M2 8.8a15 15 0 0 1 4.2-2.7M22 8.8A15 15 0 0 0 10.7 5M12 20h.01" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  camera: (
    <>
      <path d="m23 7-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </>
  ),
};

// -- Header ---------------------------------------------------------------------

export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const next = theme === "light" ? "dark" : "light";
  return (
    <button
      type="button"
      className="icon-btn"
      onClick={onToggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      <Icon path={theme === "light" ? icons.moon : icons.sun} size={19} />
    </button>
  );
}

export function ConnectionPill({ link }: { link: LinkSnapshot | null }) {
  const live = link?.state === "live" && !link.isStale;
  const waiting = link === null || link.state === "connecting" || link.state === "syncing";
  const label = live ? "Live" : waiting ? "Connecting" : "Offline";
  const tone = live ? "pill-live" : waiting ? "pill-wait" : "pill-off";
  return (
    <span className={`pill ${tone}`}>
      <span className="dot" />
      {label}
    </span>
  );
}

export function ConnectionBanner({
  link,
  onRetry,
  now,
}: {
  link: LinkSnapshot | null;
  onRetry: () => void;
  now: number;
}) {
  if (!link) return null;
  const lost =
    link.isStale ||
    link.state === "reconnecting" ||
    link.state === "offline" ||
    link.state === "failed";
  if (!lost) return null;
  const retryIn =
    link.nextRetryAt !== null ? Math.max(0, Math.ceil((link.nextRetryAt - now) / 1000)) : null;
  const detail =
    link.state === "offline"
      ? "This phone is offline. It reconnects when the network returns."
      : link.isStale && link.state === "live"
        ? "No updates from SurgeGuard. Alerts shown may be out of date."
        : `Reconnecting automatically${retryIn !== null ? ` in ${retryIn}s` : ""}, attempt ${link.attempts}.`;
  return (
    <div className="conn-lost" role="alert">
      <span className="conn-icon">
        <Icon path={icons.wifiOff} size={20} />
      </span>
      <div className="conn-text">
        <strong>Connection lost</strong>
        <p>{detail}</p>
      </div>
      <button type="button" className="btn-small" onClick={onRetry}>
        Retry now
      </button>
    </div>
  );
}

// -- Stability gauge --------------------------------------------------------------

/** The Crowd Stability Index as a bar: full is stable, empty is the danger end. */
function Gauge({ csi, tone }: { csi: number; tone: "critical" | "warning" | "plate" }) {
  const value = Math.max(0, Math.min(100, csi));
  return (
    // Decorative: the number beside it carries the value for screen readers.
    <div className={`gauge gauge-${tone}`} aria-hidden="true">
      <div className="gauge-fill" style={{ width: `${value}%` }} />
    </div>
  );
}

// -- Home -----------------------------------------------------------------------

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function StatusBoard({
  state,
  critical,
  warning,
  live,
}: {
  state: AlertState;
  critical: number;
  warning: number;
  live: boolean;
}) {
  const enabled = Object.values(state.cameras).filter((camera) => camera.enabled).length;
  const watching = Object.values(state.cameras).filter((camera) => camera.watching).length;
  if (critical + warning === 0) {
    if (live && watching === 0) {
      // Silence from a platform with no working camera is not safety.
      return (
        <section className="board board-unknown">
          <span className="board-mark">
            <Icon path={icons.camera} size={24} />
          </span>
          <div>
            <h1 className="board-title">No cameras reporting</h1>
            <p className="board-sub">
              {enabled
                ? `${plural(enabled, "camera")} offline. No alerts can be raised until one is back.`
                : "No camera is enabled in SurgeGuard."}
            </p>
          </div>
        </section>
      );
    }
    const offline = enabled - watching;
    return live ? (
      <section className="board board-clear">
        <span className="board-mark">
          <Icon path={icons.shieldCheck} size={26} />
        </span>
        <div>
          <h1 className="board-title">All clear</h1>
          <p className="board-sub">
            Watching {plural(watching, "camera")}
            {offline > 0 ? `, ${offline} offline` : ""}. No WARNING or CRITICAL situations.
          </p>
        </div>
      </section>
    ) : (
      <section className="board board-unknown">
        <span className="board-mark">
          <Icon path={icons.wifiOff} size={24} />
        </span>
        <div>
          <h1 className="board-title">No live data</h1>
          <p className="board-sub">Not connected, so this phone can’t confirm all is clear.</p>
        </div>
      </section>
    );
  }

  const worst = critical > 0 ? "critical" : "warning";
  const headline =
    critical > 0 ? plural(critical, "critical alert") : plural(warning, "warning");
  return (
    <section className={`board board-${worst}`}>
      <div className="hazard" aria-hidden="true" />
      <div className="board-body">
        <h1 className="board-title">{headline}</h1>
        <p className="board-sub">
          {critical > 0 && warning > 0
            ? `and ${plural(warning, "warning")}. Critical first.`
            : "Tap an alert to respond."}
        </p>
      </div>
    </section>
  );
}

export function Home({
  state,
  now,
  live,
  onOpen,
}: {
  state: AlertState;
  now: number;
  /** Connected and current. Without it "all clear" is a claim nobody can make. */
  live: boolean;
  onOpen: (id: string) => void;
}) {
  const active = activeAlerts(state);
  const critical = active.filter((alert) => alert.level === "CRITICAL").length;
  const warning = active.length - critical;

  return (
    <>
      <StatusBoard state={state} critical={critical} warning={warning} live={live} />
      {active.length > 0 && (
        <ul className="cards">
          {active.map((alert) => (
            <li key={alert.id}>
              <AlertCard alert={alert} state={state} now={now} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function AlertCard({
  alert,
  state,
  now,
  onOpen,
}: {
  alert: AlertRecord;
  state: AlertState;
  now: number;
  onOpen: (id: string) => void;
}) {
  const camera = cameraOf(state, alert);
  const critical = alert.level === "CRITICAL";
  return (
    <button
      type="button"
      className={`plate ${critical ? "plate-critical" : "plate-warning"}`}
      aria-label={`${alert.level} at ${camera.location}, CSI ${csiText(alert.csi)}, ${statusLabel(alert)}. Open to respond.`}
      onClick={() => onOpen(alert.id)}
    >
      <div className="hazard" aria-hidden="true" />
      <div className="plate-body">
        <div className="plate-top">
          <span className="level">
            <Icon path={icons.alert} size={15} />
            {alert.level}
          </span>
          <span className="plate-ago">{ago(alert.detectedAt, now)}</span>
        </div>

        <h2 className="plate-loc">{camera.location}</h2>
        <p className="plate-cam">
          {cameraLabel(camera)}
          {zoneOf(camera) && <span>, {zoneOf(camera)}</span>}
        </p>

        <p className="plate-reason">{alert.reason}</p>

        <div className="plate-csi">
          <span className="plate-csi-n">{csiText(alert.csi)}</span>
          <div className="plate-csi-bar">
            <span className="plate-csi-l">Crowd stability</span>
            <Gauge csi={alert.csi} tone={critical ? "plate" : "warning"} />
          </div>
        </div>

        <div className="plate-foot">
          <span className={`chip ${alert.workflow === "OBSERVING" ? "chip-attn" : ""}`}>
            {statusLabel(alert)}
          </span>
          <span className="plate-time">Detected {clockTime(alert.detectedAt)}</span>
          <Icon path={icons.chevron} size={20} />
        </div>
      </div>
    </button>
  );
}

// -- Detail ---------------------------------------------------------------------

const RESPONSES: { response: GuardResponse; label: string; hint: string }[] = [
  { response: "acknowledge", label: "Acknowledge", hint: "I’ve seen this alert" },
  { response: "responding", label: "Responding", hint: "I’m on my way or acting" },
  { response: "resolve", label: "Resolve", hint: "The situation is over" },
];

function responseAvailable(alert: AlertRecord, response: GuardResponse): boolean {
  if (!isOpen(alert)) return false;
  switch (response) {
    case "acknowledge":
      return alert.workflow === "OBSERVING";
    case "responding":
      return alert.workflow === "OBSERVING" || alert.workflow === "INVESTIGATING";
    case "resolve":
      return alert.workflow !== "MONITORING";
  }
}

function Stepper({ alert }: { alert: AlertRecord }) {
  const current = responseStep(alert);
  return (
    <ol className="stepper" aria-label="Response progress">
      {RESPONSE_STEPS.map((step, index) => (
        <li
          key={step}
          className={index < current ? "done" : index === current ? "current" : ""}
          aria-current={index === current ? "step" : undefined}
        >
          <span className="step-dot">
            {index < current ? <Icon path={icons.check} size={13} /> : null}
          </span>
          <span className="step-l">{step}</span>
        </li>
      ))}
    </ol>
  );
}

export function Detail({
  alert,
  state,
  now,
  busy,
  onBack,
  onRespond,
}: {
  alert: AlertRecord;
  state: AlertState;
  now: number;
  busy: GuardResponse | null;
  onBack: () => void;
  onRespond: (response: GuardResponse) => void;
}) {
  const camera = cameraOf(state, alert);
  const critical = alert.level === "CRITICAL";
  const rows: [string, ReactNode][] = [
    ["Location", camera.location],
    ["Camera", cameraLabel(camera)],
    ["Zone", zoneOf(camera) ?? "Not set"],
    ["Crowd condition", CROWD_STATUS[alert.crowdStatus]],
    [
      "Detected",
      <>
        {clockTime(alert.detectedAt)} <span className="soft">({ago(alert.detectedAt, now)})</span>
      </>,
    ],
    ["Last update", clockTime(alert.updatedAt)],
    [
      "Status",
      <>
        {statusLabel(alert)}
        {alert.actor && <span className="soft"> by {alert.actor}</span>}
      </>,
    ],
  ];

  return (
    <div className="detail">
      <header className={`hero ${critical ? "hero-critical" : "hero-warning"}`}>
        <div className="hazard" aria-hidden="true" />
        <div className="hero-body">
          <div className="hero-nav">
            <button type="button" className="back" onClick={onBack} aria-label="Back to alerts">
              <Icon path={icons.back} size={22} />
            </button>
            <span className="level level-hero">
              <Icon path={icons.alert} size={16} />
              {alert.level}
            </span>
          </div>
          <h1 className="hero-loc">{camera.location}</h1>
          <p className="hero-cam">{cameraLabel(camera)}</p>
          <div className="hero-csi">
            <span className="hero-csi-n">{csiText(alert.csi)}</span>
            <div className="hero-csi-bar">
              <span className="hero-csi-l">Crowd stability out of 100. Lower is more dangerous.</span>
              <Gauge csi={alert.csi} tone={critical ? "plate" : "warning"} />
            </div>
          </div>
        </div>
      </header>

      <div className="detail-body">
        <section className="panel">
          <h2 className="panel-h">Why this alert</h2>
          <p className="reason">{alert.reason}</p>
          {alert.contributor && <p className="contributor">{alert.contributor}</p>}
        </section>

        <section className="panel">
          <h2 className="panel-h">Your response</h2>
          <Stepper alert={alert} />
          {isOpen(alert) ? (
            <div className="actions">
              {RESPONSES.map(({ response, label, hint }) => {
                const available = responseAvailable(alert, response);
                return (
                  <button
                    key={response}
                    type="button"
                    className={`act act-${response}`}
                    disabled={!available || busy !== null}
                    onClick={() => onRespond(response)}
                  >
                    <span className="act-l">{busy === response ? "Sending…" : label}</span>
                    <span className="act-h">{hint}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="resolved-note">
              <Icon path={icons.shieldCheck} size={18} />
              Resolved {alert.resolvedAt ? dateTime(alert.resolvedAt) : ""}. Nothing more to do.
            </p>
          )}
        </section>

        <section className="panel">
          <h2 className="panel-h">Details</h2>
          <dl className="facts">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}

// -- History --------------------------------------------------------------------

export function History({
  state,
  onOpen,
  onClear,
  onSignOut,
}: {
  state: AlertState;
  onOpen: (id: string) => void;
  onClear: () => void;
  onSignOut: (() => void) | null;
}) {
  const resolved = state.alerts.some((alert) => !isOpen(alert));
  return (
    <>
      <div className="section-h">
        <h1>History</h1>
        {resolved && (
          <button type="button" className="btn-link" onClick={onClear}>
            Clear resolved
          </button>
        )}
      </div>
      {state.alerts.length === 0 ? (
        <div className="empty">
          <Icon path={icons.history} size={28} />
          <p>Alerts this phone receives are kept here, newest first.</p>
        </div>
      ) : (
        <ul className="rows">
          {state.alerts.map((alert) => {
            const camera = cameraOf(state, alert);
            const critical = alert.level === "CRITICAL";
            return (
              <li key={alert.id}>
                <button
                  type="button"
                  className="row"
                  aria-label={`${alert.level} at ${camera.location}, ${statusLabel(alert)}`}
                  onClick={() => onOpen(alert.id)}
                >
                  <span className={`row-tag ${critical ? "tag-critical" : "tag-warning"}`}>
                    <Icon path={icons.alert} size={16} />
                  </span>
                  <span className="row-main">
                    <span className="row-loc">{camera.location}</span>
                    <span className="row-meta">
                      <span className={critical ? "t-critical" : "t-warning"}>{alert.level}</span>
                      <span>{dateTime(alert.detectedAt)}</span>
                    </span>
                  </span>
                  <span className={`chip ${isOpen(alert) ? "chip-open" : "chip-done"}`}>
                    {statusLabel(alert)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {onSignOut && (
        <button type="button" className="btn-small signout" onClick={onSignOut}>
          Sign out
        </button>
      )}
    </>
  );
}

// -- In-app notification ------------------------------------------------------

export interface Toast {
  key: string;
  alertId: string;
  level: "WARNING" | "CRITICAL";
  title: string;
  body: string;
}

export function ToastStack({
  toasts,
  onOpen,
  onDismiss,
}: {
  toasts: Toast[];
  onOpen: (toast: Toast) => void;
  onDismiss: (key: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" role="alert" aria-live="assertive">
      {toasts.map((toast) => (
        <div
          key={toast.key}
          className={`toast ${toast.level === "CRITICAL" ? "toast-critical" : "toast-warning"}`}
        >
          <div className="hazard" aria-hidden="true" />
          <div className="toast-row">
            <button type="button" className="toast-body" onClick={() => onOpen(toast)}>
              <span className="toast-t">
                <Icon path={icons.alert} size={18} />
                {toast.title}
              </span>
              <span className="toast-b">{toast.body}</span>
              <span className="toast-cta">Tap to respond</span>
            </button>
            <button
              type="button"
              className="toast-x"
              aria-label="Dismiss"
              onClick={() => onDismiss(toast.key)}
            >
              <Icon path={icons.close} size={18} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// -- Sign in --------------------------------------------------------------------

export function SignIn({
  setupRequired,
  onSignIn,
}: {
  setupRequired: boolean;
  onSignIn: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSignIn(email, password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="signin">
      <div className="hazard hazard-thin" aria-hidden="true" />
      <div className="signin-body">
        <span className="brand-mark">
          <Icon path={icons.shield} size={28} />
        </span>
        <h1>SurgeGuard Security</h1>
        <p className="soft">Sign in with your SurgeGuard operator account.</p>
        {setupRequired ? (
          <p className="form-error">
            SurgeGuard has no accounts yet. Create the first account in the Command Center, then
            sign in here.
          </p>
        ) : (
          <form onSubmit={submit}>
            <label>
              Email
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
