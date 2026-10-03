/**
 * The live alert feed: the Command Center socket, applied to alert state.
 *
 * Uses the Command Center's own SocketClient, so reconnection with backoff,
 * sequence-gap resync, staleness detection and the 4401 "sign in" close behave
 * exactly as they do on the control-room screen.
 *
 * Alert history is kept in localStorage. It is what lets a reload or a
 * reconnect recognise an alert it has already announced.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { commandCenterUrl, SocketClient, type LinkSnapshot } from "@/realtime/socketClient";
import type { Camera, OperationalIntelligenceReport, OperationalState } from "@/types/contracts";
import type { Envelope, SnapshotData } from "@/types/realtime";

import {
  applyCameras,
  applyReport,
  applySnapshot,
  applyWorkflow,
  EMPTY_STATE,
  type AlertNotice,
  type AlertState,
  type Transition,
} from "./alerts";

const STORAGE_KEY = "surgeguard.security-alerts.v1";

function load(): AlertState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as AlertState;
    return Array.isArray(parsed.alerts) && parsed.cameras ? parsed : EMPTY_STATE;
  } catch {
    return EMPTY_STATE;
  }
}

function save(state: AlertState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private mode or full storage: alerts still work, history just won't survive a reload.
  }
}

/** Pure: one envelope applied to alert state. Exported for tests. */
export function reduceEnvelope(state: AlertState, envelope: Envelope, now: string): Transition {
  switch (envelope.type) {
    case "snapshot": {
      const data = envelope.data as SnapshotData;
      return applySnapshot(state, data.cameras ?? [], data.camera_decisions ?? {}, now);
    }
    case "oir.updated": {
      if (!envelope.camera_id) return { state, notices: [] };
      return applyReport(
        state,
        envelope.camera_id,
        envelope.data as OperationalIntelligenceReport,
        null,
        now,
      );
    }
    case "state.updated": {
      const data = envelope.data as {
        camera_id: string;
        operational_state: OperationalState;
        actor: string | null;
      };
      return {
        state: applyWorkflow(state, data.camera_id, data.operational_state, data.actor, now),
        notices: [],
      };
    }
    case "cameras.changed":
    case "camera.status": {
      const data = envelope.data as { cameras?: Camera[] };
      return { state: data.cameras ? applyCameras(state, data.cameras) : state, notices: [] };
    }
    default:
      return { state, notices: [] };
  }
}

export interface AlertFeed {
  state: AlertState;
  link: LinkSnapshot | null;
  retry: () => void;
  /** Apply the workflow phase an action returned, before the socket echoes it. */
  applyLocalWorkflow: (cameraId: string, workflow: OperationalState) => void;
  clearHistory: () => void;
}

export type NoticeHandler = (notice: AlertNotice, state: AlertState) => void;

export function useAlerts(enabled: boolean, onNotice: NoticeHandler): AlertFeed {
  const [state, setState] = useState<AlertState>(load);
  const [link, setLink] = useState<LinkSnapshot | null>(null);
  const stateRef = useRef(state);
  const clientRef = useRef<SocketClient | null>(null);
  const noticeRef = useRef(onNotice);
  useEffect(() => {
    noticeRef.current = onNotice;
  }, [onNotice]);

  const commit = useCallback((next: AlertState) => {
    if (next === stateRef.current) return;
    stateRef.current = next;
    save(next);
    setState(next);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const client = new SocketClient({
      url: () => commandCenterUrl(),
      onEnvelope: (envelope) => {
        const { state: next, notices } = reduceEnvelope(
          stateRef.current,
          envelope,
          new Date().toISOString(),
        );
        commit(next);
        for (const notice of notices) noticeRef.current(notice, next);
      },
      onLink: (snapshot) => setLink({ ...snapshot }),
      // Never give up: a guard's phone should come back on its own however
      // long the backend was away.
      maxAttempts: Number.POSITIVE_INFINITY,
    });
    clientRef.current = client;
    client.start();
    return () => {
      client.stop();
      clientRef.current = null;
    };
  }, [enabled, commit]);

  const retry = useCallback(() => clientRef.current?.retryNow(), []);

  const applyLocalWorkflow = useCallback(
    (cameraId: string, workflow: OperationalState) => {
      commit(applyWorkflow(stateRef.current, cameraId, workflow, null, new Date().toISOString()));
    },
    [commit],
  );

  const clearHistory = useCallback(() => {
    commit({
      ...stateRef.current,
      alerts: stateRef.current.alerts.filter((alert) => alert.resolvedAt === null),
    });
  }, [commit]);

  return { state, link, retry, applyLocalWorkflow, clearHistory };
}
