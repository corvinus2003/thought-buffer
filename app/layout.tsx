import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Thought Buffer',
  description: 'A space to examine a thought and choose your next step.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
