"use client"

import { useState, useCallback } from "react"
import { useDropzone } from "react-dropzone"
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle
} from "@/components/ui/dialog"

import { Loader2, AlertCircle, CheckCircle2, Upload, FileText } from "lucide-react"
import { classifyDocument, submitClassificationFeedback, processDocument } from "@/lib/document-processing"
import { useConfigStoreDB } from "@/lib/config-store-db"
import type { ClassificationResult, DocumentData } from "@/lib/types"

type ClassificationStatus = 
  | "idle" 
  | "uploading" 
  | "classifying" 
  | "classified" 
  | "verification_needed" 
  | "processing"
  | "completed"
  | "error"

export function DocumentClassificationWorkflow({
  onDocumentProcessed
}: {
  onDocumentProcessed?: (data: DocumentData) => void
}) {
  const { config } = useConfigStoreDB()
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<ClassificationStatus>("idle")
  const [progress, setProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [classificationResult, setClassificationResult] = useState<ClassificationResult | null>(null)
  const [documentType, setDocumentType] = useState<string | null>(null)
  const [verificationOpen, setVerificationOpen] = useState(false)
  const [documentData, setDocumentData] = useState<DocumentData | null>(null)
  
  const activeDocTypes = config.documentTypes.filter(dt => dt.isActive)
  
  // Dropzone setup
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0])
      setStatus("idle")
      setProgress(0)
      setErrorMessage(null)
      setClassificationResult(null)
      setDocumentType(null)
      setDocumentData(null)
    }
  }, [])
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/tiff': ['.tif', '.tiff'],
    },
    maxFiles: 1,
  })
  
  // Handle document classification
  const handleClassify = async () => {
    if (!file) return
    
    try {
      setStatus("classifying")
      setProgress(30)
      
      // Call the classify endpoint
      const result = await classifyDocument(file)
      setClassificationResult(result)
      
      // Check confidence threshold
      if (result.confidence >= 0.8) {
        // High confidence - automatically accept
        setDocumentType(result.documentType)
        setProgress(50)
        handleProcessDocument(result.documentType)
      } else {
        // Low confidence - request verification
        setDocumentType(result.documentType)
        setStatus("verification_needed")
        setProgress(50)
        setVerificationOpen(true)
      }
    } catch (error) {
      console.error("Classification error:", error)
      setErrorMessage(`Error classifying document: ${(error as Error).message}`)
      setStatus("error")
    }
  }
  
  // Handle document processing after classification
  const handleProcessDocument = async (docType: string) => {
    if (!file) return
    
    try {
      setStatus("processing")
      setProgress(75)
      
      // Find the document type configuration
      const docTypeConfig = config.documentTypes.find(dt => dt.name === docType)
      
      if (!docTypeConfig) {
        throw new Error(`Document type ${docType} not found in configuration`)
      }
      
      // Process the document
      const data = await processDocument(
        file,
        {
          documentType: docType,
          elementsToExtract: docTypeConfig.dataElements.map(de => ({
            id: de.id,
            name: de.name,
            type: de.type,
            required: de.required
          }))
        },
        false // Don't use classification again since we already did it
      )
      
      // Store the document data
      setDocumentData(data)
      setStatus("completed")
      setProgress(100)
      
      // Call the callback if provided
      if (onDocumentProcessed) {
        onDocumentProcessed(data)
      }
    } catch (error) {
      console.error("Processing error:", error)
      setErrorMessage(`Error processing document: ${(error as Error).message}`)
      setStatus("error")
    }
  }
  
  // Handle human verification
  const handleVerification = async (verified: boolean, correctedType?: string) => {
    if (!file || !classificationResult) return
    
    try {
      // Submit feedback
      await submitClassificationFeedback(
        file.name, // Using filename as document ID
        classificationResult,
        verified ? null : (correctedType || null),
        'manual'
      )
      
      // Process with the verified/corrected document type
      const finalDocType = verified ? classificationResult.documentType : (correctedType || "Unknown")
      setDocumentType(finalDocType)
      handleProcessDocument(finalDocType)
    } catch (error) {
      console.error("Verification error:", error)
      setErrorMessage(`Error submitting verification: ${(error as Error).message}`)
      setStatus("error")
    } finally {
      setVerificationOpen(false)
    }
  }
  
  // Reset the component
  const handleReset = () => {
    setFile(null)
    setStatus("idle")
    setProgress(0)
    setErrorMessage(null)
    setClassificationResult(null)
    setDocumentType(null)
    setDocumentData(null)
  }
  
  // Render progress status
  const renderStatus = () => {
    switch (status) {
      case "classifying":
        return (
          <div className="flex items-center gap-2 text-amber-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Classifying document...</span>
          </div>
        )
      case "verification_needed":
        return (
          <div className="flex items-center gap-2 text-amber-600">
            <AlertCircle className="h-4 w-4" />
            <span>Verification needed</span>
          </div>
        )
      case "processing":
        return (
          <div className="flex items-center gap-2 text-amber-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Processing document...</span>
          </div>
        )
      case "completed":
        return (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            <span>Processing complete</span>
          </div>
        )
      case "error":
        return (
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-4 w-4" />
            <span>Error</span>
          </div>
        )
      default:
        return null
    }
  }
  
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Document Classification</CardTitle>
          <CardDescription>
            Upload a document to automatically classify and process it
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* File dropzone */}
          {!file && (
            <div 
              {...getRootProps()} 
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragActive 
                  ? "border-primary bg-primary/5" 
                  : "border-muted-foreground/25 hover:border-primary/50"
              }`}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <h3 className="font-medium">Drag & drop a document here</h3>
                <p className="text-sm text-muted-foreground">
                  or click to select a file (PDF, JPEG, PNG, TIFF)
                </p>
              </div>
            </div>
          )}
          
          {/* Selected file */}
          {file && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 border rounded-md bg-muted/30">
                <FileText className="h-8 w-8 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB • {file.type}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={handleReset}>
                  Change
                </Button>
              </div>
              
              {/* Progress and status */}
              {status !== "idle" && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    {renderStatus()}
                    {progress > 0 && <span>{progress}%</span>}
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              )}
              
              {/* Classification result */}
              {status === "verification_needed" && documentType && (
                <Alert className="bg-amber-50 text-amber-800 border-amber-200">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Verification Required</AlertTitle>
                  <AlertDescription>
                    The document was classified as <strong>{documentType}</strong> with 
                    {classificationResult && <> confidence {(classificationResult.confidence * 100).toFixed(1)}%</>}.
                    Please verify if this is correct.
                  </AlertDescription>
                </Alert>
              )}
              
              {/* Error message */}
              {errorMessage && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              )}
              
              {/* Completion message */}
              {status === "completed" && documentType && (
                <Alert className="bg-green-50 text-green-800 border-green-200">
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Processing Complete</AlertTitle>
                  <AlertDescription>
                    Document successfully classified as <strong>{documentType}</strong>
                    {classificationResult && <> with confidence {(classificationResult.confidence * 100).toFixed(1)}%</>}.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
        
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={handleReset} disabled={!file || status === "classifying" || status === "processing"}>
            Reset
          </Button>
          
          <Button 
            onClick={handleClassify} 
            disabled={!file || status !== "idle"}
          >
            {status === "idle" ? "Classify Document" : "Processing..."}
          </Button>
        </CardFooter>
      </Card>
      
      {/* Verification dialog */}
      <Dialog open={verificationOpen} onOpenChange={setVerificationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify Document Classification</DialogTitle>
            <DialogDescription>
              Please verify if the automatic classification is correct.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Classification Result:</p>
              <div className="p-3 border rounded-md bg-muted/30">
                <p><strong>Document Type:</strong> {documentType}</p>
                {classificationResult && (
                  <p><strong>Confidence:</strong> {(classificationResult.confidence * 100).toFixed(1)}%</p>
                )}
              </div>
            </div>
            
            <div className="space-y-2">
              <p className="text-sm font-medium">Is this classification correct?</p>
              <div className="flex gap-2">
                <Button onClick={() => handleVerification(true)} className="flex-1">
                  Yes, it's correct
                </Button>
                <Button variant="outline" onClick={() => setVerificationOpen(true)} className="flex-1">
                  No, select correct type
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <p className="text-sm font-medium">Or select the correct document type:</p>
              <Select onValueChange={(value) => handleVerification(false, value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select document type" />
                </SelectTrigger>
                <SelectContent>
                  {activeDocTypes.map((docType) => (
                    <SelectItem key={docType.id} value={docType.name}>
                      {docType.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerificationOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
} 