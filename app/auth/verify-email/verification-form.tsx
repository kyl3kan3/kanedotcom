"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

export function EmailVerificationForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function verifyEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");

    try {
      const result = await authClient.emailOtp.verifyEmail({
        email: email.trim().toLowerCase(),
        otp: code.trim(),
      });
      if (result.error) throw new Error(result.error.message);

      const session = await authClient.getSession();
      router.replace(session.data?.user ? "/" : "/auth/sign-in?verified=1");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "That code did not work. Request a fresh code and try again.",
      );
    } finally {
      setPending(false);
    }
  }

  async function resendCode() {
    if (!email.trim()) {
      setMessage("Enter the email address from your family invitation first.");
      return;
    }

    setPending(true);
    setMessage("");
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: email.trim().toLowerCase(),
        type: "email-verification",
      });
      if (result.error) throw new Error(result.error.message);
      setMessage("A fresh six-digit code is on its way. It expires in 15 minutes.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The code could not be sent. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="verification-form" onSubmit={verifyEmail}>
      <label>
        Invitation email
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
          disabled={pending}
        />
      </label>
      <label>
        Six-digit code
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          placeholder="000000"
          required
          disabled={pending}
        />
      </label>
      <button className="verification-submit" type="submit" disabled={pending}>
        {pending ? "Checking…" : "Verify and open the book"}
      </button>
      <button className="verification-resend" type="button" onClick={resendCode} disabled={pending}>
        Send a fresh code
      </button>
      <p className="verification-message" aria-live="polite">{message}</p>
    </form>
  );
}
