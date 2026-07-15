import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { memories } from "@/db/schema";
import { getFamilyContext } from "@/lib/family";
import {
  memoryRedirectCacheSeconds,
  parseMemoryPreviewWidth,
} from "@/lib/memory-preview";
import {
  getPrivateMemoryAccess,
  getPrivateMemoryPreviewAccess,
  type PrivateMemoryAccess,
} from "@/lib/memory-storage";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ memoryId: string }> },
) {
  const startedAt = Date.now();
  const { user, member } = await getFamilyContext();
  const authMs = Date.now() - startedAt;
  if (!user || !member) {
    return NextResponse.json({ error: "Sign in to view this memory." }, { status: 401 });
  }

  const { memoryId } = await params;
  if (!uuidPattern.test(memoryId)) {
    return NextResponse.json({ error: "Memory not found." }, { status: 404 });
  }

  const db = getDb();
  const queryStartedAt = Date.now();
  const [memory] = await db
    .select({ kind: memories.kind, storageKey: memories.storageKey })
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
  const queryMs = Date.now() - queryStartedAt;

  if (!memory?.storageKey) {
    return NextResponse.json({ error: "Memory not found." }, { status: 404 });
  }

  try {
    const accessStartedAt = Date.now();
    const previewWidth = parseMemoryPreviewWidth(
      new URL(request.url).searchParams.get("width"),
    );
    const isPreview = previewWidth !== null && memory.kind === "image";
    let servedPreview = false;
    let access: PrivateMemoryAccess;
    if (isPreview) {
      try {
        access = await getPrivateMemoryPreviewAccess(
          memory.storageKey,
          previewWidth,
        );
        servedPreview = true;
      } catch {
        access = await getPrivateMemoryAccess(memory.storageKey);
      }
    } else {
      access = await getPrivateMemoryAccess(memory.storageKey);
    }
    const response = NextResponse.redirect(access.url, 307);
    const remainingSeconds = memoryRedirectCacheSeconds(access.expiresAt);
    response.headers.set(
      "Cache-Control",
      remainingSeconds > 0
        ? `private, max-age=${remainingSeconds}`
        : "private, no-store",
    );
    response.headers.set(
      "X-Memory-Variant",
      servedPreview ? "preview" : "original",
    );
    response.headers.set("Vary", "Cookie");
    console.info(
      JSON.stringify({
        level: "info",
        message: "memory redirect ready",
        route: "/api/memories/[memoryId]",
        authMs,
        queryMs,
        accessMs: Date.now() - accessStartedAt,
        totalMs: Date.now() - startedAt,
        servedPreview,
      }),
    );
    return response;
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "memory redirect failed",
        route: "/api/memories/[memoryId]",
        authMs,
        queryMs,
        totalMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return NextResponse.json(
      { error: "The private memory store is not available." },
      { status: 503 },
    );
  }
}
