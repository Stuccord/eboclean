"use client";

import { useEffect, useState } from "react";
import { LogoMark } from "./Logo";

/** Registers the service worker (production only; it would fight with hot reload in dev). */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
  }, []);
  return null;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type InstallMode = "installed" | "android" | "ios" | "unsupported";

const DISMISS_KEY = "eboclean-install-dismissed";

/** Works out whether (and how) the app can be installed on this device. */
export function useInstall() {
  const [mode, setMode] = useState<InstallMode>("unsupported");
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    // Decide asynchronously so the first render matches the server.
    Promise.resolve().then(() => {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
      setMode(standalone ? "installed" : ios ? "ios" : "unsupported");
    });

    const onPrompt = (e: Event) => {
      e.preventDefault(); // show our own button instead of the browser mini-bar
      setPromptEvent(e as BeforeInstallPromptEvent);
      setMode("android");
    };
    const onInstalled = () => {
      setPromptEvent(null);
      setMode("installed");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === "accepted") setMode("installed");
    setPromptEvent(null);
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return { mode, install, dismiss, dismissed, canPrompt: Boolean(promptEvent) };
}

/** "Add Eboclean to your home screen" card. Hidden when installed or not installable. */
export function InstallCard({ compact = false }: { compact?: boolean }) {
  const { mode, install, dismiss, dismissed, canPrompt } = useInstall();
  const [showIosSteps, setShowIosSteps] = useState(false);

  if (mode === "installed" || mode === "unsupported") return null;
  if (compact && dismissed) return null;

  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-indigo-950/5">
      <div className="flex items-center gap-3">
        <LogoMark size={48} className="shrink-0" />
        <div className="flex-1">
          <p className="font-black">Add Eboclean to your home screen</p>
          <p className="text-sm text-indigo-900/60">Opens like a real app, full screen, even offline.</p>
        </div>
        {compact && (
          <button onClick={dismiss} className="self-start rounded-full px-2 text-indigo-900/40 hover:text-indigo-900" aria-label="Dismiss">
            ✕
          </button>
        )}
      </div>

      {mode === "android" && canPrompt && (
        <button onClick={install} className="mt-3 w-full rounded-2xl bg-violet-600 py-3 text-sm font-black text-white shadow-lg shadow-violet-600/25 hover:bg-violet-700">
          📲 Install app
        </button>
      )}

      {mode === "ios" &&
        (showIosSteps ? (
          <ol className="mt-3 space-y-2 rounded-2xl bg-indigo-50 p-3 text-sm">
            <li>
              1. Tap the <b>Share</b> button <span aria-hidden>⬆️</span> at the bottom of Safari
            </li>
            <li>
              2. Scroll and tap <b>Add to Home Screen</b> <span aria-hidden>➕</span>
            </li>
            <li>
              3. Tap <b>Add</b>. Eboclean appears with your other apps.
            </li>
          </ol>
        ) : (
          <button onClick={() => setShowIosSteps(true)} className="mt-3 w-full rounded-2xl bg-violet-600 py-3 text-sm font-black text-white shadow-lg shadow-violet-600/25 hover:bg-violet-700">
            📲 Show me how
          </button>
        ))}
    </div>
  );
}
