import type { Metadata, Viewport } from "next";
import { Caveat, Fraunces, Nunito_Sans } from "next/font/google";
import { headers } from "next/headers";
import { Providers } from "./providers";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-fraunces",
});

const caveat = Caveat({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-caveat",
});

const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
  variable: "--font-nunito-sans",
});

export const viewport: Viewport = {
  themeColor: "#fff7e8",
  colorScheme: "light",
  viewportFit: "cover",
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host?.includes("localhost") ? "http" : "https");
  const origin = host ? `${protocol}://${host}` : "http://localhost:3000";
  const socialImage = new URL("/og.jpg", origin).toString();

  return {
    title: "Our Great Big Family Adventure Book",
    description:
      "A playful family scrapbook for the trips, tiny moments, videos, quotes, and stories we never want to forget.",
    applicationName: "Family Adventure Book",
    icons: {
      icon: "/favicon.svg",
      apple: "/apple-touch-icon.png",
    },
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
          width: 1200,
          height: 628,
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
    <html
      lang="en"
      className={`${fraunces.variable} ${caveat.variable} ${nunitoSans.variable}`}
      suppressHydrationWarning
    >
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
