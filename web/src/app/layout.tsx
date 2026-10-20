import type { Metadata } from "next";
import { Inter, Nunito } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"], weight: ["700", "800"] });

export const metadata: Metadata = {
  title: { default: "MindFocus", template: "%s · MindFocus" },
  description: "Rastreio clínico e acompanhamento longitudinal gamificado do neurodesenvolvimento de crianças e adolescentes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${nunito.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
