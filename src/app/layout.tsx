import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MediaShelf — Search. Discover. Save.',
  description:
    'Search the Apple iTunes catalogue across media types and storefronts, then save discoveries to your local shelf.',
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
