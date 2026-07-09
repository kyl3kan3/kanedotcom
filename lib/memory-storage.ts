import {
  del,
  issueSignedToken,
  presignUrl,
  put,
} from "@vercel/blob";

type MemoryKind = "image" | "video";

function safePathSegment(value: string, fallback: string) {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);

  return cleaned || fallback;
}

function googleItemPathSegment(itemId: string) {
  return Buffer.from(itemId).toString("base64url").slice(0, 220);
}

export function getGoogleMemoryPathname(
  familyId: string,
  itemId: string,
  filename: string,
) {
  const safeFilename = safePathSegment(filename, "google-memory");
  return `families/${familyId}/google-photos/${googleItemPathSegment(itemId)}/${safeFilename}`;
}

export function isAllowedGoogleMediaUrl(url: URL) {
  return (
    url.protocol === "https:" &&
    (url.hostname === "lh3.googleusercontent.com" ||
      url.hostname.endsWith(".googleusercontent.com"))
  );
}

export async function copyGoogleMediaToPrivateBlob({
  accessToken,
  baseUrl,
  kind,
  mimeType,
  pathname,
}: {
  accessToken: string;
  baseUrl: string;
  kind: MemoryKind;
  mimeType: string;
  pathname: string;
}) {
  const googleUrl = new URL(baseUrl);
  if (!isAllowedGoogleMediaUrl(googleUrl)) {
    throw new Error("Google returned an unsupported media URL.");
  }

  const downloadUrl = `${googleUrl.toString()}${kind === "video" ? "=dv" : "=d"}`;
  const upstream = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!upstream.ok || !upstream.body) {
    throw new Error(`Google media download failed with status ${upstream.status}.`);
  }

  const contentLength = Number(upstream.headers.get("content-length"));
  const useMultipart =
    kind === "video" ||
    (Number.isFinite(contentLength) && contentLength > 100 * 1024 * 1024);

  return put(pathname, upstream.body, {
    access: "private",
    allowOverwrite: true,
    cacheControlMaxAge: 30 * 24 * 60 * 60,
    contentType: mimeType,
    multipart: useMultipart,
  });
}

export async function deletePrivateMemoryBlob(pathname: string) {
  await del(pathname);
}

export async function getPrivateMemoryUrl(pathname: string) {
  const validUntil = Date.now() + 5 * 60 * 1000;
  const signedToken = await issueSignedToken({
    pathname,
    operations: ["get"],
    validUntil,
  });
  const { presignedUrl } = await presignUrl(signedToken, {
    access: "private",
    operation: "get",
    pathname,
    validUntil,
  });

  return presignedUrl;
}
