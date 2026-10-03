import { describe, expect, it } from "vitest";

import type { CameraDecision, OperationalIntelligenceReport } from "@/types/contracts";
import type { Envelope } from "@/types/realtime";

import {
  activeAlerts,
  applyCameras,
  applyReport,
  applySnapshot,
  applyWorkflow,
  EMPTY_STATE,
  levelOf,
  type AlertState,
} from "./alerts";
import { reduceEnvelope } from "./useAlerts";

const NOW = "2026-09-19T17:00:00.000Z";

function report(
  sequence: number,
  status: OperationalIntelligenceReport["status"],
  csi = 30,
): OperationalIntelligenceReport {
  return {
    sequence,
    revision: sequence,
    generated_at: `2026-09-19T16:${String(sequence).padStart(2, "0")}:00.000Z`,
    frame_seq: sequence * 10,
    status,
    priority: "HIGH",
    csi,
    confidence: 0.8,
    situation_summary: `Summary ${sequence}`,
    primary_causes: [],
    supporting_evidence: [],
    dominant_contributor_statement: "Largest contributor: density.",
    recommended_actions: [],
    suppressed_actions: 0,
  } as unknown as OperationalIntelligenceReport;
}

describe("levelOf", () => {
  it("uses the backend's own WARNING / CRITICAL mapping", () => {
    expect(levelOf("STABLE")).toBeNull();
    expect(levelOf("OBSERVE")).toBeNull();
    expect(levelOf("ATTENTION_REQUIRED")).toBe("WARNING");
    expect(levelOf("HIGH_ALERT")).toBe("WARNING");
    expect(levelOf("CRITICAL")).toBe("CRITICAL");
  });
});

describe("applyReport", () => {
  it("ignores reports below WARNING", () => {
    const step = applyReport(EMPTY_STATE, "cam-01", report(1, "OBSERVE"), null, NOW);
    expect(step.state.alerts).toHaveLength(0);
    expect(step.notices).toHaveLength(0);
  });

  it("opens an alert and notifies once for a WARNING", () => {
    const first = applyReport(EMPTY_STATE, "cam-01", report(1, "HIGH_ALERT", 42), null, NOW);
    expect(first.notices).toEqual([expect.objectContaining({ kind: "new" })]);
    expect(first.state.alerts[0]).toMatchObject({
      level: "WARNING",
      csi: 42,
      reason: "Summary 1",
      workflow: "OBSERVING",
      resolvedAt: null,
    });

    // A reissued report for the same situation does not notify again.
    const again = applyReport(first.state, "cam-01", report(2, "HIGH_ALERT", 40), null, NOW);
    expect(again.notices).toHaveLength(0);
    expect(again.state.alerts).toHaveLength(1);
    expect(again.state.alerts[0]?.csi).toBe(40);
  });

  it("notifies again when the same situation escalates to CRITICAL", () => {
    const warning = applyReport(EMPTY_STATE, "cam-01", report(1, "ATTENTION_REQUIRED"), null, NOW);
    const critical = applyReport(warning.state, "cam-01", report(2, "CRITICAL", 12), null, NOW);
    expect(critical.notices).toEqual([expect.objectContaining({ kind: "escalated" })]);
    expect(critical.state.alerts).toHaveLength(1);
    expect(critical.state.alerts[0]?.level).toBe("CRITICAL");

    // De-escalating keeps the peak level and does not notify.
    const eased = applyReport(critical.state, "cam-01", report(3, "HIGH_ALERT"), null, NOW);
    expect(eased.notices).toHaveLength(0);
    expect(eased.state.alerts[0]?.level).toBe("CRITICAL");
    expect(eased.state.alerts[0]?.crowdStatus).toBe("HIGH_ALERT");
  });

  it("treats a lower report sequence as a backend restart and a new situation", () => {
    const before = applyReport(EMPTY_STATE, "cam-01", report(9, "CRITICAL"), null, NOW);
    const after = applyReport(before.state, "cam-01", report(1, "CRITICAL"), null, NOW);
    expect(after.notices).toEqual([expect.objectContaining({ kind: "new" })]);
    expect(after.state.alerts).toHaveLength(2);
    expect(activeAlerts(after.state)).toHaveLength(1);
  });

  it("keeps one open alert per camera", () => {
    let state: AlertState = EMPTY_STATE;
    state = applyReport(state, "cam-01", report(1, "CRITICAL"), null, NOW).state;
    state = applyReport(state, "CAM-02", report(1, "HIGH_ALERT"), null, NOW).state;
    const active = activeAlerts(state);
    expect(active.map((alert) => alert.level)).toEqual(["CRITICAL", "WARNING"]);
  });
});

