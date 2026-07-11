import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { memories } from "@/db/schema";
import { getFamilyContext } from "@/lib/family";
import { getPrivateMemoryUrl } from "@/lib/memory-storage";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Ladder of render widths the client may request via ?w=. Requests are
// clamped to the next size up so the cache stays small and predictable.
const RESIZE_WIDTHS = [160, 320, 480, 640, 960, 1600];

function resolveResizeWidth(rawWidth: string | null, mimeType: string | null) {
  if (!rawWidth) return null;
  if (!mimeType?.startsWith("image/") || mimeType === "image/gif") return null;
  const requested = Number.parseInt(rawWidth, 10);
  if (!Number.isFinite(requested) || requested <= 0) return null;
  return (
    RESIZE_WIDTHS.find((candidate) => candidate >= requested) ??
    RESIZE_WIDTHS.at(-1) ??
    null
  );
}

export async function GET(
  request: Request,
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
    .select({ storageKey: memories.storageKey, mimeType: memories.mimeType })
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

  const resizeWidth = resolveResizeWidth(
    new URL(request.url).searchParams.get("w"),
    memory.mimeType,
  );

  if (resizeWidth) {
    try {
      const url = await getPrivateMemoryUrl(memory.storageKey);
      const upstream = await fetch(url);
      if (!upstream.ok) throw new Error("Upstream fetch failed");
      const original = Buffer.from(await upstream.arrayBuffer());
      const sharp = (await import("sharp")).default;
      const resized = await sharp(original)
        .rotate()
        .resize({ width: resizeWidth, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();
      return new NextResponse(new Uint8Array(resized), {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "private, max-age=86400",
        },
      });
    } catch {
      // Fall through to the full-size redirect below.
    }
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
