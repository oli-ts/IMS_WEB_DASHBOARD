"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { supabaseBrowser } from "../lib/supabase-browser";
import { Sidebar } from "./sidebar";

const AUTH_PATHS = new Set(["/signin", "/forgot-password", "/auth/reset-password"]);

export default function LayoutFrame({ children }) {
  const pathname = usePathname();
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    if (AUTH_PATHS.has(pathname)) {
      setHasSession(false);
      return;
    }
    let mounted = true;
    (async () => {
      const sb = supabaseBrowser();
      const {
        data: { session },
      } = await sb.auth.getSession();
      if (mounted) setHasSession(!!session);
    })();
    return () => {
      mounted = false;
    };
  }, [pathname]);

  const showSidebar = hasSession && !AUTH_PATHS.has(pathname);

  return (
    <div className="min-h-dvh flex">
      {showSidebar ? (
        <div className="w-64 shrink-0">
          <Sidebar />
        </div>
      ) : null}
      <main className="flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}