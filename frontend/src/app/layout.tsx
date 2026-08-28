import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Museum Ticketing & Booking Platform",
  description:
    "Bilingual (Amharic/English) online booking, payment, and gate check-in for the Science Museum — additive to the museum's existing counter process.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
