"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "../../../lib/supabase-browser";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";

function ResetPasswordInner() {
  const sb = supabaseBrowser();
  const router = useRouter();
  const sp = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [canReset, setCanReset] = useState(false);

  // When user lands from email, Supabase creates a temp session.
  // Verify we have one before allowing reset.
  useEffect(() => {
    (async () => {
      const { data: { session } } = await sb.auth.getSession();
      setCanReset(!!session);
    })();
  }, [sb, sp]);

  async function onSubmit(e) {
    e.preventDefault();
    if (password.length < 8) return alert("Password must be at least 8 characters.");
    if (password !== confirm) return alert("Passwords do not match.");
    setLoading(true);
    const { error } = await sb.auth.updateUser({ password });
    setLoading(false);
    if (error) return alert(error.message);
    alert("Password updated. Please sign in.");
    router.replace("/signin");
  }

  return (
    <div className="h-[80dvh] grid place-items-center">
      <form onSubmit={onSubmit} className="bg-white dark:bg-neutral-900 border dark:border-neutral-800 p-6 rounded-2xl shadow w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold">Reset password</h1>
        {!canReset ? (
          <p className="text-sm text-neutral-600">The reset link is invalid or expired. Request a new one from the Forgot password page.</p>
        ) : (
          <>
            <Input type="password" placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Input type="password" placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <Button type="submit" className="w-full" disabled={loading}>{loading ? "Updating…" : "Update password"}</Button>
          </>
        )}
      </form>
    </div>
  );
}

export default function ResetPassword() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}

