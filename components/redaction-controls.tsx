"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Download, FileWarning } from "lucide-react"

interface RedactionControlsProps {
  onRedact: () => void
  onDownload: () => void
  canRedact: boolean
  canDownload: boolean
}

export function RedactionControls({ onRedact, onDownload, canRedact, canDownload }: RedactionControlsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Redaction Controls</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Create a redacted version of your document by applying black boxes over the selected fields.
          </p>

          <div className="flex flex-col gap-2">
            <Button onClick={onRedact} disabled={!canRedact} className="w-full">
              <FileWarning className="mr-2 h-4 w-4" />
              Create Redacted Version
            </Button>

            <Button onClick={onDownload} disabled={!canDownload} variant="outline" className="w-full">
              <Download className="mr-2 h-4 w-4" />
              Download Redacted Document
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

