"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "../../../lib/supabase-browser";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import Link from "next/link";

export default function SignIn(){
  const sb = supabaseBrowser();
  const router = useRouter();
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const redirectTo = sp.get("redirectTo") || "/";

  async function onSubmit(e){
    e.preventDefault();
    setLoading(true);
    const { error } = await sb.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return alert(error.message);
    router.replace(redirectTo);
  }

  return (
    <div className="h-[80dvh] grid place-items-center">
      <form onSubmit={onSubmit} className="bg-white p-6 rounded-2xl shadow w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <Input type="email" placeholder="you@company.com" value={email} onChange={e=>setEmail(e.target.value)} />
        <Input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} />
        <Button type="submit" className="w-full" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</Button>
        <div className="flex items-center justify-between text-sm">
          <Link href="/forgot-password" className="underline">Forgot password?</Link>
          {/* Optional: <Link href="/signup" className="underline">Create account</Link> */}
        </div>
      </form>
    </div>
  );
}
