/**
 * Alert tracking - from the backend's reports to the alerts a guard works.
 *
 * Nothing here detects anything. Every alert is a camera's Operational
 * Intelligence Report whose Operational Status the backend itself classes as
 * WARNING or CRITICAL - the same mapping the alert hardware and the timeline
 * use (backend hardware/levels.py, services/decision_service.py):
 *
 *   ATTENTION_REQUIRED, HIGH_ALERT -> WARNING
 *   CRITICAL                       -> CRITICAL
 *
 * An alert opens when a camera's report first reaches one of those levels and
 * stays open until the camera's operator workflow is back at MONITORING - either
 * because someone resolved it, or because the backend saw conditions recover.
 * One open alert per camera is what stops the same situation notifying again
 * on every reissued report, reconnect or page reload.
 *
 * Pure: every function takes state and returns new state, plus the
 * notifications the caller should raise.
 */

import type {
  Camera,
  CameraDecision,
  OperationalIntelligenceReport,
  OperationalState,
  OperationalStatus,
} from "@/types/contracts";

export type AlertLevel = "WARNING" | "CRITICAL";

export interface CameraInfo {
  cameraId: string;
  displayId: string;
  name: string;
  location: string;
  coverageArea: string;
  enabled: boolean;
  /** Enabled and delivering frames, so the backend can actually raise alerts for it. */
  watching: boolean;
}

export interface AlertRecord {
  id: string;
  cameraId: string;
  /** Highest level this situation reached. */
  level: AlertLevel;
  /** The crowd condition on the camera's latest report. */
  crowdStatus: OperationalStatus;
  csi: number;
  reason: string;
  contributor: string | null;
  /** When the report that opened this alert was generated. */
  detectedAt: string;
  updatedAt: string;
  /** The operator workflow phase the backend reports for the camera. */
  workflow: OperationalState;
  /** Last operator to act on it, as the backend attributed it. */
  actor: string | null;
  resolvedAt: string | null;
  lastSequence: number;
}

export interface AlertState {
  cameras: Record<string, CameraInfo>;
  /** Newest first. Open and resolved alike; `resolvedAt` tells them apart. */
  alerts: AlertRecord[];
}

export interface AlertNotice {
  alert: AlertRecord;
  kind: "new" | "escalated";
}

export interface Transition {
  state: AlertState;
  notices: AlertNotice[];
}

export const HISTORY_LIMIT = 100;

export const EMPTY_STATE: AlertState = { cameras: {}, alerts: [] };

const LEVEL_OF: Partial<Record<OperationalStatus, AlertLevel>> = {
  ATTENTION_REQUIRED: "WARNING",
  HIGH_ALERT: "WARNING",
  CRITICAL: "CRITICAL",
};

const RANK: Record<AlertLevel, number> = { WARNING: 1, CRITICAL: 2 };

export function levelOf(status: OperationalStatus): AlertLevel | null {
  return LEVEL_OF[status] ?? null;
}

export function isOpen(alert: AlertRecord): boolean {
  return alert.resolvedAt === null;
}

export function toCameraInfo(camera: Camera): CameraInfo {
  return {
    cameraId: camera.camera_id,
    displayId: camera.display_id,
    name: camera.name,
    location: camera.location,
    coverageArea: camera.coverage_area,
    enabled: camera.enabled,
    watching: camera.enabled && (camera.status === "ONLINE" || camera.status === "DEGRADED"),
  };
}

/**
 * The camera list, as the backend reports it. Pushed every second; returns the
 * same state when nothing changed, so an idle feed does not rewrite storage.
 */
export function applyCameras(state: AlertState, cameras: Camera[]): AlertState {
  const next: Record<string, CameraInfo> = {};
  for (const camera of cameras) next[camera.camera_id] = toCameraInfo(camera);
  if (JSON.stringify(next) === JSON.stringify(state.cameras)) return state;
  return { ...state, cameras: next };
}

function openFor(state: AlertState, cameraId: string): AlertRecord | undefined {
  return state.alerts.find((alert) => alert.cameraId === cameraId && isOpen(alert));
}

function replace(state: AlertState, updated: AlertRecord): AlertState {
  return {
    ...state,
    alerts: state.alerts.map((alert) => (alert.id === updated.id ? updated : alert)),
  };
}

