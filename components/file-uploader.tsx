"use client"

import { useCallback, useState } from "react"
import { useDropzone } from "react-dropzone"
import { FileUploaderProps } from "./document-processor/types/component-props"
import { AlertTriangle, FileUp, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

const DEFAULT_ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/tiff'];

export function FileUploader({ 
  onFileUpload, 
  error, 
  acceptedTypes = DEFAULT_ACCEPTED_TYPES,
  isProcessing = false,
  file = null,
  onWorkflowSelect,
  availableWorkflows = [
    { id: "invoice", name: "Invoice Processing" },
    { id: "passport", name: "Passport Verification" },
    { id: "license", name: "Driver's License Verification" },
    { id: "agreement", name: "Contract/Agreement Review" }
  ]
}: FileUploaderProps) {
  const [workflowType, setWorkflowType] = useState<'predefined' | 'oneoff'>('predefined');
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>("");
  
  // Handle workflow selection
  const handleWorkflowChange = (workflowId: string) => {
    setSelectedWorkflow(workflowId);
    onWorkflowSelect?.(workflowId, workflowType === 'oneoff');
  };
  
  // Handle workflow type change
  const handleWorkflowTypeChange = (value: string) => {
    const newType = value as 'predefined' | 'oneoff';
    setWorkflowType(newType);
    
    // If switching to one-off, notify parent
    if (newType === 'oneoff') {
      onWorkflowSelect?.('', true);
    } 
    // If switching to predefined and we have a selected workflow, notify parent
    else if (selectedWorkflow) {
      onWorkflowSelect?.(selectedWorkflow, false);
    }
  };
  
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
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">Document Details</h3>
          {isProcessing ? (
            <div className="flex items-center text-blue-600">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing...
            </div>
          ) : null}
        </div>
        
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
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-medium">Upload Document</h3>
        <p className="text-sm text-muted-foreground">
          Upload a document to process and extract data
        </p>
      </div>
      
      <div className="border rounded-lg p-4 space-y-4">
        <div className="space-y-3">
          <Label>Choose processing method:</Label>
          <RadioGroup 
            value={workflowType} 
            onValueChange={handleWorkflowTypeChange}
            className="flex flex-col space-y-2"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="predefined" id="predefined" />
              <Label htmlFor="predefined" className="cursor-pointer">Use predefined workflow</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="oneoff" id="oneoff" />
              <Label htmlFor="oneoff" className="cursor-pointer">One-off processing</Label>
            </div>
          </RadioGroup>
        </div>
        
        {workflowType === 'predefined' && (
          <div className="space-y-2">
            <Label htmlFor="workflow-select">Select workflow:</Label>
            <Select value={selectedWorkflow} onValueChange={handleWorkflowChange}>
              <SelectTrigger id="workflow-select">
                <SelectValue placeholder="Select a workflow" />
              </SelectTrigger>
              <SelectContent>
                {availableWorkflows.map(workflow => (
                  <SelectItem key={workflow.id} value={workflow.id}>
                    {workflow.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      
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

