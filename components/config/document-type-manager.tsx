"use client"

import { useState, useEffect } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Loader2, Trash2, AlertTriangle } from "lucide-react"
import { useConfigStoreDB } from "@/lib/config-store-db"
import type { DocumentTypeConfig, DataElementConfig, DocumentSubTypeConfig } from "@/lib/types"
import { useToast } from "@/components/ui/use-toast"
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"

interface DocumentTypeManagerProps {
  activeDocumentTypeId: string | null;
  documentTypes: DocumentTypeConfig[];
  onSelectDocType: (id: string) => void;
  isLoading: boolean;
}

export function DocumentTypeManager({ 
  activeDocumentTypeId, 
  documentTypes,
  onSelectDocType,
  isLoading
}: DocumentTypeManagerProps) {
  const {
    addDocumentType,
    deleteDocumentType
  } = useConfigStoreDB()
  
  const [newDocTypeOpen, setNewDocTypeOpen] = useState(false)
  const [newDocType, setNewDocType] = useState({
    name: "",
    description: "",
    isActive: true,
    awsAnalysisType: "TEXTRACT_ANALYZE_DOCUMENT" as 'TEXTRACT_ANALYZE_DOCUMENT' | 'TEXTRACT_ANALYZE_ID' | 'TEXTRACT_ANALYZE_EXPENSE',
    dataElements: [] as DataElementConfig[],
    subTypes: [] as DocumentSubTypeConfig[]
  })
  
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [docTypeToDelete, setDocTypeToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const [useDefaultElements, setUseDefaultElements] = useState(true)
  const [useDefaultSubTypes, setUseDefaultSubTypes] = useState(true)
  const [creationTab, setCreationTab] = useState("basic")
  
  const { toast } = useToast()

  // Generate default elements based on the analysis type
  const generateDefaultElements = () => {
    if (!useDefaultElements) return []
    
    // Generate different elements based on the selected analysis type
    let elements: DataElementConfig[] = []
    
    if (newDocType.awsAnalysisType === "TEXTRACT_ANALYZE_DOCUMENT") {
      elements = [
        {
          id: crypto.randomUUID(),
          name: "Document Title",
          type: "Text",
          category: "General",
          action: "Extract",
          description: "Title of the document",
          required: true,
          aliases: ["title", "document_title", "doc_title"]
        },
        {
          id: crypto.randomUUID(),
          name: "Document Date",
          type: "Date",
          category: "General",
          action: "Extract",
          description: "Date the document was created or issued",
          required: true,
          aliases: ["date", "issue_date", "document_date", "doc_date"]
        },
        {
          id: crypto.randomUUID(),
          name: "Document Type",
          type: "Text",
          category: "General",
          action: "Extract",
          description: "Type of document (invoice, contract, etc.)",
          required: false,
          aliases: ["type", "document_type", "doc_type"]
        },
        {
          id: crypto.randomUUID(),
          name: "Page Count",
          type: "Number",
          category: "General",
          action: "Extract",
          description: "Number of pages in the document",
          required: false,
          aliases: ["pages", "page_count", "num_pages"]
        }
      ]
    } else if (newDocType.awsAnalysisType === "TEXTRACT_ANALYZE_EXPENSE") {
      elements = [
        {
          id: crypto.randomUUID(),
          name: "Vendor Name",
          type: "Text",
          category: "General",
          action: "Extract",
          description: "Name of the vendor or merchant",
          required: true,
          aliases: ["vendor", "merchant", "supplier", "payee"]
        },
        {
          id: crypto.randomUUID(),
          name: "Invoice Number",
          type: "Text",
          category: "General",
          action: "Extract",
          description: "Invoice or receipt number",
          required: false,
          aliases: ["invoice_number", "invoice_id", "receipt_number", "receipt_id"]
        },
        {
          id: crypto.randomUUID(),
          name: "Total Amount",
          type: "Currency",
          category: "Financial",
          action: "Extract",
          description: "Total amount of the expense",
          required: true,
          aliases: ["total", "amount", "total_amount", "grand_total"]
        },
        {
          id: crypto.randomUUID(),
          name: "Date",
          type: "Date",
          category: "General",
          action: "Extract",
          description: "Date of the transaction",
          required: true,
          aliases: ["transaction_date", "invoice_date", "expense_date", "receipt_date"]
        },
        {
          id: crypto.randomUUID(),
          name: "Tax Amount",
          type: "Currency",
          category: "Financial",
          action: "Extract",
          description: "Tax amount on the expense",
          required: false,
          aliases: ["tax", "vat", "gst", "sales_tax", "tax_amount"]
        }
      ]
    } else if (newDocType.awsAnalysisType === "TEXTRACT_ANALYZE_ID") {
      elements = [
        {
          id: crypto.randomUUID(),
          name: "Full Name",
          type: "Text",
          category: "PII",
          action: "Extract",
          description: "Full name of the ID holder",
          required: true,
          aliases: ["name", "full_name", "holder_name", "person_name"]
        },
        {
          id: crypto.randomUUID(),
          name: "ID Number",
          type: "Text",
          category: "PII",
          action: "Extract",
          description: "Identification number",
          required: true,
          aliases: ["id", "id_number", "identification_number", "card_number"]
        },
        {
          id: crypto.randomUUID(),
          name: "Date of Birth",
          type: "Date",
          category: "PII",
          action: "Extract",
          description: "Date of birth of the ID holder",
          required: true,
          aliases: ["dob", "birthdate", "birth_date", "date_of_birth"]
        },
        {
          id: crypto.randomUUID(),
          name: "Expiry Date",
          type: "Date",
          category: "General",
          action: "Extract",
          description: "Expiration date of the ID",
          required: false,
          aliases: ["expiration", "expiry", "expiration_date", "valid_until"]
        },
        {
          id: crypto.randomUUID(),
          name: "Address",
          type: "Text",
          category: "PII",
          action: "Extract",
          description: "Address of the ID holder",
          required: false,
          aliases: ["home_address", "residence", "residential_address", "street_address"]
        }
      ]
    }
    
    return elements
  }

  // Generate default subtypes based on the document type's analysis type
  const generateDefaultSubTypes = () => {
    if (!useDefaultSubTypes) return []
    
    let subTypes: DocumentSubTypeConfig[] = []
    
    if (newDocType.awsAnalysisType === "TEXTRACT_ANALYZE_ID") {
      // Create default ID subtypes
      subTypes = [
        {
          id: crypto.randomUUID(),
          name: "Driver's License",
          description: "Driver's license identification card",
          awsAnalysisType: "TEXTRACT_ANALYZE_ID",
          isActive: true,
          dataElements: [
            {
              id: crypto.randomUUID(),
              name: "License Number",
              type: "Text",
              category: "PII",
              action: "Extract",
              description: "Driver's license number",
              required: true,
              aliases: ["license_number", "license_id", "driver_license_number"]
            },
            {
              id: crypto.randomUUID(),
              name: "State/Province",
              type: "Text",
              category: "General",
              action: "Extract",
              description: "Issuing state or province",
              required: false,
              aliases: ["state", "province", "issuing_state", "issuing_province"]
            },
            {
              id: crypto.randomUUID(),
              name: "Class",
              type: "Text",
              category: "General",
              action: "Extract",
              description: "License class/type",
              required: false,
              aliases: ["license_class", "driver_class", "type_of_license"]
            }
          ]
        },
        {
          id: crypto.randomUUID(),
          name: "Passport",
          description: "International passport document",
          awsAnalysisType: "TEXTRACT_ANALYZE_ID",
          isActive: true,
          dataElements: [
            {
              id: crypto.randomUUID(),
              name: "Passport Number",
              type: "Text",
              category: "PII",
              action: "Extract",
              description: "Passport number",
              required: true,
              aliases: ["passport_number", "passport_id", "travel_document_number"]
            },
            {
              id: crypto.randomUUID(),
              name: "Nationality",
              type: "Text",
              category: "General",
              action: "Extract",
              description: "Nationality of passport holder",
              required: false,
              aliases: ["country", "citizenship", "nationality"]
            },
            {
              id: crypto.randomUUID(),
              name: "Issue Date",
              type: "Date",
              category: "General",
              action: "Extract",
              description: "Date when passport was issued",
              required: false,
              aliases: ["date_of_issue", "issue_date", "issued_on"]
            }
          ]
        }
      ]
    }
    
    return subTypes
  }
  
  // Update default elements when analysis type changes
  useEffect(() => {
    if (useDefaultElements || useDefaultSubTypes) {
      const newElements = useDefaultElements ? generateDefaultElements() : []
      const newSubTypes = useDefaultSubTypes ? generateDefaultSubTypes() : []
      
      setNewDocType({
        ...newDocType,
        dataElements: newElements,
        subTypes: newSubTypes
      })
    }
  }, [newDocType.awsAnalysisType, useDefaultElements, useDefaultSubTypes])
  
  const handleCreateDocType = async () => {
    if (!newDocType.name.trim()) return
    
    try {
      const docTypeId = crypto.randomUUID()
      const dataElements = useDefaultElements ? generateDefaultElements() : []
      const subTypes = useDefaultSubTypes ? generateDefaultSubTypes() : []
      
      // @ts-ignore - The type definition seems incorrect, but this works
      await addDocumentType({
        ...newDocType,
        id: docTypeId,
        dataElements,
        subTypes
      })
      
      setNewDocTypeOpen(false)
      setNewDocType({
        name: "",
        description: "",
        isActive: true,
        awsAnalysisType: "TEXTRACT_ANALYZE_DOCUMENT",
        dataElements: [],
        subTypes: []
      })
      
      // Select the newly created document type
      onSelectDocType(docTypeId)
      
      toast({
        title: "Success",
        description: "Document type created successfully",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create document type",
        variant: "destructive"
      })
    }
  }

  const handleDeleteDocType = async () => {
    if (!docTypeToDelete) return
    
    try {
      setIsDeleting(true)
      await deleteDocumentType(docTypeToDelete)
      
      setDeleteDialogOpen(false)
      setDocTypeToDelete(null)
      
      // If the deleted document type was the active one, select another one
      if (docTypeToDelete === activeDocumentTypeId) {
        const remainingDocTypes = documentTypes.filter(dt => dt.id !== docTypeToDelete)
        if (remainingDocTypes.length > 0) {
          onSelectDocType(remainingDocTypes[0].id)
        }
      }
      
      toast({
        title: "Success",
        description: "Document type deleted successfully",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete document type",
        variant: "destructive"
      })
    } finally {
      setIsDeleting(false)
    }
  }
  
  const openDeleteDialog = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDocTypeToDelete(id)
    setDeleteDialogOpen(true)
  }

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">Document Types</CardTitle>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => setNewDocTypeOpen(true)}
          disabled={isLoading}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-2">
            {documentTypes.map((docType) => (
              <div 
                key={docType.id} 
                className="flex items-center"
              >
                <Button
                  variant={docType.id === activeDocumentTypeId ? "default" : "outline"}
                  className="w-full justify-start"
                  onClick={() => onSelectDocType(docType.id)}
                >
                  <span className="truncate">{docType.name}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-1 h-8 w-8 flex-shrink-0"
                  onClick={(e) => openDeleteDialog(docType.id, e)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {documentTypes.length === 0 && (
              <p className="text-sm text-gray-500">No document types yet. Create one to get started.</p>
            )}
          </div>
        )}
      </CardContent>

      {/* New document type dialog */}
      <Dialog open={newDocTypeOpen} onOpenChange={setNewDocTypeOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Create New Document Type</DialogTitle>
            <DialogDescription>
              Add a new document type to your configuration.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="basic" value={creationTab} onValueChange={setCreationTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="defaults">Default Configuration</TabsTrigger>
            </TabsList>
            
            <TabsContent value="basic">
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="name" className="text-right">
                    Name
                  </Label>
                  <Input
                    id="name"
                    value={newDocType.name}
                    onChange={(e) => setNewDocType({ ...newDocType, name: e.target.value })}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="description" className="text-right">
                    Description
                  </Label>
                  <Textarea
                    id="description"
                    value={newDocType.description}
                    onChange={(e) => setNewDocType({ ...newDocType, description: e.target.value })}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="analysis-type" className="text-right">
                    Analysis Type
                  </Label>
                  <Select
                    value={newDocType.awsAnalysisType}
                    onValueChange={(value) => setNewDocType({ ...newDocType, awsAnalysisType: value as any })}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Select analysis type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TEXTRACT_ANALYZE_DOCUMENT">Document</SelectItem>
                      <SelectItem value="TEXTRACT_ANALYZE_ID">ID Card</SelectItem>
                      <SelectItem value="TEXTRACT_ANALYZE_EXPENSE">Expense</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="is-active" className="text-right">
                    Active
                  </Label>
                  <div className="col-span-3 flex items-center space-x-2">
                    <Switch
                      id="is-active"
                      checked={newDocType.isActive}
                      onCheckedChange={(checked) => setNewDocType({ ...newDocType, isActive: checked })}
                    />
                    <Label htmlFor="is-active">
                      {newDocType.isActive ? "Yes" : "No"}
                    </Label>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end mt-4">
                <Button onClick={() => setCreationTab("defaults")}>
                  Next
                </Button>
              </div>
            </TabsContent>
            
            <TabsContent value="defaults">
              <div className="grid gap-4 py-4">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="use-default-elements" 
                    checked={useDefaultElements}
                    onCheckedChange={(checked) => setUseDefaultElements(!!checked)} 
                  />
                  <Label htmlFor="use-default-elements" className="text-sm font-medium">
                    Add default data elements for {newDocType.awsAnalysisType.replace('TEXTRACT_ANALYZE_', '')} document type
                  </Label>
                </div>
                
                {useDefaultElements && (
                  <div className="pl-6 border-l-2 border-muted ml-1.5 mt-2">
                    <p className="text-sm text-muted-foreground mb-2">
                      Will add {generateDefaultElements().length} default data elements optimized for this document type.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {generateDefaultElements().slice(0, 4).map((element) => (
                        <div key={element.id} className="text-sm border rounded-md p-2">
                          <div className="font-medium">{element.name}</div>
                          <div className="text-xs text-muted-foreground">{element.type}</div>
                        </div>
                      ))}
                      {generateDefaultElements().length > 4 && (
                        <div className="text-sm border rounded-md p-2 flex items-center justify-center">
                          +{generateDefaultElements().length - 4} more
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {newDocType.awsAnalysisType === "TEXTRACT_ANALYZE_ID" && (
                  <>
                    <div className="flex items-center space-x-2 mt-4">
                      <Checkbox 
                        id="use-default-subtypes" 
                        checked={useDefaultSubTypes}
                        onCheckedChange={(checked) => setUseDefaultSubTypes(!!checked)} 
                      />
                      <Label htmlFor="use-default-subtypes" className="text-sm font-medium">
                        Add default subtypes for ID documents (Driver's License, Passport)
                      </Label>
                    </div>
                    
                    {useDefaultSubTypes && (
                      <div className="pl-6 border-l-2 border-muted ml-1.5 mt-2">
                        <p className="text-sm text-muted-foreground mb-2">
                          Will add 2 common ID document subtypes with specialized data elements.
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {generateDefaultSubTypes().map((subType) => (
                            <div key={subType.id} className="text-sm border rounded-md p-2">
                              <div className="font-medium">{subType.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {subType.dataElements.length} data elements
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
              
              <div className="flex justify-between mt-4">
                <Button variant="outline" onClick={() => setCreationTab("basic")}>
                  Back
                </Button>
                <Button onClick={handleCreateDocType}>Create</Button>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className={creationTab === "defaults" ? "hidden" : ""}>
            <Button variant="outline" onClick={() => setNewDocTypeOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateDocType}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Document Type
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this document type, all its subtypes, and all data elements.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteDocType} 
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
} 