function resolve(alert: AlertRecord, at: string): AlertRecord {
  return { ...alert, resolvedAt: at };
}

/** A new report for a camera. */
export function applyReport(
  state: AlertState,
  cameraId: string,
  report: OperationalIntelligenceReport,
  workflow: OperationalState | null,
  now: string,
): Transition {
  const level = levelOf(report.status);
  let open = openFor(state, cameraId);
  let current = state;

  // A report numbered below the one we hold means the backend restarted: its
  // report sequence began again, and whatever we held open ended with it.
  if (open && report.sequence < open.lastSequence) {
    current = replace(current, resolve(open, now));
    open = undefined;
  }

  if (open) {
    if (report.sequence === open.lastSequence && workflow === null) {
      return { state: current, notices: [] };
    }
    const escalated = level !== null && RANK[level] > RANK[open.level];
    const updated: AlertRecord = {
      ...open,
      level: escalated && level ? level : open.level,
      crowdStatus: report.status,
      csi: report.csi,
      reason: report.situation_summary,
      contributor: report.dominant_contributor_statement,
      updatedAt: report.generated_at,
      workflow: workflow ?? open.workflow,
      lastSequence: report.sequence,
    };
    const settled =
      level === null && updated.workflow === "MONITORING" ? resolve(updated, now) : updated;
    return {
      state: replace(current, settled),
      notices: escalated ? [{ alert: settled, kind: "escalated" }] : [],
    };
  }

  if (level === null) return { state: current, notices: [] };

  const created: AlertRecord = {
    id: `${cameraId}:${report.sequence}:${report.generated_at}`,
    cameraId,
    level,
    crowdStatus: report.status,
    csi: report.csi,
    reason: report.situation_summary,
    contributor: report.dominant_contributor_statement,
    detectedAt: report.generated_at,
    updatedAt: report.generated_at,
    workflow: workflow ?? "OBSERVING",
    actor: null,
    resolvedAt: null,
    lastSequence: report.sequence,
  };
  return {
    state: { ...current, alerts: [created, ...current.alerts].slice(0, HISTORY_LIMIT) },
    notices: [{ alert: created, kind: "new" }],
  };
}

/** A camera's operator workflow phase changed. */
export function applyWorkflow(
  state: AlertState,
  cameraId: string,
  workflow: OperationalState,
  actor: string | null,
  now: string,
): AlertState {
  const open = openFor(state, cameraId);
  if (!open) return state;
  const updated: AlertRecord = { ...open, workflow, actor: actor ?? open.actor };
  // Back at rest: the situation is over, whether a person closed it or the
  // backend saw the crowd recover and hold.
  return replace(state, workflow === "MONITORING" ? resolve(updated, now) : updated);
}

/**
 * Full current state, sent first on every connection and on every resync.
 *
 * Also closes alerts for cameras the backend no longer reports, so a camera
 * removed while this app was offline does not leave an alert open forever.
 */
export function applySnapshot(
  state: AlertState,
  cameras: Camera[],
  decisions: Record<string, CameraDecision>,
  now: string,
): Transition {
  let current = applyCameras(state, cameras);
  const notices: AlertNotice[] = [];

  for (const decision of Object.values(decisions)) {
    if (decision.report) {
      const step = applyReport(
        current,
        decision.camera_id,
        decision.report,
        decision.operational_state,
        now,
      );
      current = step.state;
      notices.push(...step.notices);
    } else {
      current = applyWorkflow(current, decision.camera_id, "MONITORING", null, now);
    }
    current = applyWorkflow(current, decision.camera_id, decision.operational_state, null, now);
  }

  for (const alert of current.alerts) {
    if (isOpen(alert) && !(alert.cameraId in decisions)) {
      current = replace(current, resolve(alert, now));
    }
  }
  return { state: current, notices };
}

/** Open alerts, CRITICAL first, then newest first. */
export function activeAlerts(state: AlertState): AlertRecord[] {
  return state.alerts
    .filter(isOpen)
    .sort(
      (a, b) =>
        RANK[b.level] - RANK[a.level] || Date.parse(b.detectedAt) - Date.parse(a.detectedAt),
    );
}
