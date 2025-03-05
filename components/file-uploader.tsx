"use client"

import { useCallback } from "react"
import { useDropzone } from "react-dropzone"
import { FileUploaderProps } from "./document-processor/types/component-props"
import { AlertTriangle, FileUp, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

const DEFAULT_ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/tiff'];

export function FileUploader({ 
  onFileUpload, 
  error, 
  acceptedTypes = DEFAULT_ACCEPTED_TYPES,
  isProcessing = false,
  file = null
}: FileUploaderProps) {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      onFileUpload(acceptedFiles[0])
    }
  }, [onFileUpload])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptedTypes.reduce((acc, type) => ({ ...acc, [type]: [] }), {}),
    maxFiles: 1,
    disabled: isProcessing
  })

  if (file) {
    return (
      <div className="space-y-4">
        <div className="p-4 border rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{file.name}</p>
              <p className="text-sm text-muted-foreground">
                {file.type || 'Unknown type'} • {(file.size / 1024).toFixed(0)} KB
              </p>
            </div>
            {isProcessing ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => onFileUpload(null)}
              >
                Change
              </Button>
            )}
          </div>
        </div>
        {error && (
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <p className="text-sm">{error}</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
          ${isDragActive ? "border-primary bg-primary/10" : "border-muted-foreground/25"}
          ${isProcessing ? "opacity-50 cursor-not-allowed" : "hover:border-primary hover:bg-primary/5"}`}
      >
        <input {...getInputProps()} />
        <FileUp className="mx-auto h-8 w-8 text-muted-foreground mb-4" />
        {isDragActive ? (
          <p>Drop the file here...</p>
        ) : (
          <div className="space-y-2">
            <p>Drag and drop a file here, or click to select a file</p>
            <p className="text-sm text-muted-foreground">
              Supported formats: {acceptedTypes.join(", ")}
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <p className="text-sm">{error}</p>
        </div>
      )}
    </div>
  )
}

