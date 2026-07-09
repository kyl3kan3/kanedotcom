import Link from "next/link";
import { EmailVerificationForm } from "./verification-form";

export default function VerifyEmailPage() {
  return (
    <main className="auth-shell">
      <Link className="auth-brand" href="/">
        <span aria-hidden="true">✦</span>
        Our Family Adventure Book
      </Link>
      <section className="auth-card verify-card">
        <div className="auth-intro">
          <span>CHECK YOUR INBOX</span>
          <h1>Prove it is really you.</h1>
          <p>
            Neon sent a six-digit code to the email used at sign-up. This keeps
            a stranger from claiming a family invitation just by knowing the
            address.
          </p>
        </div>
        <EmailVerificationForm />
      </section>
    </main>
  );
}