describe("applyWorkflow", () => {
  it("tracks acknowledge / respond and resolves at MONITORING", () => {
    let state = applyReport(EMPTY_STATE, "cam-01", report(1, "CRITICAL"), null, NOW).state;
    state = applyWorkflow(state, "cam-01", "INVESTIGATING", "Guard A", NOW);
    expect(state.alerts[0]).toMatchObject({ workflow: "INVESTIGATING", actor: "Guard A" });
    state = applyWorkflow(state, "cam-01", "RESPONDING", null, NOW);
    expect(state.alerts[0]).toMatchObject({ workflow: "RESPONDING", actor: "Guard A" });
    state = applyWorkflow(state, "cam-01", "MONITORING", null, NOW);
    expect(state.alerts[0]?.resolvedAt).toBe(NOW);
    expect(activeAlerts(state)).toHaveLength(0);
  });

  it("opens a new alert after the previous one resolved", () => {
    let state = applyReport(EMPTY_STATE, "cam-01", report(1, "CRITICAL"), null, NOW).state;
    state = applyWorkflow(state, "cam-01", "MONITORING", null, NOW);
    const next = applyReport(state, "cam-01", report(5, "HIGH_ALERT"), null, NOW);
    expect(next.notices).toHaveLength(1);
    expect(next.state.alerts).toHaveLength(2);
  });
});

describe("applySnapshot", () => {
  const decision = (
    cameraId: string,
    rep: OperationalIntelligenceReport | null,
    state: CameraDecision["operational_state"],
  ) =>
    ({
      camera_id: cameraId,
      report: rep,
      operational_state: state,
      received_at: null,
      age_seconds: null,
      is_stale: false,
    }) as CameraDecision;

  it("does not re-notify an alert already held after a reconnect", () => {
    const first = applySnapshot(
      EMPTY_STATE,
      [],
      { "cam-01": decision("cam-01", report(3, "CRITICAL"), "OBSERVING") },
      NOW,
    );
    expect(first.notices).toHaveLength(1);
    const reconnect = applySnapshot(
      first.state,
      [],
      { "cam-01": decision("cam-01", report(3, "CRITICAL"), "INVESTIGATING") },
      NOW,
    );
    expect(reconnect.notices).toHaveLength(0);
    expect(reconnect.state.alerts[0]?.workflow).toBe("INVESTIGATING");
  });

  it("resolves alerts that ended while disconnected", () => {
    const held = applySnapshot(
      EMPTY_STATE,
      [],
      { "cam-01": decision("cam-01", report(3, "CRITICAL"), "OBSERVING") },
      NOW,
    ).state;
    const later = applySnapshot(
      held,
      [],
      { "cam-01": decision("cam-01", report(8, "STABLE"), "MONITORING") },
      NOW,
    );
    expect(later.notices).toHaveLength(0);
    expect(activeAlerts(later.state)).toHaveLength(0);
  });
});

describe("reduceEnvelope", () => {
  const envelope = (type: Envelope["type"], data: unknown, camera: string | null = null) =>
    ({ type, seq: 1, ts: NOW, camera_id: camera, data }) as Envelope;

  it("routes oir.updated by the envelope's camera id", () => {
    const step = reduceEnvelope(
      EMPTY_STATE,
      envelope("oir.updated", report(1, "CRITICAL"), "CAM-02"),
      NOW,
    );
    expect(step.state.alerts[0]?.cameraId).toBe("CAM-02");
    expect(step.notices).toHaveLength(1);
  });

  it("applies state.updated with the acting operator", () => {
    const opened = reduceEnvelope(
      EMPTY_STATE,
      envelope("oir.updated", report(1, "HIGH_ALERT"), "cam-01"),
      NOW,
    ).state;
    const step = reduceEnvelope(
      opened,
      envelope("state.updated", {
        camera_id: "cam-01",
        operational_state: "RESPONDING",
        actor: "Guard B",
      }),
      NOW,
    );
    expect(step.state.alerts[0]).toMatchObject({ workflow: "RESPONDING", actor: "Guard B" });
  });

  it("ignores unrelated message types", () => {
    const step = reduceEnvelope(EMPTY_STATE, envelope("csi.updated", {}), NOW);
    expect(step.state).toBe(EMPTY_STATE);
  });
});

describe("applyCameras", () => {
  const camera = (status: string, enabled = true) =>
    ({
      camera_id: "cam-01",
      display_id: "CAM-01",
      name: "Camera 01",
      location: "Platform 3",
      coverage_area: "Stairs",
      enabled,
      status,
    }) as unknown as Parameters<typeof applyCameras>[1][number];

  it("marks only enabled cameras delivering frames as watching", () => {
    expect(applyCameras(EMPTY_STATE, [camera("ONLINE")]).cameras["cam-01"]?.watching).toBe(true);
    expect(applyCameras(EMPTY_STATE, [camera("RECOVERING")]).cameras["cam-01"]?.watching).toBe(false);
    expect(applyCameras(EMPTY_STATE, [camera("ONLINE", false)]).cameras["cam-01"]?.watching).toBe(
      false,
    );
  });

  it("returns the same state when nothing changed", () => {
    const once = applyCameras(EMPTY_STATE, [camera("ONLINE")]);
    expect(applyCameras(once, [camera("ONLINE")])).toBe(once);
  });
});
