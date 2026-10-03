/**
 * Device-level alerting: system notifications, vibration and an alert tone.
 *
 * Each is used only where the browser genuinely supports it. System
 * notifications need a secure context (https, or localhost) and the user's
 * permission; Android Chrome additionally only shows them through a service
 * worker, which is why one is registered. The in-app banner never depends on
 * any of this.
 */

import type { AlertNotice } from "./alerts";

export type DeviceNotifications = "unsupported" | "insecure" | "default" | "granted" | "denied";

export function deviceNotificationStatus(): DeviceNotifications {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (!window.isSecureContext) return "insecure";
  return Notification.permission;
}

let registration: Promise<ServiceWorkerRegistration | null> | null = null;

export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (registration) return registration;
  registration =
    typeof navigator !== "undefined" && "serviceWorker" in navigator && window.isSecureContext
      ? navigator.serviceWorker.register("/sw.js").catch(() => null)
      : Promise.resolve(null);
  return registration;
}

export async function requestDeviceNotifications(): Promise<DeviceNotifications> {
  const status = deviceNotificationStatus();
  if (status !== "default") return status;
  const result = await Notification.requestPermission();
  if (result === "granted") await registerServiceWorker();
  return result;
}

export interface NoticeText {
  title: string;
  body: string;
}

async function showSystemNotification(text: NoticeText, tag: string, critical: boolean) {
  if (deviceNotificationStatus() !== "granted") return;
  const options: NotificationOptions = {
    body: text.body,
    tag,
    requireInteraction: critical,
    icon: "/icon.svg",
    badge: "/icon.svg",
  };
  const worker = await registerServiceWorker();
  if (worker) {
    await worker.showNotification(text.title, options);
    return;
  }
  try {
    const notification = new Notification(text.title, options);
    notification.onclick = () => window.focus();
  } catch {
    // Some mobile browsers only allow notifications from a service worker.
  }
}

let audio: AudioContext | null = null;

/** Called from a user gesture, so the alert tone is allowed to play later. */
export function unlockSound(): void {
  if (typeof window === "undefined" || !("AudioContext" in window)) return;
  audio ??= new AudioContext();
  if (audio.state === "suspended") void audio.resume();
}

function playTone(critical: boolean): void {
  if (!audio || audio.state !== "running") return;
  const pulses = critical ? 3 : 1;
  const start = audio.currentTime;
  for (let i = 0; i < pulses; i += 1) {
    const at = start + i * 0.28;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = "square";
    oscillator.frequency.value = critical ? 880 : 660;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.24);
  }
}

/** Everything the device can do to get attention, for one notice. */
export function alertDevice(notice: AlertNotice, text: NoticeText): void {
  const critical = notice.alert.level === "CRITICAL";
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(critical ? [400, 150, 400, 150, 400] : [250]);
  }
  playTone(critical);
  // Tagged per alert and level: an escalation replaces the warning on the lock
  // screen instead of stacking beside it, and nothing notifies twice.
  void showSystemNotification(text, `${notice.alert.id}:${notice.alert.level}`, critical);
}
