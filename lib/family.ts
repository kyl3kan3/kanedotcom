import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { familyMembers } from "@/db/schema";
import { getAuth } from "@/lib/auth/server";

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
