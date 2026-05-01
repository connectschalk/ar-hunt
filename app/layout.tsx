import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/app/components/AuthProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://survivor-go.vercel.app"),
  title: {
    default: "Survivor GO",
    template: "%s · Survivor GO",
  },
  description: "Explore. Collect. Compete.",
  icons: {
    icon: [{ url: "/favicon.ico" }],
  },
  openGraph: {
    title: "Survivor GO",
    description: "Explore. Collect. Compete.",
    url: "https://survivor-go.vercel.app",
    siteName: "Survivor GO",
    images: [
      {
        url: "/og-survivor-go.png",
        width: 1024,
        height: 1024,
        alt: "Survivor GO",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Survivor GO",
    description: "Explore. Collect. Compete.",
    images: ["/og-survivor-go.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
      <body className="flex min-h-full flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
