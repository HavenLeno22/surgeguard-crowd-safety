# SurgeGuard Security Alert App

A phone-first app for security staff. When the SurgeGuard backend reports a
**WARNING** or **CRITICAL** situation on any camera, the app shows it at once,
notifies the guard, and lets them **Acknowledge**, mark **Responding**, or
**Resolve** it. Their response goes back to the backend.

It is not a second dashboard and it has no detection of its own. It only shows
what the backend reports.

## Where alerts come from

| What the app shows | Where it comes from in the backend |
| --- | --- |
| Alert level | The camera's Operational Intelligence Report `status`, using the backend's own mapping (`hardware/levels.py`, `services/decision_service.py`): `ATTENTION_REQUIRED`, `HIGH_ALERT` → **WARNING**; `CRITICAL` → **CRITICAL** |
| Live updates | The Command Center socket `/ws/command-center`: `snapshot` (`camera_decisions`, `cameras`), `oir.updated`, `state.updated`, `cameras.changed`, `camera.status` |
| Location, camera, zone | `CameraRead.location`, `display_id` / `name`, `coverage_area` |
| CSI, reason | `report.csi`, `report.situation_summary`, `report.dominant_contributor_statement` |
| Current status | The camera's Operational State (`OBSERVING` = new, `INVESTIGATING` = acknowledged, `RESPONDING`, `RECOVERING`, `MONITORING` = resolved) |
| Acknowledge / Responding / Resolve | `POST /api/v1/cameras/{camera_id}/operations` with `ACKNOWLEDGE` / `LOG_ACTION` / `CLOSE`. Each action is attributed to the signed-in operator and recorded on the timeline. The backend refuses **Resolve** until the crowd is back to Stable, and the app shows that message. |

Each camera has at most one open alert. An alert opens when the camera's report
first reaches WARNING or CRITICAL. It closes when the camera's workflow is back
at `MONITORING`, either because someone resolved it or because the backend saw
the crowd recover. The same situation notifies once, and again only if it
escalates from WARNING to CRITICAL. Reissued reports, reconnects and reloads
don't notify again.

The socket client is the Command Center's own
(`frontend/src/realtime/socketClient.ts`), imported rather than copied. It
provides reconnect with backoff, resync after a sequence gap, staleness
detection and sign-in expiry handling.

## Look and feel

Light theme by default. The sun/moon button in the header switches themes, and
the choice is remembered on the phone. The design borrows from transit safety
signage: each alert is a signal plate under a hazard-stripe band (solid red for
CRITICAL, amber stripes for WARNING), with Barlow and Barlow Condensed. The
fonts are bundled, so a phone on the local Wi-Fi needs no internet.

The home screen only says "All clear" when it is connected and at least one
camera is delivering frames. Otherwise it says "No live data" or "No cameras
reporting", because silence from a platform that can't see anything isn't
safety.

## Run it

The SurgeGuard backend must be running (normally on `127.0.0.1:8001` via
`scripts/surgeguard_supervisor.py`).

The app lives in its own folder, `sensora2.0/security-alert-app`:

```bash
cd security-alert-app
npm install
npm run dev
```

If the backend is unreachable when the app opens, it still shows the alerts
this phone already holds, under "Connection lost", and keeps retrying.

Open `http://localhost:5190` and sign in with a SurgeGuard operator account.
Accounts are shared with the Command Center.

**On a phone:** the dev server listens on all interfaces, so a phone on the same
Wi-Fi can open `http://<this-computer's-IP>:5190`. Set `VITE_HOST=127.0.0.1` in
`.env.local` to keep it on this machine only (see `.env.example`).

## Notifications

- **In-app banner:** always. CRITICAL banners are red, flash and stay until
  tapped. WARNING banners are amber and clear after 10 s.
- **Sound and vibration:** where the device supports them. The tone is
  unlocked by the first tap in the app, which is a browser rule.
- **System notifications:** after "Turn on alert notifications". Browsers only
  allow these in a secure context: `localhost`, or HTTPS. A phone opening the
  app over plain `http://<LAN-IP>` gets in-app alerts, sound and vibration, but
  no lock-screen notifications. That needs HTTPS in front of the app.

## Checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

`npm run preview` serves the production build on port 5191 with the same proxy.
