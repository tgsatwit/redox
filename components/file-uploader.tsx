"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { FileUp, Loader2, CheckCircle, XCircle, RefreshCw } from "lucide-react"

interface FileUploaderProps {
  onFileUpload: (file: File) => void
  isProcessing: boolean
  file: File | null
}

export function FileUploader({ onFileUpload, isProcessing, file }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0]
      handleFile(file)
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0]
      handleFile(file)
    }
  }

  const handleFile = (file: File) => {
    // Check if file is an image or PDF
    if (file.type.startsWith("image/") || file.type === "application/pdf") {
      onFileUpload(file)
    } else {
      alert("Please upload an image or PDF file.")
    }
  }

  const handleButtonClick = () => {
    fileInputRef.current?.click()
  }

  const resetFile = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
    onFileUpload(null as unknown as File)
  }

  // Check if file format is supported by AWS Textract
  const isFormatSupported = (fileType: string): boolean => {
    const supportedFormats = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/tiff'
    ]
    return supportedFormats.includes(fileType)
  }

  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' bytes'
    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    else return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <div>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInput}
        accept="image/*,application/pdf"
        className="hidden"
      />

      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center ${
          isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/20"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {file ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">File Information</h3>
              <Button variant="ghost" size="sm" onClick={resetFile} title="Upload different file">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            <div className="bg-muted/50 p-4 rounded-md">
              <div className="grid grid-cols-2 gap-2 text-sm text-left">
                <div className="font-medium">File name:</div>
                <div className="truncate">{file.name}</div>
                
                <div className="font-medium">File type:</div>
                <div>{file.type || "Unknown type"}</div>
                
                <div className="font-medium">Size:</div>
                <div>{formatFileSize(file.size)}</div>
                
                <div className="font-medium">Format:</div>
                <div className="flex items-center gap-1">
                  {isFormatSupported(file.type) ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-green-700">Supported</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-red-500" />
                      <span className="text-red-700">Not supported</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              {isFormatSupported(file.type) 
                ? "This file format is supported by our document processor."
                : "Please upload a supported format (PDF, JPEG, PNG, or TIFF)."}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="rounded-full bg-primary/10 p-3">
              <FileUp className="h-6 w-6 text-primary" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Upload a document</h3>
              <p className="text-sm text-muted-foreground">Drag and drop or click to upload an image or PDF</p>
            </div>
            <Button onClick={handleButtonClick} disabled={isProcessing} variant="outline">
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                "Select File"
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

