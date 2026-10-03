import type { OperationalState, OperationalStatus } from "@/types/contracts";

import type { AlertRecord, AlertState, CameraInfo } from "./alerts";
import type { NoticeText } from "./notify";

/** The crowd condition, named as the Command Center names it. */
export const CROWD_STATUS: Record<OperationalStatus, string> = {
  STABLE: "Stable",
  OBSERVE: "Observe",
  ATTENTION_REQUIRED: "Attention Required",
  HIGH_ALERT: "High Alert",
  CRITICAL: "Critical",
};

/** The operator workflow phase, in the words a guard uses. */
export const RESPONSE_STATUS: Record<OperationalState, string> = {
  MONITORING: "Resolved",
  OBSERVING: "Not acknowledged",
  INVESTIGATING: "Acknowledged",
  RESPONDING: "Responding",
  RECOVERING: "Recovering",
};

export function statusLabel(alert: AlertRecord): string {
  return alert.resolvedAt ? "Resolved" : RESPONSE_STATUS[alert.workflow];
}

export function cameraOf(state: AlertState, alert: AlertRecord): CameraInfo {
  return (
    state.cameras[alert.cameraId] ?? {
      cameraId: alert.cameraId,
      displayId: alert.cameraId,
      name: alert.cameraId,
      location: "Location not reported",
      coverageArea: "",
      enabled: true,
      watching: false,
    }
  );
}

/** The zone the camera covers, when one has been set (the backend defaults it to the id). */
export function zoneOf(camera: CameraInfo): string | null {
  return camera.coverageArea && camera.coverageArea !== camera.cameraId ? camera.coverageArea : null;
}

/** "Camera 01 (CAM-01)", or just the name when the two are the same. */
export function cameraLabel(camera: CameraInfo): string {
  return camera.displayId === camera.name ? camera.name : `${camera.name} (${camera.displayId})`;
}

/**
 * Where the guard's response stands, as a sequence. The backend's workflow
 * really is ordered this way: acknowledge, then respond, then close.
 */
export const RESPONSE_STEPS = ["New", "Acknowledged", "Responding", "Resolved"] as const;

export function responseStep(alert: AlertRecord): number {
  if (alert.resolvedAt || alert.workflow === "MONITORING") return 3;
  if (alert.workflow === "RESPONDING" || alert.workflow === "RECOVERING") return 2;
  if (alert.workflow === "INVESTIGATING") return 1;
  return 0;
}

const TIME = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const DATE_TIME = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function clockTime(iso: string): string {
  return TIME.format(new Date(iso));
}

export function dateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}

export function ago(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min ago`;
}

export function csiText(csi: number): string {
  return csi.toFixed(0);
}

export function noticeText(
  state: AlertState,
  alert: AlertRecord,
  kind: "new" | "escalated",
): NoticeText {
  const camera = cameraOf(state, alert);
  const prefix = kind === "escalated" ? "Escalated to " : "";
  return {
    title: `${prefix}${alert.level} at ${camera.location}`,
    body: `${cameraLabel(camera)}, CSI ${csiText(alert.csi)}. ${alert.reason}`,
  };
}
