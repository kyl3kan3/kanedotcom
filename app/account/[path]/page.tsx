import { AccountView } from "@neondatabase/auth/react/ui";
import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "@/db";
import { familyMembers } from "@/db/schema";
import { getFamilyContext, isFamilyAccountManager } from "@/lib/family";
import { FamilyAccessPanel } from "../family-access-panel";

export const dynamic = "force-dynamic";

export default async function AccountPage({
  params,
}: {
  params: Promise<{ path: string }>;
}) {
  const { path } = await params;
  const context = await getFamilyContext();
  const canManageFamily = Boolean(
    path === "settings" &&
      context.user &&
      context.member &&
      isFamilyAccountManager({
        userId: context.user.id,
        userEmail: context.user.email,
        userEmailVerified: context.user.emailVerified,
        memberAuthUserId: context.member.authUserId,
        memberInvitedEmail: context.member.invitedEmail,
        memberRole: context.member.role,
      }),
  );

  const managedMembers = canManageFamily
    ? await getDb()
        .select({
          id: familyMembers.id,
          displayName: familyMembers.displayName,
          invitedEmail: familyMembers.invitedEmail,
          role: familyMembers.role,
          authUserId: familyMembers.authUserId,
        })
        .from(familyMembers)
        .where(
          and(
            eq(familyMembers.familyId, context.member!.familyId),
            eq(familyMembers.isActive, 1),
          ),
        )
        .orderBy(asc(familyMembers.createdAt))
    : [];

  return (
    <main className="account-shell">
      <Link className="account-back" href="/">← Back to the adventure book</Link>
      <AccountView path={path} />
      {canManageFamily && (
        <FamilyAccessPanel
          members={managedMembers.map((member) => ({
            id: member.id,
            displayName: member.displayName,
            invitedEmail: member.invitedEmail,
            role: member.role,
            status: member.authUserId ? "joined" : "pending",
          }))}
        />
      )}
    </main>
  );
}
