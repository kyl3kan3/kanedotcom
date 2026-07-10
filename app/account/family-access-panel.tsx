"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  addFamilyMember,
  type FamilyInviteState,
} from "./actions";

type ManagedFamilyMember = {
  id: string;
  displayName: string;
  invitedEmail: string;
  role: "owner" | "adult" | "child";
  status: "joined" | "pending";
};

const initialInviteState: FamilyInviteState = {
  status: "idle",
  message: "",
};

function roleLabel(role: ManagedFamilyMember["role"]) {
  if (role === "owner") return "Owner";
  if (role === "child") return "Child";
  return "Adult";
}

export function FamilyAccessPanel({
  members,
}: {
  members: ManagedFamilyMember[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [inviteState, formAction, isPending] = useActionState(
    addFamilyMember,
    initialInviteState,
  );
  const [copiedMemberId, setCopiedMemberId] = useState<string | null>(null);

  useEffect(() => {
    if (inviteState.status !== "success") return;
    formRef.current?.reset();
  }, [inviteState]);

  const copyInvite = async (member: ManagedFamilyMember) => {
    const inviteUrl = `${window.location.origin}/auth/sign-up`;
    const invitation = [
      "You’ve been invited to Our Family Adventure Book.",
      `Create your account with ${member.invitedEmail}:`,
      inviteUrl,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(invitation);
      setCopiedMemberId(member.id);
    } catch {
      setCopiedMemberId(null);
    }
  };

  return (
    <section
      className="family-access-panel"
      aria-labelledby="family-access-title"
      data-testid="family-access-manager"
    >
      <header className="family-access-heading">
        <div>
          <span className="family-access-kicker">private owner controls</span>
          <h2 id="family-access-title">Invite family members</h2>
          <p>
            Add their email here first. They can then create and verify their
            own account, and the family book will recognize them automatically.
          </p>
        </div>
        <span className="family-access-lock" aria-label="Available only to Kyle">
          <span aria-hidden="true">◆</span> Kyle only
        </span>
      </header>

      <form ref={formRef} action={formAction} className="family-invite-form">
        <div className="family-invite-fields">
          <label>
            <span>Name</span>
            <input
              name="displayName"
              type="text"
              required
              maxLength={80}
              autoComplete="name"
              placeholder="Aunt Sarah"
              disabled={isPending}
            />
          </label>
          <label>
            <span>Email</span>
            <input
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              placeholder="family@example.com"
              disabled={isPending}
            />
          </label>
          <label>
            <span>Role</span>
            <select name="role" defaultValue="adult" disabled={isPending}>
              <option value="adult">Adult</option>
              <option value="child">Child</option>
            </select>
          </label>
        </div>
        <button
          type="submit"
          className="family-invite-submit"
          disabled={isPending}
        >
          <span aria-hidden="true">＋</span>
          {isPending ? "Saving access…" : "Add family member"}
        </button>
        <p
          className="family-invite-message"
          data-tone={inviteState.status}
          aria-live="polite"
        >
          {inviteState.message ||
            "Only your verified owner account can use this form."}
        </p>
      </form>

      <div className="family-access-list-heading">
        <h3>Who can open the family book</h3>
        <span>
          {members.length} member{members.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="family-access-list">
        {members.map((member) => (
          <li key={member.id}>
            <span className="family-member-avatar" aria-hidden="true">
              {member.displayName.slice(0, 1).toUpperCase()}
            </span>
            <span className="family-member-copy">
              <b>{member.displayName}</b>
              <small>{member.invitedEmail}</small>
            </span>
            <span className={`family-member-status ${member.status}`}>
              {member.status === "joined" ? "Joined" : "Invite ready"}
            </span>
            <span className="family-member-role">{roleLabel(member.role)}</span>
            {member.status === "pending" && (
              <button
                type="button"
                className="family-invite-copy"
                onClick={() => void copyInvite(member)}
                aria-label={
                  copiedMemberId === member.id
                    ? `Invitation copied for ${member.displayName}`
                    : `Copy sign-up invitation for ${member.displayName}`
                }
              >
                {copiedMemberId === member.id ? "Copied!" : "Share invite"}
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="family-access-note">
        An invite only grants access after that exact email address is verified.
        The owner role cannot be assigned from this screen.
      </p>
    </section>
  );
}
