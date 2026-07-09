import { AccountView } from "@neondatabase/auth/react/ui";
import Link from "next/link";

export default async function AccountPage({
  params,
}: {
  params: Promise<{ path: string }>;
}) {
  const { path } = await params;

  return (
    <main className="account-shell">
      <Link className="account-back" href="/">← Back to the adventure book</Link>
      <AccountView path={path} />
    </main>
  );
}
