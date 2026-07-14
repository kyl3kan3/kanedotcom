import type { Metadata } from "next";
import { Caveat, Fraunces, Nunito_Sans } from "next/font/google";
import "./globals.css";

const caveat = Caveat({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-caveat",
});
const fraunces = Fraunces({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-fraunces",
});
const nunitoSans = Nunito_Sans({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-nunito-sans",
});

const origin = "https://kanedotcom.com";
const socialImage = `${origin}/og.png`;

export const metadata: Metadata = {
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      className={`${caveat.variable} ${fraunces.variable} ${nunitoSans.variable}`}
      lang="en"
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
