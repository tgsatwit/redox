"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import { ZoomIn, ZoomOut, RotateCw, FileText, Image as ImageIcon, AlignLeft, Loader2, AlertTriangle, RefreshCw, FileSearch, Scissors } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { findPotentialPII, generateHighlightedHTML } from "@/lib/client-redaction"
import { 
  isPdfDataUrl, 
  convertBase64ToFile, 
  createCompatiblePdfBlob, 
  createHtmlPdfViewerBlob, 
  createPdfDownloadLink
} from "@/lib/pdf-utils"
import { ensurePdfJsLoaded } from "@/lib/pdf-preloader" 
import { Card } from "@/components/ui/card"
import { DocumentViewerProps } from "./document-processor/types/component-props"

// We don't need to redeclare the window interface as it's already declared in pdf-preloader.ts
// The TypeScript compiler will merge the declarations automatically

// Define the type for a manual selection
interface ManualSelection {
  id: string;
  label: string;
  boundingBox: {
    Left: number;
    Top: number;
    Width: number;
    Height: number;
  };
}

// Helper function to safely render boundingBox properties
const renderBoundingBoxStyle = (box?: any): React.CSSProperties => {
  if (!box) return {}
  
  // Check whether it's AWS style (with Left, Top) or standard style (with x, y)
  const left = 'Left' in box ? box.Left * 100 : ('x' in box ? box.x * 100 : 0)
  const top = 'Top' in box ? box.Top * 100 : ('y' in box ? box.y * 100 : 0)
  const width = 'Width' in box ? box.Width * 100 : ('width' in box ? box.width * 100 : 0)
  const height = 'Height' in box ? box.Height * 100 : ('height' in box ? box.height * 100 : 0)
  
  return {
    position: 'absolute' as const, // Use 'as const' to narrow the type
    left: `${left}%`,
    top: `${top}%`,
    width: `${width}%`,
    height: `${height}%`
  }
}

export function DocumentViewer({ imageUrl, onError, fileType, onPdfLoadError }: DocumentViewerProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [isPdfLoading, setIsPdfLoading] = useState(false)

  useEffect(() => {
    if (!imageUrl) {
      onError?.("No image URL provided")
      return
    }

    const loadDocument = async () => {
      setIsLoading(true)

      if (fileType === 'application/pdf') {
        setIsPdfLoading(true)
        try {
          await ensurePdfJsLoaded()
        } catch (error) {
          onPdfLoadError?.(error instanceof Error ? error.message : "Failed to load PDF viewer")
        } finally {
          setIsPdfLoading(false)
        }
      }
    }

    loadDocument()
  }, [imageUrl, fileType, onError, onPdfLoadError])

  if (!imageUrl) {
    return (
      <div className="flex items-center justify-center h-64 bg-muted/10 rounded-lg">
        <p className="text-muted-foreground">No document loaded</p>
      </div>
    )
  }

  if (isPdfLoading) {
    return (
      <Card className="p-6 flex flex-col items-center justify-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p>Loading PDF viewer...</p>
      </Card>
    )
  }

  return (
    <div className="relative">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}
      <img
        src={imageUrl}
        alt="Document preview"
        className="max-w-full h-auto rounded-lg"
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false)
          onError?.("Failed to load image")
        }}
      />
    </div>
  )
}

