import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { familyMembers } from "@/db/schema";
import { getAuth } from "@/lib/auth/server";

export const FAMILY_ACCOUNT_MANAGER_EMAIL = "kyl3kan3@gmail.com";

export function isFamilyAccountManager(identity: {
  userId: string | null | undefined;
  userEmail: string | null | undefined;
  userEmailVerified: boolean | null | undefined;
  memberAuthUserId: string | null | undefined;
  memberInvitedEmail: string | null | undefined;
  memberRole: string | null | undefined;
}) {
  return (
    identity.userEmailVerified === true &&
    identity.memberRole === "owner" &&
    identity.memberAuthUserId === identity.userId &&
    identity.userEmail?.trim().toLowerCase() ===
      FAMILY_ACCOUNT_MANAGER_EMAIL &&
    identity.memberInvitedEmail?.trim().toLowerCase() ===
      FAMILY_ACCOUNT_MANAGER_EMAIL
  );
}

export async function getFamilyContext() {
  const { data } = await getAuth().getSession();
  const user = data?.user;

  if (!user?.id || !user.email) {
    return { user: null, member: null, verificationRequired: false };
  }

  const normalizedEmail = user.email.trim().toLowerCase();
  const db = getDb();
  const [boundMember] = await db
    .select()
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.isActive, 1),
        eq(familyMembers.authUserId, user.id),
      ),
    )
    .limit(1);

  if (boundMember) {
    return { user, member: boundMember, verificationRequired: false };
  }

  if (!user.emailVerified) {
    const [pendingInvite] = await db
      .select({ id: familyMembers.id })
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.isActive, 1),
          isNull(familyMembers.authUserId),
          eq(familyMembers.invitedEmail, normalizedEmail),
        ),
      )
      .limit(1);

    return {
      user,
      member: null,
      verificationRequired: Boolean(pendingInvite),
    };
  }

  const [claimedMember] = await db
    .update(familyMembers)
    .set({ authUserId: user.id, updatedAt: new Date() })
    .where(
      and(
        eq(familyMembers.isActive, 1),
        isNull(familyMembers.authUserId),
        eq(familyMembers.invitedEmail, normalizedEmail),
      ),
    )
    .returning();

  return {
    user,
    member: claimedMember ?? null,
    verificationRequired: false,
  };
}

export async function requireFamilyContext() {
  const context = await getFamilyContext();
  if (!context.user || !context.member) {
    throw new Error("You are not authorized to access this family.");
  }
  return context as {
    user: NonNullable<typeof context.user>;
    member: NonNullable<typeof context.member>;
  };
}

export async function requireFamilyAdmin() {
  const context = await requireFamilyContext();
  if (context.member.role !== "owner") {
    throw new Error("Only the family admin can do that.");
  }
  return context;
}

export async function requireFamilyAccountManager() {
  const context = await requireFamilyAdmin();
  if (
    !isFamilyAccountManager({
      userId: context.user.id,
      userEmail: context.user.email,
      userEmailVerified: context.user.emailVerified,
      memberAuthUserId: context.member.authUserId,
      memberInvitedEmail: context.member.invitedEmail,
      memberRole: context.member.role,
    })
  ) {
    throw new Error("Only the private family account manager can do that.");
  }
  return context;
}
