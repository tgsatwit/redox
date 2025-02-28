import type { Metadata } from 'next'
import './globals.css'
import { Settings } from "lucide-react"
import Link from 'next/link'
import { FileText } from "lucide-react"
import { ThemeProvider } from "@/components/theme-provider"
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { Toaster } from "@/components/ui/toaster"

export const metadata: Metadata = {
  title: 'Document Processor',
  description: 'Process and extract data from documents',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <div className="border-b">
            <div className="flex h-16 items-center px-4 container">
              <Link href="/" className="flex items-center gap-2 font-semibold">
                <FileText className="h-6 w-6" />
                <span>Document Processor</span>
              </Link>
              <nav className="ml-auto flex gap-4 sm:gap-6 items-center">
                <Link
                  href="/"
                  className="text-sm font-medium transition-colors hover:text-primary"
                >
                  Home
                </Link>
                <Link
                  href="/config"
                  className="text-sm font-medium transition-colors hover:text-primary flex items-center gap-1"
                >
                  <Settings className="h-4 w-4" />
                  Configuration
                </Link>
                <ThemeToggle />
              </nav>
            </div>
          </div>
          <main>{children}</main>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
