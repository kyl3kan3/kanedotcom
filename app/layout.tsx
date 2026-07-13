import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host?.includes("localhost") ? "http" : "https");
  const origin = host ? `${protocol}://${host}` : "http://localhost:3000";
  const socialImage = new URL("/og.png", origin).toString();

  return {
    title: "Our Great Big Family Adventure Book",
    description:
      "A playful family scrapbook for the trips, tiny moments, videos, quotes, and stories we never want to forget.",
    applicationName: "Family Adventure Book",
    icons: { icon: "/favicon.svg" },
    keywords: ["family", "travel", "memories", "photos", "adventure book"],
    robots: {
      index: false,
      follow: false,
      googleBot: { index: false, follow: false },
    },
    metadataBase: new URL(origin),
    openGraph: {
      title: "Our Great Big Family Adventure Book",
      description: "Places we went. Things we tried. Stories we never want to forget.",
      type: "website",
      url: origin,
      images: [
        {
          url: socialImage,
          width: 1734,
          height: 907,
          alt: "Our Great Big Family Adventure Book scrapbook cover",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Our Great Big Family Adventure Book",
      description: "Places we went. Things we tried. Stories we never want to forget.",
      images: [socialImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Fraunces:opsz,wght@9..144,600;9..144,700;9..144,800&family=Nunito+Sans:opsz,wght@6..12,500;6..12,600;6..12,700;6..12,800;6..12,900&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
