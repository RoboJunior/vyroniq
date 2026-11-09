import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VYRONIQ — AI Agent Observability & Evaluation Platform',
  description:
    'VYRONIQ brings comprehensive visibility and evaluation to autonomous AI agents. It continuously monitors agent behavior, evaluates goal alignment, analyzes decision-making, detects behavioral deviations, and provides actionable insights into agent execution, helping ensure agents operate as intended.',
  icons: {
    icon: '/vyroniq-logo.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen flex flex-col selection:bg-blue-500/30 selection:text-blue-200 bg-grid-pattern">
        {children}
      </body>
    </html>
  );
}
