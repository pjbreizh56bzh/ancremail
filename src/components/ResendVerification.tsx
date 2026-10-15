"use client";

import { useState } from "react";
import { api } from "./api-client";

export function ResendVerification() {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span>
      <button
        className="underline"
        onClick={async () => {
          try {
            await api("/api/auth/resend-verification", "POST");
            setMsg("Email renvoyé.");
          } catch (e) {
            setMsg((e as Error).message);
          }
        }}
      >
        Renvoyer l'email
      </button>
      {msg && <span className="ml-2">{msg}</span>}
    </span>
  );
}
