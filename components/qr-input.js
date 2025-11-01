"use client";
import { useEffect, useRef } from "react";

export default function QrInput({ onScan, placeholder="Scan QR or paste payload…" }) {
  const ref = useRef(null);
  useEffect(()=>{ ref.current?.focus(); },[]);
  return (
    <input
      ref={ref}
      className="w-full h-10 px-3 rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-black"
      placeholder={placeholder}
      onKeyDown={(e)=>{
        if (e.key === 'Enter') {
          const v = e.currentTarget.value?.trim();
          if (v) {
            // Expected format: CPG1|<UID>|... ; fallback: raw UID
            const uid = v.startsWith('CPG1|') ? v.split('|')[1] : v;
            onScan?.(uid);
            e.currentTarget.value = '';
          }
        }
      }}
    />
  );
}
