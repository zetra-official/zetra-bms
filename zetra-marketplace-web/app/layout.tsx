import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = "https://marketplace.zetra.co.tz";
const siteName = "ZETRA Marketplace";
const defaultTitle = "ZETRA Marketplace | Discover stores and live business posts";
const defaultDescription =
  "ZETRA Global Marketplace ni sehemu ya kugundua stores, live business posts, na biashara zinazoonekana kwa ubora wa kimataifa.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: defaultTitle,
    template: "%s | ZETRA Marketplace",
  },
  description: defaultDescription,
  applicationName: siteName,
  keywords: [
    "ZETRA",
    "ZETRA Marketplace",
    "Tanzania marketplace",
    "business marketplace",
    "stores",
    "business posts",
    "Africa marketplace",
    "online marketplace Tanzania",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName,
    title: defaultTitle,
    description: defaultDescription,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: defaultDescription,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  category: "business",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}