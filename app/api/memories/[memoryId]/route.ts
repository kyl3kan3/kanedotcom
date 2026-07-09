import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { memories } from "@/db/schema";
import { getFamilyContext } from "@/lib/family";
import { getPrivateMemoryUrl } from "@/lib/memory-storage";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ memoryId: string }> },
) {
  const { user, member } = await getFamilyContext();
  if (!user || !member) {
    return NextResponse.json({ error: "Sign in to view this memory." }, { status: 401 });
  }

  const { memoryId } = await params;
  if (!uuidPattern.test(memoryId)) {
    return NextResponse.json({ error: "Memory not found." }, { status: 404 });
  }

  const db = getDb();
  const [memory] = await db
    .select({ storageKey: memories.storageKey })
    .from(memories)
    .where(
      and(
        eq(memories.id, memoryId),
        eq(memories.familyId, member.familyId),
        eq(memories.status, "ready"),
        isNull(memories.deletedAt),
      ),
    )
    .limit(1);

  if (!memory?.storageKey) {
    return NextResponse.json({ error: "Memory not found." }, { status: 404 });
  }

  try {
    const url = await getPrivateMemoryUrl(memory.storageKey);
    const response = NextResponse.redirect(url, 307);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch {
    return NextResponse.json(
      { error: "The private memory store is not available." },
      { status: 503 },
    );
  }
}
