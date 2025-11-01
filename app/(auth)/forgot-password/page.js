"use client";

import { useState } from "react";
import { supabaseBrowser } from "../../../lib/supabase-browser";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";

export default function ForgotPassword() {
  const sb = supabaseBrowser();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    const redirectTo = `${window.location.origin}/auth/reset-password`;
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
    setLoading(false);
    if (error) return alert(error.message);
    setSent(true);
  }

  return (
    <div className="h-[80dvh] grid place-items-center">
      <form onSubmit={onSubmit} className="bg-white dark:bg-neutral-900 border dark:border-neutral-800 p-6 rounded-2xl shadow w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold">Forgot password</h1>
        {sent ? (
          <p className="text-sm text-neutral-600">
            If an account exists for {email}, you’ll receive a reset link.
          </p>
        ) : (
          <>
            <Input type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending…" : "Send reset link"}
            </Button>
          </>
        )}
      </form>
    </div>
  );
}
