"use client"

import { useState } from "react"
import { 
  Card,
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card"
import { 
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent 
} from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

import { Plus, Pencil, Trash2, AlertTriangle, Save, X, ChevronRight, ChevronDown, Copy, Loader2 } from "lucide-react"
import { useConfigStoreDB } from "@/lib/config-store-db"
import type { DocumentTypeConfig, DocumentSubTypeConfig, DataElementConfig, DataElementType, DataElementCategory, DataElementAction } from "@/lib/types"
import { TrainingDatasetPanel } from "./training-dataset-panel"
import { ClassificationFeedbackStats } from "./classification-feedback-stats"
import { useToast } from "@/components/ui/use-toast"
import { useConfigContext } from "@/providers/config-provider"

export function DocumentConfigManager() {
  const { 
    config, 
    activeDocumentTypeId, 
    setActiveDocumentType,
    addDocumentType,
    updateDocumentType,
    deleteDocumentType,
    addDataElement,
    updateDataElement,
    deleteDataElement,
    addSubType,
    updateSubType,
    deleteSubType,
    resetToDefaults,
    isLoading: storeIsLoading
  } = useConfigStoreDB()
  
  const { isLoading: contextIsLoading } = useConfigContext()
  const isLoading = storeIsLoading || contextIsLoading

  const [newDocTypeOpen, setNewDocTypeOpen] = useState(false)
  const [newElementOpen, setNewElementOpen] = useState(false)
  const [editElementOpen, setEditElementOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const [documentTypeTabs, setDocumentTypeTabs] = useState<Record<string, string>>({})
  const [newSubTypeOpen, setNewSubTypeOpen] = useState(false)
  const [editSubTypeOpen, setEditSubTypeOpen] = useState(false)
  const [activeSubTypeId, setActiveSubTypeId] = useState<string | null>(null)
  const [expandedSubTypes, setExpandedSubTypes] = useState<Set<string>>(new Set())
  
  const [newDocType, setNewDocType] = useState({
    name: "",
    description: "",
    isActive: true,
    awsAnalysisType: "TEXTRACT_ANALYZE_DOCUMENT" as 'TEXTRACT_ANALYZE_DOCUMENT' | 'TEXTRACT_ANALYZE_ID' | 'TEXTRACT_ANALYZE_EXPENSE',
    dataElements: [] as DataElementConfig[]
  })
  
  const [newSubType, setNewSubType] = useState<Omit<DocumentSubTypeConfig, 'id'>>({
    name: "",
    description: "",
    dataElements: [],
    awsAnalysisType: "TEXTRACT_ANALYZE_DOCUMENT" as const,
    isActive: true
  })
  
  const [currentSubType, setCurrentSubType] = useState<DocumentSubTypeConfig | null>(null)
  
  const [currentDataElement, setCurrentDataElement] = useState<DataElementConfig | null>(null)
  const [newDataElement, setNewDataElement] = useState<Omit<DataElementConfig, 'id'>>({
    name: "",
    type: "Text" as DataElementType,
    category: "General" as DataElementCategory,
    action: "Extract" as DataElementAction,
    description: "",
    required: false
  })
  
  const activeDocumentType = config.documentTypes.find(dt => dt.id === activeDocumentTypeId) || config.documentTypes[0]
  
  const activeTab = activeDocumentTypeId ? (documentTypeTabs[activeDocumentTypeId] || "data-elements") : "data-elements"
  
  const setActiveTab = (tab: string) => {
    if (activeDocumentTypeId) {
      setDocumentTypeTabs(prev => ({
        ...prev,
        [activeDocumentTypeId]: tab
      }))
    }
  }
  
  const { toast } = useToast()
  
  const handleDocTypeSelect = (id: string) => {
    setActiveDocumentType(id)
    setActiveSubTypeId(null)
  }
  
  const handleCreateDocType = async () => {
    if (!newDocType.name.trim()) return
    
    try {
      // For ID documents, ensure we have appropriate default elements
      // that are distinct from sub-type elements
      if (newDocType.name.toLowerCase().includes('id')) {
        // Create generic ID document elements (for when subtypes can't be detected)
        const genericIdElements = [
          {
            id: crypto.randomUUID(),
            name: 'Document Number',
            type: 'Text' as DataElementType,
            category: 'PII' as DataElementCategory,
            action: 'ExtractAndRedact' as DataElementAction,
            required: true,
            isDefault: true,
            description: 'Generic ID document number'
          },
          {
            id: crypto.randomUUID(),
            name: 'Full Name',
            type: 'Name' as DataElementType,
            category: 'PII' as DataElementCategory,
            action: 'ExtractAndRedact' as DataElementAction,
            required: true,
            isDefault: true,
            description: 'Full name on ID document'
          },
          {
            id: crypto.randomUUID(),
            name: 'Date of Birth',
            type: 'Date' as DataElementType,
            category: 'PII' as DataElementCategory,
            action: 'ExtractAndRedact' as DataElementAction,
            required: true,
            isDefault: true,
            description: 'Date of birth on ID document'
          },
          {
            id: crypto.randomUUID(),
            name: 'Expiration Date',
            type: 'Date' as DataElementType,
            category: 'General' as DataElementCategory,
            action: 'Extract' as DataElementAction,
            required: false,
            isDefault: true,
            description: 'Expiration date on ID document'
          }
        ]
        
        // Use these generic elements for ID documents
        newDocType.dataElements = genericIdElements
      }
      
      await addDocumentType({
        name: newDocType.name,
        description: newDocType.description,
        dataElements: newDocType.dataElements || [],
        isActive: newDocType.isActive
      })
      
      // Sync the configuration to ensure config table is updated
      await handleSyncOperation("Document type")
      
      setNewDocType({
        name: "",
        description: "",
        isActive: true,
        awsAnalysisType: "TEXTRACT_ANALYZE_DOCUMENT",
        dataElements: []
      })
      setNewDocTypeOpen(false)
      
      toast({
        title: "Success",
        description: "Document type created successfully"
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create document type",
        variant: "destructive"
      })
    }
  }
  
  const handleCreateSubType = async () => {
    if (!activeDocumentTypeId || !newSubType.name.trim()) return
    
    try {
      await addSubType(activeDocumentTypeId, newSubType)
      
      // Sync the configuration to ensure config table is updated
      await handleSyncOperation("Sub-type")
      
      setNewSubType({
        name: "",
        description: "",
        dataElements: [],
        awsAnalysisType: "TEXTRACT_ANALYZE_DOCUMENT" as const,
        isActive: true
      })
      setNewSubTypeOpen(false)
      
      toast({
        title: "Success",
        description: "Sub-type created successfully"
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create sub-type",
        variant: "destructive"
      })
    }
  }
  
  const toggleSubTypeExpand = (subTypeId: string) => {
    const newExpanded = new Set(expandedSubTypes)
    if (newExpanded.has(subTypeId)) {
      newExpanded.delete(subTypeId)
    } else {
      newExpanded.add(subTypeId)
    }
    setExpandedSubTypes(newExpanded)
  }
  
  const initializeIdDocumentSubTypes = async () => {
    if (!activeDocumentTypeId) return
    
    // Create passport sub-type
    const passportSubType: Omit<DocumentSubTypeConfig, 'id'> = {
      name: 'Passport',
      description: 'International travel document',
      isActive: true,
      awsAnalysisType: 'TEXTRACT_ANALYZE_ID',
      dataElements: [
        {
          id: 'passport-number',
          name: 'Passport Number',
          type: 'Text',
          category: 'PII',
          action: 'ExtractAndRedact',
          required: true,
          isDefault: true
        },
        {
          id: 'first-name-passport',
          name: 'First Name',
          type: 'Name',
          category: 'PII',
          action: 'ExtractAndRedact',
          required: true,
          isDefault: true
        },
        {
          id: 'last-name-passport',
          name: 'Last Name',
          type: 'Name',
          category: 'PII',
          action: 'ExtractAndRedact',
          required: true,
          isDefault: true
        },
        {
          id: 'middle-name-passport',
          name: 'Middle Name',
          type: 'Name',
          category: 'PII',
          action: 'ExtractAndRedact',
          required: false,
          isDefault: true
        },
        {
          id: 'full-name-passport',
          name: 'Full Name',
          type: 'Name',
          category: 'PII',
          action: 'ExtractAndRedact',
          required: true,
          isDefault: true
        },
        {
          id: 'date-of-birth-passport',
          name: 'Date of Birth',
          type: 'Date',
          category: 'PII',
          action: 'ExtractAndRedact',
          required: true,
          isDefault: true
        },
        {
          id: 'nationality-passport',
          name: 'Nationality',
          type: 'Text',
          category: 'PII',
          action: 'Extract',
          required: true,
          isDefault: true
        },
        {
          id: 'place-of-birth-passport',
          name: 'Place of Birth',
          type: 'Text',
          category: 'PII',
          action: 'ExtractAndRedact',
          required: false,
          isDefault: true
        },
        {
          id: 'issue-date-passport',
          name: 'Date of Issue',
          type: 'Date',
          category: 'General',
          action: 'Extract',
          required: false,
          isDefault: true
        },
        {
          id: 'expiry-date-passport',
          name: 'Expiry Date',
          type: 'Date',
          category: 'General',
          action: 'Extract',
          required: true,
          isDefault: true
        },
        {
          id: 'passport-authority',
          name: 'Issuing Authority',
          type: 'Text',
          category: 'General',
          action: 'Extract',
          required: false,
          isDefault: true
        },
        {
          id: 'mrz-code-passport',
          name: 'MRZ Code',
          type: 'Text',
          category: 'PII',
          action: 'ExtractAndRedact',
          required: false,
          isDefault: true
        }
      ]
    }
    
    // Create driver's license sub-type
    const driversLicenseSubType: Omit<DocumentSubTypeConfig, 'id'> = {
      name: 'Driver\'s License',
      description: 'Government-issued driving credential',
      isActive: true,
      awsAnalysisType: 'TEXTRACT_ANALYZE_ID',
      dataElements: [
        {
          id: 'license-number-dl',
          name: 'License Number',
          type: 'Text',
          category: 'PII',
          action: 'ExtractAndRedact',
          required: true,
          isDefault: true
        },
        {
          id: 'first-name-dl',
          name: 'First Name',
          type: 'Name',
          category: 'PII',
          action: 'ExtractAndRedact',
          required: true,
          isDefault: true
        },
        {
          id: 'middle-name-dl',
          name: 'Middle Name',
          type: 'Name',
          category: 'PII',
          action: 'ExtractAndRedact',
          required: false,
          isDefault: true
        },
        {
          id: 'last-name-dl',
          name: 'Last Name',
          type: 'Name',
          category: 'PII',
          action: 'ExtractAndRedact',
          required: true,
          isDefault: true
        },
        {
          id: 'full-name-dl',
          name: 'Full Name',
          type: 'Name',
          category: 'PII',
          action: 'ExtractAndRedact',
          required: true,
          isDefault: true
        },
        {
          id: 'date-of-birth-dl',
          name: 'Date of Birth',
          type: 'Date',
          category: 'PII',
          action: 'ExtractAndRedact',
          required: true,
          isDefault: true
        },
        {
          id: 'address-dl',
          name: 'Address',
          type: 'Address',
          category: 'PII',
          action: 'ExtractAndRedact',
          required: true,
          isDefault: true
        },
        {
          id: 'issue-date-dl',
          name: 'Date of Issue',
          type: 'Date',
          category: 'General',
          action: 'Extract',
          required: false,
          isDefault: true
        },
        {
          id: 'expiry-date-dl',
          name: 'Expiry Date',
          type: 'Date',
          category: 'General',
          action: 'Extract',
          required: true,
          isDefault: true
        },
        {
          id: 'license-class-dl',
          name: 'License Class',
          type: 'Text',
          category: 'General',
          action: 'Extract',
          required: false,
          isDefault: true
        },
        {
          id: 'state-dl',
          name: 'State Name',
          type: 'Text',
          category: 'General',
          action: 'Extract',
          required: false,
          isDefault: true
        },
        {
          id: 'endorsements-dl',
          name: 'Endorsements',
          type: 'Text',
          category: 'General',
          action: 'Extract',
          required: false,
          isDefault: true
        },
        {
          id: 'restrictions-dl',
          name: 'Restrictions',
          type: 'Text',
          category: 'General',
          action: 'Extract',
          required: false,
          isDefault: true
        }
      ]
    }
    
    try {
      // Create sub-types without affecting the parent document type
      await addSubType(activeDocumentTypeId, passportSubType)
      await addSubType(activeDocumentTypeId, driversLicenseSubType)
      
      // Sync the configuration to ensure config table is updated
      await handleSyncOperation("ID document sub-types")

      // Refresh the UI to show the new sub-types
      await resetToDefaults()
      
      toast({
        title: "Success",
        description: "Created Passport and Driver's License sub-types"
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create ID document sub-types",
        variant: "destructive"
      })
    }
  }
  
  const handleCreateDataElement = async () => {
    if (!activeDocumentTypeId || !newDataElement.name.trim()) return
    
    try {
      await addDataElement(activeDocumentTypeId, newDataElement)
      
      setNewDataElement({
        name: "",
        type: "Text",
        category: "General",
        action: "Extract",
        description: "",
        required: false
      })
      setNewElementOpen(false)
      
      toast({
        title: "Success",
        description: "Data element created successfully"
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create data element",
        variant: "destructive"
      })
    }
  }
  
  const handleUpdateDataElement = async () => {
    if (!activeDocumentTypeId || !currentDataElement) return
    
    try {
      await updateDataElement(
        activeDocumentTypeId, 
        currentDataElement.id, 
        currentDataElement
      )
      
      setCurrentDataElement(null)
      setEditElementOpen(false)
      
      toast({
        title: "Success",
        description: "Data element updated successfully"
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update data element",
        variant: "destructive"
      })
    }
  }
  
  const handleDeleteDataElement = async (elementId: string) => {
    if (!activeDocumentTypeId) return
    
    try {
      await deleteDataElement(activeDocumentTypeId, elementId)
      
      toast({
        title: "Success",
        description: "Data element deleted successfully"
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete data element",
        variant: "destructive"
      })
    }
  }
  
  const handleDeleteDocType = async () => {
    if (!activeDocumentTypeId) return
    
    try {
      await deleteDocumentType(activeDocumentTypeId)
      setDeleteConfirmOpen(false)
      
      toast({
        title: "Success",
        description: "Document type deleted successfully"
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete document type",
        variant: "destructive"
      })
    }
  }

  const openEditElement = (element: DataElementConfig) => {
    setCurrentDataElement({...element})
    setEditElementOpen(true)
  }

  const getCategoryColor = (category: DataElementCategory) => {
    const colors = {
      'PII': 'bg-red-100 text-red-800',
      'Financial': 'bg-blue-100 text-blue-800',
      'General': 'bg-gray-100 text-gray-800',
      'Medical': 'bg-green-100 text-green-800',
      'Legal': 'bg-purple-100 text-purple-800'
    }
    return colors[category] || colors['General']
  }

  const getActionDescription = (action: DataElementAction) => {
    switch(action) {
      case 'Extract': return 'Will be identified and extracted from documents'
      case 'Redact': return 'Will be identified and redacted in documents'
      case 'ExtractAndRedact': return 'Will be extracted and can be redacted'
      case 'Ignore': return 'Will be ignored during processing'
      default: return ''
    }
  }

  const handleTrainWithFeedback = async (documentType: string, count: number) => {
    if (!documentType) {
      throw new Error('Document type is required');
    }
    
    try {
      const response = await fetch('/api/train-with-feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentType,
          count
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error ${response.status}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error initiating training:', error);
      throw error;
    }
  };

  const renderSubTypes = () => {
    if (!activeDocumentType || !activeDocumentType.subTypes || activeDocumentType.subTypes.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center p-6 space-y-4 border rounded-md border-dashed">
          <div className="text-center">
            <h3 className="font-medium">No sub-types configured</h3>
            <p className="text-sm text-muted-foreground">Create custom sub-types for this document type</p>
          </div>
          
          {activeDocumentType.name.toLowerCase().includes('id') && (
            <Button variant="secondary" size="sm" onClick={initializeIdDocumentSubTypes}>
              <Copy className="w-4 h-4 mr-2" />
              Create Standard ID Sub-Types
            </Button>
          )}
        </div>
      )
    }

    return (
      <div className="space-y-3">
        {activeDocumentType.subTypes.map(subType => (
          <Card key={subType.id} className={`${expandedSubTypes.has(subType.id) ? 'border-primary' : ''}`}>
            <CardHeader className="p-5 pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center cursor-pointer" onClick={() => toggleSubTypeExpand(subType.id)}>
                  {expandedSubTypes.has(subType.id) ? (
                    <ChevronDown className="w-5 h-5 mr-2 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-5 h-5 mr-2 text-muted-foreground" />
                  )}
                  <div className="flex flex-col justify-center">
                    <CardTitle className="text-base">{subType.name}</CardTitle>
                    {subType.description && <CardDescription>{subType.description}</CardDescription>}
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="flex items-center">
                    <Switch
                      checked={subType.isActive}
                      onCheckedChange={async (checked) => {
                        try {
                          await updateSubType(activeDocumentTypeId!, subType.id, { isActive: checked });
                          // Sync the configuration to ensure config table is updated
                          await handleSyncOperation("Sub-type")
                        } catch (error: any) {
                          toast({
                            title: "Error",
                            description: error.message || "Failed to update sub-type status",
                            variant: "destructive"
                          });
                        }
                      }}
                    />
                  </div>
                  <div className="flex items-center space-x-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                      setCurrentSubType(subType)
                      setEditSubTypeOpen(true)
                    }}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={async () => {
                      try {
                        await deleteSubType(activeDocumentTypeId!, subType.id);
                        // Sync the configuration to ensure config table is updated
                        await handleSyncOperation("Sub-type")
                      } catch (error: any) {
                        toast({
                          title: "Error",
                          description: error.message || "Failed to delete sub-type",
                          variant: "destructive"
                        });
                      }
                    }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardHeader>
            
            {expandedSubTypes.has(subType.id) && (
              <CardContent className="p-4">
                <div className="py-2">
                  <div className="mb-2 text-sm font-medium">Analysis Type:</div>
                  <Badge variant="outline">{subType.awsAnalysisType || 'TEXTRACT_ANALYZE_DOCUMENT'}</Badge>
                </div>
                
                <div className="py-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium">Data Elements:</div>
                    <div className="flex items-center space-x-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {
                          setActiveSubTypeId(subType.id)
                          setNewElementOpen(true)
                        }}
                      >
                        <Plus className="w-3 h-3 mr-1" /> Add
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try {
                            await handleSyncOperation("Sub-type")
                          } catch (error: any) {
                            // Error is already handled by handleSyncOperation
                          }
                        }}
                        disabled={isLoading}
                      >
                        <Save className="w-3 h-3 mr-1" /> Save & Sync
                      </Button>
                    </div>
                  </div>
                  
                  {subType.dataElements && subType.dataElements.length > 0 ? (
                    <Table className="border">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {subType.dataElements.map(element => (
                          <TableRow key={element.id}>
                            <TableCell>{element.name}</TableCell>
                            <TableCell>{element.type}</TableCell>
                            <TableCell>{element.action}</TableCell>
                            <TableCell className="text-right">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => openEditElement(element)}
                                disabled={isLoading}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleDeleteDataElement(element.id)}
                                disabled={isLoading || element.isDefault}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      No data elements configured for this sub-type
                    </div>
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    )
  }

  // Generate default data elements based on analysis type
  const generateDefaultDataElements = (analysisType: string): DataElementConfig[] => {
    switch (analysisType) {
      case 'TEXTRACT_ANALYZE_ID':
        return [
          {
            id: crypto.randomUUID(),
            name: 'First Name',
            type: 'Name',
            category: 'PII',
            action: 'ExtractAndRedact',
            required: true,
            isDefault: true,
            description: 'First name from ID document'
          },
          {
            id: crypto.randomUUID(),
            name: 'Last Name',
            type: 'Name',
            category: 'PII',
            action: 'ExtractAndRedact',
            required: true,
            isDefault: true,
            description: 'Last name from ID document'
          },
          {
            id: crypto.randomUUID(),
            name: 'Middle Name',
            type: 'Name',
            category: 'PII',
            action: 'ExtractAndRedact',
            required: false,
            isDefault: true,
            description: 'Middle name from ID document'
          },
          {
            id: crypto.randomUUID(),
            name: 'Document Number',
            type: 'Text',
            category: 'PII',
            action: 'ExtractAndRedact',
            required: true,
            isDefault: true,
            description: 'ID document number'
          },
          {
            id: crypto.randomUUID(),
            name: 'Expiration Date',
            type: 'Date',
            category: 'General',
            action: 'Extract',
            required: true,
            isDefault: true,
            description: 'Date when the ID document expires'
          },
          {
            id: crypto.randomUUID(),
            name: 'Date of Birth',
            type: 'Date',
            category: 'PII',
            action: 'ExtractAndRedact',
            required: true,
            isDefault: true,
            description: 'Date of birth from ID document'
          },
          {
            id: crypto.randomUUID(),
            name: 'Address',
            type: 'Address',
            category: 'PII',
            action: 'ExtractAndRedact',
            required: false,
            isDefault: true,
            description: 'Address from ID document'
          },
          {
            id: crypto.randomUUID(),
            name: 'State Name',
            type: 'Text',
            category: 'General',
            action: 'Extract',
            required: false,
            isDefault: true,
            description: 'State that issued the ID document'
          },
          {
            id: crypto.randomUUID(),
            name: 'Date of Issue',
            type: 'Date',
            category: 'General',
            action: 'Extract',
            required: false,
            isDefault: true,
            description: 'Date when the ID document was issued'
          }
        ];
      case 'TEXTRACT_ANALYZE_EXPENSE':
        return [
          {
            id: crypto.randomUUID(),
            name: 'Vendor Name',
            type: 'Text',
            category: 'General',
            action: 'Extract',
            required: true,
            isDefault: true,
            description: 'Name of the vendor or merchant'
          },
          {
            id: crypto.randomUUID(),
            name: 'Total Amount',
            type: 'Currency',
            category: 'Financial',
            action: 'Extract',
            required: true,
            isDefault: true,
            description: 'Total amount of the invoice or receipt'
          },
          {
            id: crypto.randomUUID(),
            name: 'Invoice Date',
            type: 'Date',
            category: 'General',
            action: 'Extract',
            required: true,
            isDefault: true,
            description: 'Date of the invoice or receipt'
          },
          {
            id: crypto.randomUUID(),
            name: 'Invoice Number',
            type: 'Text',
            category: 'General',
            action: 'Extract',
            required: false,
            isDefault: true,
            description: 'Invoice or receipt number'
          },
          {
            id: crypto.randomUUID(),
            name: 'Tax Amount',
            type: 'Currency',
            category: 'Financial',
            action: 'Extract',
            required: false,
            isDefault: true,
            description: 'Tax amount on the invoice or receipt'
          },
          {
            id: crypto.randomUUID(),
            name: 'Subtotal',
            type: 'Currency',
            category: 'Financial',
            action: 'Extract',
            required: false,
            isDefault: true,
            description: 'Subtotal amount before tax'
          },
          {
            id: crypto.randomUUID(),
            name: 'Payment Method',
            type: 'Text',
            category: 'Financial',
            action: 'Extract',
            required: false,
            isDefault: true,
            description: 'Method of payment used'
          }
        ];
      case 'TEXTRACT_ANALYZE_DOCUMENT':
      default:
        return [
          {
            id: crypto.randomUUID(),
            name: 'Document Title',
            type: 'Text',
            category: 'General',
            action: 'Extract',
            required: false,
            isDefault: true,
            description: 'Title of the document'
          },
          {
            id: crypto.randomUUID(),
            name: 'Document Date',
            type: 'Date',
            category: 'General',
            action: 'Extract',
            required: false,
            isDefault: true,
            description: 'Date on the document'
          },
          {
            id: crypto.randomUUID(),
            name: 'Signature',
            type: 'Text',
            category: 'PII',
            action: 'ExtractAndRedact',
            required: false,
            isDefault: true,
            description: 'Signature on the document'
          }
        ];
    }
  };

  // Populate default data elements for new document type
  const populateDefaultDataElementsForDocType = (analysisType: string) => {
    const defaultElements = generateDefaultDataElements(analysisType);
    setNewDocType(prev => ({
      ...prev,
      dataElements: defaultElements
    }));
    
    toast({
      title: "Defaults Added",
      description: `Added ${defaultElements.length} default data elements for ${analysisType}`
    });
  };

  // Populate default data elements for new sub-type
  const populateDefaultDataElementsForSubType = (analysisType: string) => {
    const defaultElements = generateDefaultDataElements(analysisType);
    setNewSubType(prev => ({
      ...prev,
      dataElements: defaultElements
    }));
    
    toast({
      title: "Defaults Added",
      description: `Added ${defaultElements.length} default data elements for ${analysisType}`
    });
  };

  // Populate default data elements for existing sub-type
  const populateDefaultDataElementsForExisting = (analysisType: string) => {
    if (!currentSubType) return;
    
    const defaultElements = generateDefaultDataElements(analysisType);
    
    // Merge with existing elements, avoiding duplicates by name
    const existingNames = new Set(currentSubType.dataElements.map(el => el.name));
    const newElements = defaultElements.filter(el => !existingNames.has(el.name));
    
    const updatedElements = [...currentSubType.dataElements, ...newElements];
    
    setCurrentSubType({
      ...currentSubType,
      dataElements: updatedElements
    });
    
    toast({
      title: "Defaults Added",
      description: `Added ${newElements.length} default data elements for ${analysisType}`
    });
  };

  // Update the syncConfiguration function to handle index errors (ValidationException) as well as permission errors
  const syncConfiguration = async (): Promise<{ success: boolean; reason: 'full' | 'permission_issues' | 'index_issues' | 'error' }> => {
    try {
      const response = await fetch('/api/config/reset', {
        method: 'POST',
      });
      
      // Parse the response even if it's not a 200, as we now return structured errors
      const result = await response.json().catch(() => ({}));
      
      if (!response.ok) {
        // For 403 Forbidden (permission issues), we treat it as a partial success
        if (response.status === 403 && result.warning) {
          console.warn("Permission issues detected during sync:", result.warning);
          return { success: false, reason: 'permission_issues' }; // Indicates partial success with permission issues
        }
        
        // For 400 Bad Request with warning about indexes, we treat it as a partial success
        if (response.status === 400 && result.warning && result.warning.includes('index')) {
          console.warn("Index issues detected during sync:", result.warning);
          return { success: false, reason: 'index_issues' }; // Indicates partial success with index issues
        }
        
        throw new Error(result.error || `HTTP error ${response.status}`);
      }
      
      // Check if there were permission issues reported in the response
      if (result.partialSuccess && result.warning) {
        if (result.warning.includes('index')) {
          console.warn("Partial sync success with index issues:", result.warning);
          return { success: true, reason: 'index_issues' }; // Indicates partial success with index issues
        } else {
          console.warn("Partial sync success with permission issues:", result.warning);
          return { success: true, reason: 'permission_issues' }; // Indicates partial success with permission issues
        }
      }
      
      return { success: true, reason: 'full' };
    } catch (error) {
      console.error('Error syncing configuration:', error);
      return { success: false, reason: 'error' };
    }
  }

  const handleSyncOperation = async (operationType: string) => {
    try {
      const result = await syncConfiguration();
      
      // Always reload the configuration from the server after any sync operation
      // This ensures the UI reflects the current state regardless of success/failure
      try {
        await resetToDefaults();
      } catch (refreshError) {
        console.warn("Failed to refresh configuration after sync:", refreshError);
      }
      
      if (result.success && result.reason === 'full') {
        toast({
          title: "Success",
          description: `${operationType} configuration synced successfully`
        });
      } else if (result.success) {
        // Partial success scenarios
        if (result.reason === 'index_issues') {
          toast({
            title: "Partial Success",
            description: `${operationType} configuration partially synced. Some operations failed due to missing DynamoDB indexes.`,
            variant: "destructive"
          });
        } else {
          toast({
            title: "Partial Success",
            description: `${operationType} saved to local storage. Some DynamoDB operations failed due to permissions.`,
            variant: "destructive"
          });
        }
      } else {
        // Handle different failure reasons
        switch (result.reason) {
          case 'permission_issues':
            toast({
              title: "Local Save Only",
              description: `${operationType} saved to local storage. DynamoDB sync failed due to permission restrictions.`,
              variant: "destructive"
            });
            break;
          case 'index_issues':
            toast({
              title: "Local Save Only",
              description: `${operationType} saved to local storage. DynamoDB sync failed due to missing indexes.`,
              variant: "destructive"
            });
            break;
          default:
            toast({
              title: "Error",
              description: `Failed to sync ${operationType.toLowerCase()} configuration`,
              variant: "destructive"
            });
        }
      }
    } catch (error: any) {
      // Always attempt to refresh the data, even if the sync failed
      try {
        await resetToDefaults();
      } catch (refreshError) {
        console.warn("Failed to refresh configuration after sync error:", refreshError);
      }
      
      // Capture specific access denied errors
      const isAccessDenied = error.message && (
        error.message.includes("AccessDeniedException") || 
        error.message.includes("not authorized to perform")
      );
      
      // Capture index errors
      const isIndexError = error.message && (
        error.message.includes("ValidationException") &&
        error.message.includes("specified index") &&
        error.message.includes("does not have")
      );
      
      if (isAccessDenied) {
        toast({
          title: "Local Save Only",
          description: `${operationType} saved to local storage. DynamoDB sync failed due to permission restrictions.`,
          variant: "destructive"
        });
        
        // Log the specific permission issue for troubleshooting
        console.warn("DynamoDB permission issue:", error.message);
      } else if (isIndexError) {
        toast({
          title: "Local Save Only",
          description: `${operationType} saved to local storage. DynamoDB sync failed due to missing indexes.`,
          variant: "destructive"
        });
        
        // Log the specific index issue for troubleshooting
        console.warn("DynamoDB index issue:", error.message);
      } else {
        toast({
          title: "Error",
          description: error.message || `Failed to sync ${operationType.toLowerCase()} configuration`,
          variant: "destructive"
        });
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Hidden button for parent component to trigger */}
      <Button 
        id="new-doc-type-button"
        className="hidden"
        onClick={() => setNewDocTypeOpen(true)}
      />
      
      {/* Loading State */}
      {isLoading && (
        <div className="flex justify-center items-center py-4">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span>Processing...</span>
        </div>
      )}

      {/* Document Type Selection */}
      <div className="flex space-x-4">
        <div className="w-1/4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Document Types</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 pt-0">
              {config.documentTypes.map(docType => (
                <Button
                  key={docType.id}
                  variant={docType.id === activeDocumentTypeId ? "default" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => handleDocTypeSelect(docType.id)}
                  disabled={isLoading}
                >
                  <span className="truncate">{docType.name}</span>
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="w-3/4">
          {activeDocumentType && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="text-xl">{activeDocumentType.name}</CardTitle>
                  <CardDescription>{activeDocumentType.description}</CardDescription>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="flex items-center space-x-1">
                    <Label htmlFor="activeToggle" className="text-sm">Active</Label>
                    <Switch 
                      id="activeToggle" 
                      checked={activeDocumentType.isActive} 
                      onCheckedChange={(checked) => updateDocumentType(activeDocumentTypeId!, { isActive: checked })}
                      disabled={isLoading}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        await handleSyncOperation("Document type")
                      } catch (error: any) {
                        // Error is already handled by handleSyncOperation
                      }
                    }}
                    disabled={isLoading}
                  >
                    <Save className="h-4 w-4 mr-1" /> Save & Sync
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setDeleteConfirmOpen(true)}
                    disabled={isLoading}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="mb-4">
                    <TabsTrigger value="data-elements">Data Elements</TabsTrigger>
                    <TabsTrigger value="sub-types">Sub-Types</TabsTrigger>
                    <TabsTrigger value="training">Training</TabsTrigger>
                    <TabsTrigger value="feedback">Feedback</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="data-elements" className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-lg font-medium">Data Elements</h3>
                      <div className="flex items-center space-x-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => {
                            setActiveSubTypeId(null)
                            setNewElementOpen(true)
                          }}
                          disabled={isLoading}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Add Element
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              await handleSyncOperation("Data elements")
                            } catch (error: any) {
                              // Error is already handled by handleSyncOperation
                            }
                          }}
                          disabled={isLoading}
                        >
                          <Save className="mr-2 h-4 w-4" />
                          Save & Sync
                        </Button>
                      </div>
                    </div>
                    
                    <div className="border rounded-md">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Action</TableHead>
                            <TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {activeDocumentType.dataElements.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={5} className="h-24 text-center">
                                No data elements defined
                              </TableCell>
                            </TableRow>
                          )}
                          {activeDocumentType.dataElements.map(element => (
                            <TableRow key={element.id}>
                              <TableCell className="font-medium">{element.name}</TableCell>
                              <TableCell>{element.type}</TableCell>
                              <TableCell>
                                <Badge className={getCategoryColor(element.category)}>
                                  {element.category}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">
                                  {element.action}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => openEditElement(element)}
                                  disabled={isLoading}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => handleDeleteDataElement(element.id)}
                                  disabled={isLoading || element.isDefault}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="sub-types" className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-lg font-medium">Document Sub-Types</h3>
                      <div className="flex items-center space-x-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => setNewSubTypeOpen(true)}
                          disabled={isLoading}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Add Sub-Type
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              await handleSyncOperation("Sub-types")
                            } catch (error: any) {
                              // Error is already handled by handleSyncOperation
                            }
                          }}
                          disabled={isLoading}
                        >
                          <Save className="mr-2 h-4 w-4" />
                          Save & Sync
                        </Button>
                      </div>
                    </div>
                    {renderSubTypes()}
                  </TabsContent>
                  
                  <TabsContent value="training" className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-lg font-medium">Training Datasets</h3>
                    </div>
                    <TrainingDatasetPanel />
                  </TabsContent>
                  
                  <TabsContent value="feedback" className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-lg font-medium">Classification Feedback</h3>
                    </div>
                    <ClassificationFeedbackStats 
                      documentType={activeDocumentTypeId!}
                      onTrainClick={async (documentType: string, count: number) => {
                        try {
                          await handleTrainWithFeedback(documentType, count);
                          toast({
                            title: "Training Initiated",
                            description: `Started training with ${count} feedback examples.`
                          });
                        } catch (error: any) {
                          toast({
                            title: "Training Error",
                            description: error.message || "An error occurred while initiating training",
                            variant: "destructive"
                          });
                        }
                      }}
                    />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      
      {/* New Document Type Dialog */}
      <Dialog open={newDocTypeOpen} onOpenChange={setNewDocTypeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Document Type</DialogTitle>
            <DialogDescription>
              Add a new document type to the system
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="docTypeName">Name</Label>
              <Input 
                id="docTypeName" 
                value={newDocType.name} 
                onChange={e => setNewDocType({...newDocType, name: e.target.value})}
                placeholder="Invoice, Receipt, ID Document, etc."
                disabled={isLoading}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="docTypeDesc">Description</Label>
              <Textarea 
                id="docTypeDesc" 
                value={newDocType.description} 
                onChange={e => setNewDocType({...newDocType, description: e.target.value})}
                placeholder="Document description..."
                disabled={isLoading}
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between items-end">
                <Label htmlFor="docTypeAnalysisType">Default AWS Analysis Type</Label>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => populateDefaultDataElementsForDocType(newDocType.awsAnalysisType)}
                  disabled={isLoading}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add Default Elements
                </Button>
              </div>
              <Select 
                value={newDocType.awsAnalysisType} 
                onValueChange={value => setNewDocType({
                  ...newDocType, 
                  awsAnalysisType: value as 'TEXTRACT_ANALYZE_DOCUMENT' | 'TEXTRACT_ANALYZE_ID' | 'TEXTRACT_ANALYZE_EXPENSE'
                })}
                disabled={isLoading}
              >
                <SelectTrigger id="docTypeAnalysisType">
                  <SelectValue placeholder="Select analysis type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TEXTRACT_ANALYZE_DOCUMENT">General Documents</SelectItem>
                  <SelectItem value="TEXTRACT_ANALYZE_ID">Identification Documents</SelectItem>
                  <SelectItem value="TEXTRACT_ANALYZE_EXPENSE">Invoices and Receipts</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {newDocType.awsAnalysisType === 'TEXTRACT_ANALYZE_DOCUMENT' && 
                  "For general documents like contracts, letters, and forms"}
                {newDocType.awsAnalysisType === 'TEXTRACT_ANALYZE_ID' && 
                  "For identification documents like passports, driver's licenses, and ID cards"}
                {newDocType.awsAnalysisType === 'TEXTRACT_ANALYZE_EXPENSE' && 
                  "For financial documents like invoices, receipts, and expense reports"}
              </p>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch 
                id="docTypeActive" 
                checked={newDocType.isActive} 
                onCheckedChange={checked => setNewDocType({...newDocType, isActive: checked})}
                disabled={isLoading}
              />
              <Label htmlFor="docTypeActive">Active</Label>
            </div>
            
            {newDocType.dataElements.length > 0 && (
              <div className="space-y-2 pt-2">
                <div className="flex justify-between items-center">
                  <Label>Default Data Elements</Label>
                  <Badge variant="outline">{newDocType.dataElements.length} elements</Badge>
                </div>
                <div className="border rounded-md p-2 max-h-40 overflow-y-auto">
                  <ul className="space-y-1">
                    {newDocType.dataElements.map((element, index) => (
                      <li key={index} className="text-sm flex justify-between">
                        <span>{element.name}</span>
                        <Badge variant="secondary" className="text-xs">{element.type}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setNewDocTypeOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreateDocType}
              disabled={!newDocType.name.trim() || isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Document Type'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* New Data Element Dialog */}
      <Dialog open={newElementOpen} onOpenChange={setNewElementOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Data Element</DialogTitle>
            <DialogDescription>
              {activeSubTypeId 
                ? `Add a data element to the selected sub-type` 
                : `Add a data element to ${activeDocumentType?.name}`}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="elementName">Name</Label>
              <Input 
                id="elementName" 
                value={newDataElement.name} 
                onChange={e => setNewDataElement({...newDataElement, name: e.target.value})}
                placeholder="Invoice Number, Amount, Customer Name, etc."
                disabled={isLoading}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="elementType">Type</Label>
                <Select 
                  value={newDataElement.type} 
                  onValueChange={value => setNewDataElement({...newDataElement, type: value as DataElementType})}
                  disabled={isLoading}
                >
                  <SelectTrigger id="elementType">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Text">Text</SelectItem>
                    <SelectItem value="Number">Number</SelectItem>
                    <SelectItem value="Date">Date</SelectItem>
                    <SelectItem value="Currency">Currency</SelectItem>
                    <SelectItem value="Name">Name</SelectItem>
                    <SelectItem value="Email">Email</SelectItem>
                    <SelectItem value="Phone">Phone</SelectItem>
                    <SelectItem value="Address">Address</SelectItem>
                    <SelectItem value="CreditCard">Credit Card</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="elementCategory">Category</Label>
                <Select 
                  value={newDataElement.category} 
                  onValueChange={value => setNewDataElement({...newDataElement, category: value as DataElementCategory})}
                  disabled={isLoading}
                >
                  <SelectTrigger id="elementCategory">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="General">General</SelectItem>
                    <SelectItem value="PII">PII</SelectItem>
                    <SelectItem value="Financial">Financial</SelectItem>
                    <SelectItem value="Medical">Medical</SelectItem>
                    <SelectItem value="Legal">Legal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="elementAction">Action</Label>
              <Select 
                value={newDataElement.action} 
                onValueChange={value => setNewDataElement({...newDataElement, action: value as DataElementAction})}
                disabled={isLoading}
              >
                <SelectTrigger id="elementAction">
                  <SelectValue placeholder="Select action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Extract">Extract</SelectItem>
                  <SelectItem value="Redact">Redact</SelectItem>
                  <SelectItem value="ExtractAndRedact">Extract & Redact</SelectItem>
                  <SelectItem value="Ignore">Ignore</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">{getActionDescription(newDataElement.action)}</p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="elementDescription">Description (Optional)</Label>
              <Textarea 
                id="elementDescription" 
                value={newDataElement.description} 
                onChange={e => setNewDataElement({...newDataElement, description: e.target.value})}
                placeholder="Description of this data element..."
                disabled={isLoading}
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch 
                id="elementRequired" 
                checked={newDataElement.required || false} 
                onCheckedChange={checked => setNewDataElement({...newDataElement, required: checked})}
                disabled={isLoading}
              />
              <Label htmlFor="elementRequired">Required Field</Label>
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setNewElementOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreateDataElement}
              disabled={!newDataElement.name.trim() || isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Add Data Element'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Edit Data Element Dialog */}
      <Dialog open={editElementOpen} onOpenChange={setEditElementOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Data Element</DialogTitle>
          </DialogHeader>
          
          {currentDataElement && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="editElementName">Name</Label>
                <Input 
                  id="editElementName" 
                  value={currentDataElement.name} 
                  onChange={e => setCurrentDataElement({...currentDataElement, name: e.target.value})}
                  disabled={isLoading || currentDataElement.isDefault}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="editElementType">Type</Label>
                  <Select 
                    value={currentDataElement.type} 
                    onValueChange={value => setCurrentDataElement({...currentDataElement, type: value as DataElementType})}
                    disabled={isLoading || currentDataElement.isDefault}
                  >
                    <SelectTrigger id="editElementType">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Text">Text</SelectItem>
                      <SelectItem value="Number">Number</SelectItem>
                      <SelectItem value="Date">Date</SelectItem>
                      <SelectItem value="Currency">Currency</SelectItem>
                      <SelectItem value="Name">Name</SelectItem>
                      <SelectItem value="Email">Email</SelectItem>
                      <SelectItem value="Phone">Phone</SelectItem>
                      <SelectItem value="Address">Address</SelectItem>
                      <SelectItem value="CreditCard">Credit Card</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="editElementCategory">Category</Label>
                  <Select 
                    value={currentDataElement.category} 
                    onValueChange={value => setCurrentDataElement({...currentDataElement, category: value as DataElementCategory})}
                    disabled={isLoading || currentDataElement.isDefault}
                  >
                    <SelectTrigger id="editElementCategory">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="General">General</SelectItem>
                      <SelectItem value="PII">PII</SelectItem>
                      <SelectItem value="Financial">Financial</SelectItem>
                      <SelectItem value="Medical">Medical</SelectItem>
                      <SelectItem value="Legal">Legal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="editElementAction">Action</Label>
                <Select 
                  value={currentDataElement.action} 
                  onValueChange={value => setCurrentDataElement({...currentDataElement, action: value as DataElementAction})}
                  disabled={isLoading}
                >
                  <SelectTrigger id="editElementAction">
                    <SelectValue placeholder="Select action" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Extract">Extract</SelectItem>
                    <SelectItem value="Redact">Redact</SelectItem>
                    <SelectItem value="ExtractAndRedact">Extract & Redact</SelectItem>
                    <SelectItem value="Ignore">Ignore</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">{getActionDescription(currentDataElement.action)}</p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="editElementDescription">Description (Optional)</Label>
                <Textarea 
                  id="editElementDescription" 
                  value={currentDataElement.description || ''} 
                  onChange={e => setCurrentDataElement({...currentDataElement, description: e.target.value})}
                  disabled={isLoading}
                />
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch 
                  id="editElementRequired" 
                  checked={currentDataElement.required || false} 
                  onCheckedChange={checked => setCurrentDataElement({...currentDataElement, required: checked})}
                  disabled={isLoading}
                />
                <Label htmlFor="editElementRequired">Required Field</Label>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setEditElementOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateDataElement}
              disabled={!currentDataElement?.name.trim() || isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Data Element'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Sub-Type Dialog */}
      <Dialog open={newSubTypeOpen} onOpenChange={setNewSubTypeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Sub-Type</DialogTitle>
            <DialogDescription>
              Add a new sub-type for {activeDocumentType?.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="subTypeName">Name</Label>
              <Input 
                id="subTypeName" 
                value={newSubType.name} 
                onChange={e => setNewSubType({...newSubType, name: e.target.value})}
                placeholder="Passport, Driver's License, W2, etc."
                disabled={isLoading}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="subTypeDesc">Description</Label>
              <Textarea 
                id="subTypeDesc" 
                value={newSubType.description || ""} 
                onChange={e => setNewSubType({...newSubType, description: e.target.value})}
                placeholder="Sub-type description..."
                disabled={isLoading}
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between items-end">
                <Label htmlFor="analysisType">AWS Analysis Type</Label>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => populateDefaultDataElementsForSubType(newSubType.awsAnalysisType || "TEXTRACT_ANALYZE_DOCUMENT")}
                  disabled={isLoading}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add Default Elements
                </Button>
              </div>
              <Select 
                value={newSubType.awsAnalysisType} 
                onValueChange={value => setNewSubType({
                  ...newSubType, 
                  awsAnalysisType: value as 'TEXTRACT_ANALYZE_DOCUMENT' | 'TEXTRACT_ANALYZE_ID' | 'TEXTRACT_ANALYZE_EXPENSE'
                })}
                disabled={isLoading}
              >
                <SelectTrigger id="analysisType">
                  <SelectValue placeholder="Select analysis type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TEXTRACT_ANALYZE_DOCUMENT">General Documents</SelectItem>
                  <SelectItem value="TEXTRACT_ANALYZE_ID">Identification Documents</SelectItem>
                  <SelectItem value="TEXTRACT_ANALYZE_EXPENSE">Invoices and Receipts</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {newSubType.awsAnalysisType === 'TEXTRACT_ANALYZE_DOCUMENT' && 
                  "For general documents like contracts, letters, and forms"}
                {newSubType.awsAnalysisType === 'TEXTRACT_ANALYZE_ID' && 
                  "For identification documents like passports, driver's licenses, and ID cards"}
                {newSubType.awsAnalysisType === 'TEXTRACT_ANALYZE_EXPENSE' && 
                  "For financial documents like invoices, receipts, and expense reports"}
              </p>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch 
                id="subTypeActive" 
                checked={newSubType.isActive} 
                onCheckedChange={checked => setNewSubType({...newSubType, isActive: checked})}
                disabled={isLoading}
              />
              <Label htmlFor="subTypeActive">Active</Label>
            </div>

            {newSubType.dataElements.length > 0 && (
              <div className="space-y-2 pt-2">
                <div className="flex justify-between items-center">
                  <Label>Default Data Elements</Label>
                  <Badge variant="outline">{newSubType.dataElements.length} elements</Badge>
                </div>
                <div className="border rounded-md p-2 max-h-40 overflow-y-auto">
                  <ul className="space-y-1">
                    {newSubType.dataElements.map((element, index) => (
                      <li key={index} className="text-sm flex justify-between">
                        <span>{element.name}</span>
                        <Badge variant="secondary" className="text-xs">{element.type}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setNewSubTypeOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreateSubType}
              disabled={!newSubType.name.trim() || isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Sub-Type'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Sub-Type Dialog */}
      <Dialog open={editSubTypeOpen} onOpenChange={setEditSubTypeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Sub-Type</DialogTitle>
            <DialogDescription>
              Update sub-type configuration
            </DialogDescription>
          </DialogHeader>
          
          {currentSubType && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="editSubTypeName">Name</Label>
                <Input 
                  id="editSubTypeName" 
                  value={currentSubType.name} 
                  onChange={e => setCurrentSubType({...currentSubType, name: e.target.value})}
                  disabled={isLoading}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="editSubTypeDesc">Description</Label>
                <Textarea 
                  id="editSubTypeDesc" 
                  value={currentSubType.description || ""} 
                  onChange={e => setCurrentSubType({...currentSubType, description: e.target.value})}
                  disabled={isLoading}
                />
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <Label htmlFor="editAnalysisType">AWS Analysis Type</Label>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => populateDefaultDataElementsForExisting(currentSubType.awsAnalysisType || "TEXTRACT_ANALYZE_DOCUMENT")}
                    disabled={isLoading}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Default Elements
                  </Button>
                </div>
                <Select 
                  value={currentSubType.awsAnalysisType || "TEXTRACT_ANALYZE_DOCUMENT"} 
                  onValueChange={value => setCurrentSubType({
                    ...currentSubType, 
                    awsAnalysisType: value as 'TEXTRACT_ANALYZE_DOCUMENT' | 'TEXTRACT_ANALYZE_ID' | 'TEXTRACT_ANALYZE_EXPENSE'
                  })}
                  disabled={isLoading}
                >
                  <SelectTrigger id="editAnalysisType">
                    <SelectValue placeholder="Select analysis type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TEXTRACT_ANALYZE_DOCUMENT">General Documents</SelectItem>
                    <SelectItem value="TEXTRACT_ANALYZE_ID">Identification Documents</SelectItem>
                    <SelectItem value="TEXTRACT_ANALYZE_EXPENSE">Invoices and Receipts</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  {(currentSubType.awsAnalysisType || "TEXTRACT_ANALYZE_DOCUMENT") === 'TEXTRACT_ANALYZE_DOCUMENT' && 
                    "For general documents like contracts, letters, and forms"}
                  {(currentSubType.awsAnalysisType || "TEXTRACT_ANALYZE_DOCUMENT") === 'TEXTRACT_ANALYZE_ID' && 
                    "For identification documents like passports, driver's licenses, and ID cards"}
                  {(currentSubType.awsAnalysisType || "TEXTRACT_ANALYZE_DOCUMENT") === 'TEXTRACT_ANALYZE_EXPENSE' && 
                    "For financial documents like invoices, receipts, and expense reports"}
                </p>
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch 
                  id="editSubTypeActive" 
                  checked={currentSubType.isActive} 
                  onCheckedChange={checked => setCurrentSubType({...currentSubType, isActive: checked})}
                  disabled={isLoading}
                />
                <Label htmlFor="editSubTypeActive">Active</Label>
              </div>

              {currentSubType.dataElements.length > 0 && (
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between items-center">
                    <Label>Current Data Elements</Label>
                    <Badge variant="outline">{currentSubType.dataElements.length} elements</Badge>
                  </div>
                  <div className="border rounded-md p-2 max-h-40 overflow-y-auto">
                    <ul className="space-y-1">
                      {currentSubType.dataElements.map((element, index) => (
                        <li key={index} className="text-sm flex justify-between">
                          <span>{element.name}</span>
                          <Badge variant="secondary" className="text-xs">{element.type}</Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setEditSubTypeOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button 
              onClick={async () => {
                if (!activeDocumentTypeId || !currentSubType) return;
                
                try {
                  await updateSubType(activeDocumentTypeId, currentSubType.id, currentSubType);
                  // Sync the configuration to ensure config table is updated
                  await handleSyncOperation("Sub-type")
                } catch (error: any) {
                  toast({
                    title: "Error",
                    description: error.message || "Failed to update sub-type",
                    variant: "destructive"
                  });
                }
              }}
              disabled={!currentSubType?.name.trim() || isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Sub-Type'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Document Type Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Document Type</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this document type? This action cannot be undone.
              All associated sub-types and data elements will also be deleted.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <p className="font-medium">{activeDocumentType?.name}</p>
            {activeDocumentType?.description && (
              <p className="text-sm text-muted-foreground">{activeDocumentType.description}</p>
            )}
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={handleDeleteDocType}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Document Type'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
} 