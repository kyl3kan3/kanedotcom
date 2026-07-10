"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { familyMembers } from "@/db/schema";
import {
  FAMILY_ACCOUNT_MANAGER_EMAIL,
  requireFamilyAccountManager,
} from "@/lib/family";

const familyInviteSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  role: z.enum(["adult", "child"]),
});

export type FamilyInviteState = {
  status: "idle" | "success" | "error";
  message: string;
  invitedEmail?: string;
};

export async function addFamilyMember(
  _previousState: FamilyInviteState,
  formData: FormData,
): Promise<FamilyInviteState> {
  let context: Awaited<ReturnType<typeof requireFamilyAccountManager>>;
  try {
    context = await requireFamilyAccountManager();
  } catch {
    return {
      status: "error",
      message: "Only Kyle’s verified owner account can add family members.",
    };
  }

  const parsed = familyInviteSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Add a name, a valid email address, and a family role.",
    };
  }

  const { displayName, email, role } = parsed.data;
  if (email === FAMILY_ACCOUNT_MANAGER_EMAIL) {
    return {
      status: "error",
      message: "That email already belongs to the family owner.",
    };
  }

  const db = getDb();
  try {
    const [savedMember] = await db
      .insert(familyMembers)
      .values({
        familyId: context.member.familyId,
        authUserId: null,
        invitedEmail: email,
        displayName,
        role,
        isActive: 1,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: familyMembers.invitedEmail,
        set: {
          displayName,
          role,
          isActive: 1,
          updatedAt: new Date(),
        },
        setWhere: and(
          eq(familyMembers.familyId, context.member.familyId),
          ne(familyMembers.role, "owner"),
        ),
      })
      .returning({
        id: familyMembers.id,
        authUserId: familyMembers.authUserId,
      });

    if (!savedMember) {
      return {
        status: "error",
        message: "That email cannot be added to this family.",
      };
    }

    revalidatePath("/account/settings");
    revalidatePath("/");
    return {
      status: "success",
      message: savedMember.authUserId
        ? `${displayName} already has access, and their family details are updated.`
        : `${displayName} is ready to join. Use the Share invite button below.`,
      invitedEmail: email,
    };
  } catch {
    return {
      status: "error",
      message: "The invite could not be saved right now. Please try again.",
    };
  }
}
