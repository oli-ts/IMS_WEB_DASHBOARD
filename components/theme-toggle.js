"use client";

import { useEffect, useRef, useState } from "react";

export default function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  // 'light' | 'dark' | 'system'
  const [mode, setMode] = useState("system");
  const mqlRef = useRef(null);
  const handlerRef = useRef(null);

  useEffect(() => {
    setMounted(true);
    try {
      const ls = localStorage.getItem("theme");
      const initial = ls === "light" || ls === "dark" || ls === "system" ? ls : "system";
      setMode(initial);
      const mql = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
      mqlRef.current = mql;
      applyMode(initial, mql?.matches);
      if (initial === "system" && mql) {
        const handler = (e) => applyMode("system", e.matches);
        handlerRef.current = handler;
        mql.addEventListener ? mql.addEventListener("change", handler) : mql.addListener(handler);
        return () => {
          if (handlerRef.current) {
            mql.removeEventListener ? mql.removeEventListener("change", handlerRef.current) : mql.removeListener(handlerRef.current);
            handlerRef.current = null;
          }
        };
      }
    } catch (_) {}
  }, []);

  function applyMode(nextMode, systemPrefersDark) {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    if (nextMode === "light") root.classList.add("light");
    else if (nextMode === "dark") root.classList.add("dark");
    else if (systemPrefersDark) root.classList.add("dark");
  }

  function toggle() {
    // Add a transient class to enable smooth CSS transitions during theme switch
    const root = document.documentElement;
    root.classList.add("theme-transition");
    const order = ["system", "dark", "light"]; // cycle
    const idx = order.indexOf(mode);
    const next = order[(idx + 1) % order.length];
    setMode(next);
    try {
      localStorage.setItem("theme", next);
    } catch (_) {}
    const mql = mqlRef.current;
    const prefersDark = mql?.matches;
    applyMode(next, prefersDark);
    // Manage system listener lifecycle
    if (next === "system" && mql) {
      if (!handlerRef.current) {
        const handler = (e) => applyMode("system", e.matches);
        handlerRef.current = handler;
        mql.addEventListener ? mql.addEventListener("change", handler) : mql.addListener(handler);
      }
    } else if (handlerRef.current && mql) {
      mql.removeEventListener ? mql.removeEventListener("change", handlerRef.current) : mql.removeListener(handlerRef.current);
      handlerRef.current = null;
    }
    // Remove transition class after animation
    window.setTimeout(() => {
      root.classList.remove("theme-transition");
    }, 220);
  }

  // Avoid hydration mismatch by rendering a neutral button before mount
  const label = !mounted ? "Theme" : mode === "system" ? "System" : mode === "dark" ? "Dark" : "Light";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle color theme (system/dark/light)"
      title={`Theme: ${label} (click to change)`}
      className="inline-flex h-9 px-3 items-center justify-center rounded-xl border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-100 text-xs font-medium"
    >
      {label}
    </button>
  );
}
