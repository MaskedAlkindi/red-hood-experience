import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Cormorant_Garamond, Inter } from "next/font/google";
import { CinematicTransitionProvider } from "@/components/fx/CinematicLink";
import "./globals.css";

const bebas = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-bebas", display: "swap" });
const cormorant = Cormorant_Garamond({
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-cormorant",
  display: "swap",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Death in the Family — Interactive Experience",
  description: "Interactive player for the Death in the Family DVD.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#050506",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bebas.variable} ${cormorant.variable} ${inter.variable}`}>
      <body className="bg-ink text-zinc-100 antialiased">
        <CinematicTransitionProvider>{children}</CinematicTransitionProvider>
      </body>
    </html>
  );
}
