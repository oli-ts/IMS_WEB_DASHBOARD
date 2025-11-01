"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

// Bulk-fetch live statuses for many item UIDs to avoid N+1 requests in tables
export function useLiveStatuses(uids) {
  const sb = supabaseBrowser();
  const keys = useMemo(() => {
    const arr = Array.isArray(uids) ? uids.filter(Boolean) : [];
    return Array.from(new Set(arr));
  }, [uids]);

  const [liveMap, setLiveMap] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!keys.length) {
      setLiveMap({});
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await sb
          .from("item_live_status")
          .select("item_uid,status,total_on_jobs,assignments")
          .in("item_uid", keys);
        if (!cancelled && !error) {
          const map = Object.fromEntries((data || []).map((r) => [r.item_uid, r]));
          setLiveMap(map);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sb, keys.join("|")]);

  return { liveMap, loading };
}

