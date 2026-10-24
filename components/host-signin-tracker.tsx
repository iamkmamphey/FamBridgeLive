"use client";

import { useEffect } from "react";

const TRACKING_KEY = "fambridge-host-signin-reported";

export default function HostSignInTracker() {
  useEffect(() => {
    if (window.localStorage.getItem(TRACKING_KEY)) return;
    window.localStorage.setItem(TRACKING_KEY, new Date().toISOString());
    fetch("/api/host-login", { method: "POST", keepalive: true })
      .then(response => { if (!response.ok) window.localStorage.removeItem(TRACKING_KEY); })
      .catch(() => window.localStorage.removeItem(TRACKING_KEY));
  }, []);
  return null;
}

export function clearHostSignInTracking() {
  window.localStorage.removeItem(TRACKING_KEY);
}
