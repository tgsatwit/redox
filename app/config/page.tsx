import { DocumentConfigManager } from "@/components/document-config"
import { Button } from "@/components/ui/button"
import { ChevronLeft } from "lucide-react"
import Link from "next/link"

export const metadata = {
  title: "Document Configuration",
  description: "Configure document types for processing",
}

export default function ConfigPage() {
  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Document Configuration</h1>
          <p className="text-muted-foreground">
            Configure what data elements to identify and extract, or identify and redact from each document type.
          </p>
        </div>
        <Link href="/">
          <Button variant="outline" size="sm" className="gap-1">
            <ChevronLeft className="h-4 w-4" />
            Back to Document Processor
          </Button>
        </Link>
      </div>
      <DocumentConfigManager />
    </div>
  )
} 