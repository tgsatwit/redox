"use client"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Loader2, AlertTriangle } from "lucide-react"
import { useConfigStoreDB } from "@/lib/config-store-db"
import type { DocumentTypeConfig, DataElementConfig, DataElementCategory, DataElementAction } from "@/lib/types"
import { useToast } from "@/components/ui/use-toast"
import { useState } from "react"

// Define a type for the analysis types
type AnalysisType = "TEXTRACT_ANALYZE_DOCUMENT" | "TEXTRACT_ANALYZE_ID" | "TEXTRACT_ANALYZE_EXPENSE";

interface DefaultElementsPanelProps {
  documentType: DocumentTypeConfig;
  subTypeId: string | null;
  isLoading: boolean;
}

export function DefaultElementsPanel({ 
  documentType, 
  subTypeId,
  isLoading 
}: DefaultElementsPanelProps) {
  const {
    addDataElement,
    updateDataElement,
    updateDocumentType,
    updateSubType
  } = useConfigStoreDB()
  
  const [generationStatus, setGenerationStatus] = useState<'idle' | 'generating' | 'success' | 'error'>('idle')
  const [generatedElements, setGeneratedElements] = useState<DataElementConfig[]>([])
  const [processingDefault, setProcessingDefault] = useState(false)
  
  // Safe access to subType
  const subType = subTypeId && documentType.subTypes
    ? (documentType.subTypes || []).find(st => st.id === subTypeId) : null
    
  // Safe access to analysis type with fallback
  const [selectedAnalysisType, setSelectedAnalysisType] = useState<AnalysisType>(
    (subType?.awsAnalysisType as AnalysisType) || "TEXTRACT_ANALYZE_DOCUMENT"
  )
  
  // Type-safe handler for analysis type changes
  const handleAnalysisTypeChange = (value: string) => {
    setSelectedAnalysisType(value as AnalysisType);
  };
  
  const { toast } = useToast()
  
  // Generate default elements based on the analysis type
  const generateDefaultElements = () => {
    setGenerationStatus('generating')
    setGeneratedElements([])
    
    // Simulate API call to generate default elements
    setTimeout(() => {
      try {
        // Generate different elements based on the selected analysis type
        let elements: DataElementConfig[] = []
        
        if (selectedAnalysisType === "TEXTRACT_ANALYZE_DOCUMENT") {
          elements = [
            {
              id: crypto.randomUUID(),
              name: "Document Title",
              type: "Text",
              category: "General" as DataElementCategory,
              action: "Extract" as DataElementAction,
              description: "Title of the document",
              required: true,
              aliases: ["title", "document_title", "doc_title"]
            },
            {
              id: crypto.randomUUID(),
              name: "Document Date",
              type: "Date",
              category: "General" as DataElementCategory,
              action: "Extract" as DataElementAction,
              description: "Date the document was created or issued",
              required: true,
              aliases: ["date", "issue_date", "document_date", "doc_date"]
            },
            {
              id: crypto.randomUUID(),
              name: "Document Type",
              type: "Text",
              category: "General" as DataElementCategory,
              action: "Extract" as DataElementAction,
              description: "Type of document (invoice, contract, etc.)",
              required: false,
              aliases: ["type", "document_type", "doc_type"]
            },
            {
              id: crypto.randomUUID(),
              name: "Page Count",
              type: "Number",
              category: "General" as DataElementCategory,
              action: "Extract" as DataElementAction,
              description: "Number of pages in the document",
              required: false,
              aliases: ["pages", "page_count", "num_pages"]
            }
          ]
        } else if (selectedAnalysisType === "TEXTRACT_ANALYZE_EXPENSE") {
          elements = [
            {
              id: crypto.randomUUID(),
              name: "Vendor Name",
              type: "Text",
              category: "General" as DataElementCategory,
              action: "Extract" as DataElementAction,
              description: "Name of the vendor or merchant",
              required: true,
              aliases: ["vendor", "merchant", "supplier", "payee"]
            },
            {
              id: crypto.randomUUID(),
              name: "Invoice Number",
              type: "Text",
              category: "General" as DataElementCategory,
              action: "Extract" as DataElementAction,
              description: "Invoice or receipt number",
              required: false,
              aliases: ["invoice_number", "invoice_id", "receipt_number", "receipt_id"]
            },
            {
              id: crypto.randomUUID(),
              name: "Total Amount",
              type: "Currency",
              category: "Financial" as DataElementCategory,
              action: "Extract" as DataElementAction,
              description: "Total amount of the expense",
              required: true,
              aliases: ["total", "amount", "total_amount", "grand_total"]
            },
            {
              id: crypto.randomUUID(),
              name: "Date",
              type: "Date",
              category: "General" as DataElementCategory,
              action: "Extract" as DataElementAction,
              description: "Date of the transaction",
              required: true,
              aliases: ["transaction_date", "invoice_date", "expense_date", "receipt_date"]
            },
            {
              id: crypto.randomUUID(),
              name: "Tax Amount",
              type: "Currency",
              category: "Financial" as DataElementCategory,
              action: "Extract" as DataElementAction,
              description: "Tax amount on the expense",
              required: false,
              aliases: ["tax", "vat", "gst", "sales_tax", "tax_amount"]
            }
          ]
        } else if (selectedAnalysisType === "TEXTRACT_ANALYZE_ID") {
          elements = [
            {
              id: crypto.randomUUID(),
              name: "Full Name",
              type: "Text",
              category: "PII" as DataElementCategory,
              action: "Extract" as DataElementAction,
              description: "Full name of the ID holder",
              required: true,
              aliases: ["name", "full_name", "holder_name", "person_name"]
            },
            {
              id: crypto.randomUUID(),
              name: "ID Number",
              type: "Text",
              category: "PII" as DataElementCategory,
              action: "Extract" as DataElementAction,
              description: "Identification number",
              required: true,
              aliases: ["id", "id_number", "identification_number", "card_number"]
            },
            {
              id: crypto.randomUUID(),
              name: "Date of Birth",
              type: "Date",
              category: "PII" as DataElementCategory,
              action: "Extract" as DataElementAction,
              description: "Date of birth of the ID holder",
              required: true,
              aliases: ["dob", "birthdate", "birth_date", "date_of_birth"]
            },
            {
              id: crypto.randomUUID(),
              name: "Expiry Date",
              type: "Date",
              category: "General" as DataElementCategory,
              action: "Extract" as DataElementAction,
              description: "Expiration date of the ID",
              required: false,
              aliases: ["expiration", "expiry", "expiration_date", "valid_until"]
            },
            {
              id: crypto.randomUUID(),
              name: "Address",
              type: "Text",
              category: "PII" as DataElementCategory,
              action: "Extract" as DataElementAction,
              description: "Address of the ID holder",
              required: false,
              aliases: ["home_address", "residence", "residential_address", "street_address"]
            }
          ]
        }
        
        setGeneratedElements(elements)
        setGenerationStatus('success')
      } catch (error) {
        console.error("Error generating default elements:", error)
        setGenerationStatus('error')
      }
    }, 1500) // Simulate API delay
  }
  
  const handleSetDefaultElements = async () => {
    try {
      setProcessingDefault(true)
      
      if (subTypeId) {
        // Apply to sub-type
        const selectedSubType = documentType.subTypes?.find(s => s.id === subTypeId)
        if (selectedSubType) {
          await updateSubType(documentType.id, subTypeId, {
            dataElements: generatedElements
          })
        }
      } else {
        // Apply to document type
        await updateDocumentType(documentType.id, {
          dataElements: generatedElements
        })
      }
      
      setProcessingDefault(false)
      setGenerationStatus('idle')
      setGeneratedElements([])
      
      toast({
        title: "Success",
        description: `Default elements applied to ${subTypeId ? (documentType.subTypes?.find(s => s.id === subTypeId)?.name || "subtype") : documentType.name}`,
      })
    } catch (error) {
      setProcessingDefault(false)
      toast({
        title: "Error",
        description: "Failed to apply default elements",
        variant: "destructive"
      })
    }
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Default Data Elements</CardTitle>
        <CardDescription>
          Generate default data elements based on document analysis type
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col space-y-4">
          <div className="flex space-x-4">
            <Select
              value={selectedAnalysisType}
              onValueChange={handleAnalysisTypeChange}
              disabled={generationStatus === 'generating' || processingDefault || isLoading}
            >
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="Select analysis type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TEXTRACT_ANALYZE_DOCUMENT">General Document</SelectItem>
                <SelectItem value="TEXTRACT_ANALYZE_EXPENSE">Expense Document</SelectItem>
                <SelectItem value="TEXTRACT_ANALYZE_ID">ID Document</SelectItem>
              </SelectContent>
            </Select>
            
            <Button 
              onClick={generateDefaultElements}
              disabled={generationStatus === 'generating' || processingDefault || isLoading}
            >
              {generationStatus === 'generating' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Generating...
                </>
              ) : "Generate Elements"}
            </Button>
          </div>
          
          {generationStatus === 'error' && (
            <div className="flex items-center p-4 bg-destructive/10 text-destructive rounded-md">
              <AlertTriangle className="h-4 w-4 mr-2" />
              An error occurred while generating default elements
            </div>
          )}
          
          {generatedElements.length > 0 && (
            <div className="border rounded-md p-4">
              <h3 className="text-lg font-medium mb-2">Generated Elements ({generatedElements.length})</h3>
              <ul className="space-y-2">
                {generatedElements.map((element) => (
                  <li key={element.id} className="text-sm">
                    <span className="font-medium">{element.name}</span> - <span className="text-muted-foreground">{element.description}</span>
                  </li>
                ))}
              </ul>
              
              <Button 
                className="mt-4"
                onClick={handleSetDefaultElements}
                disabled={processingDefault || isLoading}
              >
                {processingDefault ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Applying...
                  </>
                ) : "Apply as Default Elements"}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
} 