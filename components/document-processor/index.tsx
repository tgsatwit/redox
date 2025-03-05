"use client"

import { useDocumentProcessor } from './hooks/use-document-processor';
import { useDocumentClassification } from './hooks/use-document-classification';
import { useConfigStoreDB } from "@/lib/config-store-db";
import { FileUploader } from "../file-uploader";
import { DocumentViewer } from "../document-viewer";
import { DataExtractor } from "../data-extractor";
import { RedactionControls } from "../redaction-controls";
import { AwsCredentialsHelper } from '../aws-credentials-helper';

// UI Components
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";

// Icons
import { 
  Plus, 
  Pencil, 
  Trash2, 
  AlertTriangle, 
  Save, 
  X, 
  ChevronRight, 
  ChevronDown, 
  Copy, 
  Loader2, 
  FileText, 
  Settings, 
  AlignLeft, 
  Scissors, 
  FileSearch, 
  Wrench, 
  Eraser, 
  RefreshCw, 
  FileUp, 
  CheckIcon 
} from "lucide-react";

export function DocumentProcessor() {
  const {
    state: processingState,
    updateState: updateProcessingState,
    handleFileUpload,
    handleProcessDocument,
    handleRedaction,
    toggleFieldRedaction,
    handleDownload,
    resetWorkflow
  } = useDocumentProcessor();

  const {
    state: classificationState,
    updateState: updateClassificationState,
    handleClassifyDocument,
    handleVerification
  } = useDocumentClassification();

  const { config, activeDocumentTypeId, setActiveDocumentType } = useConfigStoreDB();
  const { toast } = useToast();

  // Get active document type
  const activeDocType = config.documentTypes.find((dt: { id: string }) => dt.id === activeDocumentTypeId);
  
  // Get available document types (only active ones)
  const availableDocTypes = config.documentTypes.filter((dt: { isActive: boolean }) => dt.isActive);

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="space-y-6">
          {/* File Upload Section */}
          {processingState.workflowStep === 'upload' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Upload Document</h3>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={resetWorkflow}>
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              </div>
              
              <FileUploader
                onFileUpload={handleFileUpload}
                error={processingState.uploadError}
                isProcessing={processingState.isProcessing}
                file={processingState.file}
              />
              
              {processingState.file && (
                <div className="flex justify-end">
                  <Button onClick={() => updateProcessingState({ workflowStep: 'classify' })}>
                    Next
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              )}
            </div>
          )}
          
          {/* Document Classification Section */}
          {processingState.workflowStep === 'classify' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Document Classification</h3>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => updateProcessingState({ workflowStep: 'upload' })}>
                    <ChevronDown className="h-4 w-4 mr-2" rotate={270} />
                    Back
                  </Button>
                  <Button variant="ghost" size="sm" onClick={resetWorkflow}>
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={classificationState.useAutoClassification}
                    onCheckedChange={(checked) => updateClassificationState({ useAutoClassification: checked })}
                  />
                  <Label>Use automatic classification</Label>
                </div>
                
                {!classificationState.useAutoClassification && (
                  <div className="space-y-4">
                    <div>
                      <Label>Document Type</Label>
                      <Select
                        value={activeDocumentTypeId || ''}
                        onValueChange={(value) => {
                          setActiveDocumentType(value);
                          updateClassificationState({ 
                            selectedSubTypeId: null,
                            feedbackSubmitted: false 
                          });
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select document type" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableDocTypes.length === 0 ? (
                            <SelectItem value="none" disabled>
                              No document types available
                            </SelectItem>
                          ) : (
                            availableDocTypes.map((docType: { id: string; name: string }) => (
                              <SelectItem key={docType.id} value={docType.id}>
                                {docType.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
                
                <div className="flex justify-end">
                  <Button onClick={() => updateProcessingState({ workflowStep: 'process' })}>
                    Next
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            </div>
          )}
          
          {/* Processing Options Section */}
          {processingState.workflowStep === 'process' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Processing Options</h3>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => updateProcessingState({ workflowStep: 'classify' })}>
                    <ChevronDown className="h-4 w-4 mr-2" rotate={270} />
                    Back
                  </Button>
                  <Button variant="ghost" size="sm" onClick={resetWorkflow}>
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              </div>
              
              <div className="p-4 border rounded-md bg-blue-50 text-blue-700">
                <p className="font-medium">Selected document type: {activeDocType?.name}</p>
                {classificationState.selectedSubTypeId && activeDocType?.subTypes && (
                  <p className="mt-1">
                    Sub-type: {activeDocType.subTypes.find((st: { id: string }) => st.id === classificationState.selectedSubTypeId)?.name}
                  </p>
                )}
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="space-y-0.5">
                    <Label htmlFor="extract-elements">Identify Data Elements</Label>
                    <p className="text-xs text-muted-foreground">Identify and extract data elements</p>
                  </div>
                  <Switch 
                    checked={processingState.processingOptions.identifyDataElements}
                    onCheckedChange={(checked) => 
                      updateProcessingState({
                        processingOptions: {
                          ...processingState.processingOptions,
                          identifyDataElements: checked as boolean
                        }
                      })
                    }
                  />
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={processingState.processingOptions.redactElements}
                    onCheckedChange={(checked) => 
                      updateProcessingState({
                        processingOptions: {
                          ...processingState.processingOptions,
                          redactElements: checked as boolean
                        }
                      })
                    }
                  />
                  <Label>Redact sensitive information</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={processingState.processingOptions.createSummary}
                    onCheckedChange={(checked) => 
                      updateProcessingState({
                        processingOptions: {
                          ...processingState.processingOptions,
                          createSummary: checked as boolean
                        }
                      })
                    }
                  />
                  <Label>Create document summary</Label>
                </div>
              </div>
              
              <div className="flex gap-2 pt-4">
                <Button 
                  onClick={handleProcessDocument}
                  disabled={processingState.isProcessing || (!processingState.processingOptions.identifyDataElements && !processingState.processingOptions.redactElements && !processingState.processingOptions.createSummary)}
                  className="flex-1"
                >
                  {processingState.isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Wrench className="h-4 w-4 mr-2" />
                      Run Selected Processes
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
      
      {/* Document Viewer */}
      {processingState.file && (
        <Card className="p-6">
          <Tabs value={processingState.activeTab} onValueChange={(value) => updateProcessingState({ activeTab: value })}>
            <TabsList>
              <TabsTrigger value="original">Original</TabsTrigger>
              <TabsTrigger value="extracted">Extracted Data</TabsTrigger>
              <TabsTrigger value="redacted">Redacted</TabsTrigger>
              <TabsTrigger value="text">Text</TabsTrigger>
            </TabsList>
            
            <TabsContent value="original">
              <DocumentViewer
                imageUrl={processingState.imageUrl}
                fileType={processingState.file?.type}
                onError={(error: string) => updateProcessingState({ pdfViewerError: error })}
                onPdfLoadError={(error: string | null) => updateProcessingState({ pdfViewerError: error })}
              />
            </TabsContent>
            
            <TabsContent value="extracted">
              <DataExtractor
                data={processingState.documentData}
                elements={processingState.extractedElements}
                selectedElements={processingState.selectedElements}
                onElementSelect={toggleFieldRedaction}
              />
            </TabsContent>
            
            <TabsContent value="redacted">
              {processingState.redactedImageUrl ? (
                <div className="space-y-4">
                  <img
                    src={processingState.redactedImageUrl}
                    alt="Redacted document"
                    className="max-w-full h-auto"
                  />
                  <Button onClick={handleDownload}>
                    <FileUp className="h-4 w-4 mr-2" />
                    Download Redacted Document
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No redacted version available yet. Process the document with redaction enabled.
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="text">
              {processingState.extractedText ? (
                <div className="space-y-4">
                  <Textarea
                    value={processingState.extractedText}
                    readOnly
                    className="min-h-[400px] font-mono"
                  />
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(processingState.extractedText || '');
                        toast({
                          title: "Copied to clipboard",
                          description: "The extracted text has been copied to your clipboard.",
                        });
                      }}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy to Clipboard
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No extracted text available yet. Process the document to extract text.
                </div>
              )}
            </TabsContent>
          </Tabs>
        </Card>
      )}
      
      {/* AWS Credentials Helper */}
      {processingState.showAwsHelper && (
        <AwsCredentialsHelper />
      )}
      
      {/* Error Messages */}
      {processingState.processError && (
        <div className="p-4 bg-red-50 text-red-700 rounded-md">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 mr-2" />
            <span>{processingState.processError}</span>
          </div>
        </div>
      )}
    </div>
  );
} 