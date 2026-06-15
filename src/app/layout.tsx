import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Cam Stream Sender',
  description: 'Stream your webcam to remote viewers',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
