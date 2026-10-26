"use client";

import { useSyncExternalStore } from "react";

/*
  Chrome fires `beforeinstallprompt` once per page load, usually a moment after load. If the
  only listener lives on the home screen, the event is lost whenever that screen isn't on
  screen at that moment (or hasn't mounted yet). So the listener is installed once at app
  start and the event is kept here until someone wants it. 😀😀😀😀😀😀
*/

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferred: PromptEvent | null = null;
let installed = false;
let started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// layout.tsx puts a tiny inline script in <head> that stores the event on window as soon as
// it fires, before React has even loaded. We pick it up here, and listen for later ones too.
declare global {
  interface Window {
    __zhPrompt?: Event;
  }
}

export function startInstallWatch() {
  if (started || typeof window === "undefined") return;
  started = true;
  if (window.__zhPrompt) deferred = window.__zhPrompt as PromptEvent;
  window.addEventListener("zh-install", () => {
    deferred = (window.__zhPrompt as PromptEvent) ?? null;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
}

export async function promptInstall() {
  const e = deferred;
  if (!e) return;
  await e.prompt();
  await e.userChoice.catch(() => {});
  // The browser only lets an event be used once.
  deferred = null;
  emit();
}

export type InstallState = {
  canPrompt: boolean;
  standalone: boolean;
  secure: boolean;
  ios: boolean;
};

let cached: InstallState | null = null;
let cachedKey = "";

function read(): InstallState {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true ||
    installed;
  const state: InstallState = {
    canPrompt: deferred !== null,
    standalone,
    secure: window.isSecureContext,
    ios: /iphone|ipad|ipod/i.test(navigator.userAgent),
  };
  // useSyncExternalStore needs the same object back when nothing changed.
  const key = JSON.stringify(state);
  if (key !== cachedKey || !cached) {
    cachedKey = key;
    cached = state;
  }
  return cached;
}

const server: InstallState = { canPrompt: false, standalone: false, secure: true, ios: false };

export function useInstallState() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => server
  );
}
