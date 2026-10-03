import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import { buildThemeBootstrapScript } from '@/lib/chrome-theme'

export const metadata: Metadata = {
  title: 'SarkiAI Policy Sandbox',
  description:
    'Policy-grounded multi-agent engine: error-scenario simulation and ITU AI Readiness assessment.',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0f766e' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1220' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/* Pre-paint theme bootstrap: no flash of the wrong theme pack. */}
        <script dangerouslySetInnerHTML={{ __html: buildThemeBootstrapScript() }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
