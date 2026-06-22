import type { Metadata } from "next";
import type { Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const siteUrl = "https://caltrack.abhishekmurthy.com";
const siteTitle = "Caltrack | Barcode Calorie & Macro Tracker";
const siteDescription =
  "Scan barcodes, estimate no-barcode meals with AI, and keep a clean private calorie and macro ledger.";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "Caltrack",
  title: {
    default: siteTitle,
    template: "%s | Caltrack",
  },
  description: siteDescription,
  keywords: [
    "calorie tracker",
    "macro tracker",
    "barcode calorie scanner",
    "nutrition ledger",
    "food journal",
    "AI nutrition estimate",
  ],
  authors: [{ name: "Abhishek Murthy" }],
  creator: "Abhishek Murthy",
  publisher: "Caltrack",
  manifest: "/manifest.webmanifest",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: ["/icon.svg"],
  },
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: siteUrl,
    siteName: "Caltrack",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Caltrack barcode-first calorie and macro tracker",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: "#e4f1e6",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
