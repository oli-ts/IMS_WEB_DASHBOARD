"use client";
import { useState } from "react";
import { supabaseBrowser } from "../../../lib/supabase-server";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const sb = supabaseBrowser();
  async function onSubmit(e) {
    e.preventDefault();
    const { error } = await sb.auth.signInWithOtp({ email });
    if (error) alert(error.message);
    else alert("Check your email for a magic link.");
  }
  return (
    <div className="h-[80dvh] grid place-items-center">
      <form
        onSubmit={onSubmit}
        className="bg-white dark:bg-neutral-900 border dark:border-neutral-800 p-6 rounded-2xl shadow w-full max-w-sm space-y-4"
      >
        <h1 className="text-xl font-semibold">Sign in</h1>
        <Input
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" className="w-full">
          Email magic link
        </Button>
      </form>
    </div>
  );
}
