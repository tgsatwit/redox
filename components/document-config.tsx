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

import { Plus, Pencil, Trash2, AlertTriangle, Save, X } from "lucide-react"
import { useConfigStore } from "@/lib/config-store"
import type { DocumentTypeConfig, DataElementConfig, DataElementType, DataElementCategory, DataElementAction } from "@/lib/types"
import { TrainingDatasetPanel } from "./training-dataset-panel"
import { ClassificationFeedbackStats } from "./classification-feedback-stats"
import { useToast } from "@/components/ui/use-toast"

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
    resetToDefaults
  } = useConfigStore()

  const [newDocTypeOpen, setNewDocTypeOpen] = useState(false)
  const [newElementOpen, setNewElementOpen] = useState(false)
  const [editElementOpen, setEditElementOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("data-elements")
  
  const [newDocType, setNewDocType] = useState({
    name: "",
    description: "",
    isActive: true
  })
  
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
  
  const { toast } = useToast()
  
  // Handle document type selection
  const handleDocTypeSelect = (id: string) => {
    setActiveDocumentType(id)
  }
  
  // Handle creation of new document type
  const handleCreateDocType = () => {
    if (!newDocType.name.trim()) return
    
    addDocumentType({
      name: newDocType.name,
      description: newDocType.description,
      dataElements: [],
      isActive: newDocType.isActive
    })
    
    // Reset and close
    setNewDocType({
      name: "",
      description: "",
      isActive: true
    })
    setNewDocTypeOpen(false)
  }
  
  // Handle creation of new data element
  const handleCreateDataElement = () => {
    if (!activeDocumentTypeId || !newDataElement.name.trim()) return
    
    addDataElement(activeDocumentTypeId, newDataElement)
    
    // Reset and close
    setNewDataElement({
      name: "",
      type: "Text",
      category: "General",
      action: "Extract",
      description: "",
      required: false
    })
    setNewElementOpen(false)
  }
  
  // Handle update of data element
  const handleUpdateDataElement = () => {
    if (!activeDocumentTypeId || !currentDataElement) return
    
    updateDataElement(
      activeDocumentTypeId, 
      currentDataElement.id, 
      currentDataElement
    )
    
    // Reset and close
    setCurrentDataElement(null)
    setEditElementOpen(false)
  }
  
  // Handle deletion of data element
  const handleDeleteDataElement = (elementId: string) => {
    if (!activeDocumentTypeId) return
    deleteDataElement(activeDocumentTypeId, elementId)
  }
  
  // Handle document type deletion
  const handleDeleteDocType = () => {
    if (!activeDocumentTypeId) return
    deleteDocumentType(activeDocumentTypeId)
    setDeleteConfirmOpen(false)
  }

  // Open element edit dialog
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

  // Add a function to handle training with feedback
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle>Document Types Configuration</CardTitle>
            <CardDescription>
              Configure document types and data elements to extract or redact
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Dialog open={newDocTypeOpen} onOpenChange={setNewDocTypeOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  <Plus className="h-4 w-4" />
                  New Type
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Document Type</DialogTitle>
                  <DialogDescription>
                    Add a new document type to configure extraction and redaction rules.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Name</Label>
                    <Input 
                      id="name" 
                      value={newDocType.name}
                      onChange={(e) => setNewDocType({...newDocType, name: e.target.value})}
                      placeholder="e.g. Invoice, Receipt, ID Card"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea 
                      id="description" 
                      value={newDocType.description}
                      onChange={(e) => setNewDocType({...newDocType, description: e.target.value})}
                      placeholder="Describe this document type..."
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="isActive">Active</Label>
                    <Switch 
                      id="isActive" 
                      checked={newDocType.isActive}
                      onCheckedChange={(checked) => setNewDocType({...newDocType, isActive: checked})}
                    />
                    <span className="text-sm text-muted-foreground ml-1">
                      {newDocType.isActive ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setNewDocTypeOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreateDocType}>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            
            <Dialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">Reset</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Reset to Defaults</DialogTitle>
                  <DialogDescription>
                    This will reset all document types and configurations to their default values.
                    This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex items-center gap-2 mt-2 p-3 bg-amber-50 rounded-md">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <p className="text-sm text-amber-800">
                    All custom document types and data elements will be lost.
                  </p>
                </div>
                <DialogFooter className="mt-4">
                  <Button variant="outline" onClick={() => setResetConfirmOpen(false)}>Cancel</Button>
                  <Button variant="destructive" onClick={() => { resetToDefaults(); setResetConfirmOpen(false); }}>
                    Reset All
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        
        <CardContent>
          {config.documentTypes.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-muted-foreground">No document types configured.</p>
              <Button 
                variant="outline" 
                className="mt-2" 
                onClick={() => setNewDocTypeOpen(true)}
              >
                Add Document Type
              </Button>
            </div>
          ) : (
            <Tabs 
              value={activeDocumentTypeId || config.documentTypes[0]?.id || ""}
              onValueChange={handleDocTypeSelect}
            >
              <TabsList className="mb-4 w-full justify-start overflow-auto">
                {config.documentTypes.map((docType) => (
                  <TabsTrigger 
                    key={docType.id}
                    value={docType.id}
                    className="relative"
                  >
                    {docType.name}
                    {!docType.isActive && (
                      <span className="absolute top-0 right-0 w-2 h-2 bg-amber-500 rounded-full"></span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
              
              {config.documentTypes.map((docType) => (
                <TabsContent key={docType.id} value={docType.id} className="space-y-4">
                  <div className="flex flex-col gap-2 mb-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-medium">{docType.name}</h3>
                        {docType.description && (
                          <p className="text-sm text-muted-foreground">{docType.description}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => setDeleteConfirmOpen(true)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Dialog
                          open={deleteConfirmOpen}
                          onOpenChange={setDeleteConfirmOpen}
                        >
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Delete Document Type</DialogTitle>
                              <DialogDescription>
                                Are you sure you want to delete the "{docType.name}" document type?
                                This action cannot be undone.
                              </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                              <Button
                                variant="outline"
                                onClick={() => setDeleteConfirmOpen(false)}
                              >
                                Cancel
                              </Button>
                              <Button
                                variant="destructive"
                                onClick={handleDeleteDocType}
                              >
                                Delete
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`docType-${docType.id}-active`}>Active</Label>
                      <Switch
                        id={`docType-${docType.id}-active`}
                        checked={docType.isActive}
                        onCheckedChange={(checked) => updateDocumentType(docType.id, { isActive: checked })}
                      />
                      <span className="text-sm text-muted-foreground ml-1">
                        {docType.isActive ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>
                  
                  <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid grid-cols-2 mb-4">
                      <TabsTrigger value="data-elements">Data Elements</TabsTrigger>
                      <TabsTrigger value="training-data">Classification Training</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="data-elements">
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="font-medium">Data Elements</h4>
                          <Dialog open={newElementOpen} onOpenChange={setNewElementOpen}>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="outline" className="gap-1">
                                <Plus className="h-4 w-4" />
                                Add Element
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Add Data Element</DialogTitle>
                                <DialogDescription>
                                  Configure a new data element to extract or redact from documents.
                                </DialogDescription>
                              </DialogHeader>
                              <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                  <Label htmlFor="element-name">Name</Label>
                                  <Input
                                    id="element-name"
                                    value={newDataElement.name}
                                    onChange={(e) => setNewDataElement({...newDataElement, name: e.target.value})}
                                    placeholder="e.g. Invoice Number, Total Amount"
                                  />
                                </div>
                                <div className="grid gap-2">
                                  <Label htmlFor="element-type">Data Type</Label>
                                  <Select
                                    value={newDataElement.type}
                                    onValueChange={(value: DataElementType) => 
                                      setNewDataElement({...newDataElement, type: value})
                                    }
                                  >
                                    <SelectTrigger id="element-type">
                                      <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Text">Text</SelectItem>
                                      <SelectItem value="Number">Number</SelectItem>
                                      <SelectItem value="Date">Date</SelectItem>
                                      <SelectItem value="Currency">Currency</SelectItem>
                                      <SelectItem value="Email">Email</SelectItem>
                                      <SelectItem value="Phone">Phone Number</SelectItem>
                                      <SelectItem value="Address">Address</SelectItem>
                                      <SelectItem value="Name">Name</SelectItem>
                                      <SelectItem value="SSN">SSN</SelectItem>
                                      <SelectItem value="CreditCard">Credit Card</SelectItem>
                                      <SelectItem value="Custom">Custom</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="grid gap-2">
                                  <Label htmlFor="element-category">Category</Label>
                                  <Select
                                    value={newDataElement.category}
                                    onValueChange={(value: DataElementCategory) => 
                                      setNewDataElement({...newDataElement, category: value})
                                    }
                                  >
                                    <SelectTrigger id="element-category">
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
                                <div className="grid gap-2">
                                  <Label htmlFor="element-action">Action</Label>
                                  <Select
                                    value={newDataElement.action}
                                    onValueChange={(value: DataElementAction) => 
                                      setNewDataElement({...newDataElement, action: value})
                                    }
                                  >
                                    <SelectTrigger id="element-action">
                                      <SelectValue placeholder="Select action" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Extract">Extract Only</SelectItem>
                                      <SelectItem value="Redact">Redact Only</SelectItem>
                                      <SelectItem value="ExtractAndRedact">Extract and Redact</SelectItem>
                                      <SelectItem value="Ignore">Ignore</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {getActionDescription(newDataElement.action)}
                                  </p>
                                </div>
                                <div className="grid gap-2">
                                  <Label htmlFor="element-description">Description (Optional)</Label>
                                  <Textarea
                                    id="element-description"
                                    value={newDataElement.description}
                                    onChange={(e) => setNewDataElement({...newDataElement, description: e.target.value})}
                                    placeholder="Describe this data element..."
                                  />
                                </div>
                                <div className="flex items-center gap-2">
                                  <Label htmlFor="element-required">Required</Label>
                                  <Switch
                                    id="element-required"
                                    checked={!!newDataElement.required}
                                    onCheckedChange={(checked) => 
                                      setNewDataElement({...newDataElement, required: checked})
                                    }
                                  />
                                  <span className="text-sm text-muted-foreground ml-1">
                                    {newDataElement.required ? 'Required' : 'Optional'}
                                  </span>
                                </div>
                              </div>
                              <DialogFooter>
                                <Button variant="outline" onClick={() => setNewElementOpen(false)}>Cancel</Button>
                                <Button onClick={handleCreateDataElement}>Add Element</Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </div>
                        
                        {docType.dataElements.length === 0 ? (
                          <div className="p-6 text-center border rounded-md bg-muted/20">
                            <p className="text-muted-foreground">No data elements configured.</p>
                            <Button 
                              variant="outline" 
                              className="mt-2"
                              onClick={() => setNewElementOpen(true)}
                            >
                              Add Data Element
                            </Button>
                          </div>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead>Action</TableHead>
                                <TableHead className="w-[100px]">Options</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {docType.dataElements.map((element) => (
                                <TableRow key={element.id}>
                                  <TableCell className="font-medium">
                                    {element.name}
                                    {element.required && (
                                      <span className="ml-1 text-red-500">*</span>
                                    )}
                                    {element.isDefault && (
                                      <Badge variant="outline" className="ml-2 text-xs">Default</Badge>
                                    )}
                                  </TableCell>
                                  <TableCell>{element.type}</TableCell>
                                  <TableCell>
                                    <Badge className={getCategoryColor(element.category)}>
                                      {element.category}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline">
                                      {element.action === 'Extract' && 'Extract Only'}
                                      {element.action === 'Redact' && 'Redact Only'}
                                      {element.action === 'ExtractAndRedact' && 'Extract & Redact'}
                                      {element.action === 'Ignore' && 'Ignore'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex gap-2">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => openEditElement(element)}
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-destructive"
                                        onClick={() => handleDeleteDataElement(element.id)}
                                        disabled={element.isDefault}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                        
                        <Dialog open={editElementOpen} onOpenChange={setEditElementOpen}>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Edit Data Element</DialogTitle>
                              <DialogDescription>
                                Update the configuration for this data element.
                              </DialogDescription>
                            </DialogHeader>
                            {currentDataElement && (
                              <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                  <Label htmlFor="edit-element-name">Name</Label>
                                  <Input
                                    id="edit-element-name"
                                    value={currentDataElement.name}
                                    onChange={(e) => setCurrentDataElement({
                                      ...currentDataElement,
                                      name: e.target.value
                                    })}
                                  />
                                </div>
                                <div className="grid gap-2">
                                  <Label htmlFor="edit-element-type">Data Type</Label>
                                  <Select
                                    value={currentDataElement.type}
                                    onValueChange={(value: DataElementType) => 
                                      setCurrentDataElement({
                                        ...currentDataElement,
                                        type: value
                                      })
                                    }
                                    disabled={currentDataElement.isDefault}
                                  >
                                    <SelectTrigger id="edit-element-type">
                                      <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Text">Text</SelectItem>
                                      <SelectItem value="Number">Number</SelectItem>
                                      <SelectItem value="Date">Date</SelectItem>
                                      <SelectItem value="Currency">Currency</SelectItem>
                                      <SelectItem value="Email">Email</SelectItem>
                                      <SelectItem value="Phone">Phone Number</SelectItem>
                                      <SelectItem value="Address">Address</SelectItem>
                                      <SelectItem value="Name">Name</SelectItem>
                                      <SelectItem value="SSN">SSN</SelectItem>
                                      <SelectItem value="CreditCard">Credit Card</SelectItem>
                                      <SelectItem value="Custom">Custom</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="grid gap-2">
                                  <Label htmlFor="edit-element-category">Category</Label>
                                  <Select
                                    value={currentDataElement.category}
                                    onValueChange={(value: DataElementCategory) => 
                                      setCurrentDataElement({
                                        ...currentDataElement,
                                        category: value
                                      })
                                    }
                                    disabled={currentDataElement.isDefault}
                                  >
                                    <SelectTrigger id="edit-element-category">
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
                                <div className="grid gap-2">
                                  <Label htmlFor="edit-element-action">Action</Label>
                                  <Select
                                    value={currentDataElement.action}
                                    onValueChange={(value: DataElementAction) => 
                                      setCurrentDataElement({
                                        ...currentDataElement,
                                        action: value
                                      })
                                    }
                                  >
                                    <SelectTrigger id="edit-element-action">
                                      <SelectValue placeholder="Select action" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Extract">Extract Only</SelectItem>
                                      <SelectItem value="Redact">Redact Only</SelectItem>
                                      <SelectItem value="ExtractAndRedact">Extract and Redact</SelectItem>
                                      <SelectItem value="Ignore">Ignore</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {getActionDescription(currentDataElement.action)}
                                  </p>
                                </div>
                                <div className="grid gap-2">
                                  <Label htmlFor="edit-element-description">Description (Optional)</Label>
                                  <Textarea
                                    id="edit-element-description"
                                    value={currentDataElement.description || ""}
                                    onChange={(e) => setCurrentDataElement({
                                      ...currentDataElement,
                                      description: e.target.value
                                    })}
                                  />
                                </div>
                                <div className="flex items-center gap-2">
                                  <Label htmlFor="edit-element-required">Required</Label>
                                  <Switch
                                    id="edit-element-required"
                                    checked={!!currentDataElement.required}
                                    onCheckedChange={(checked) => 
                                      setCurrentDataElement({
                                        ...currentDataElement,
                                        required: checked
                                      })
                                    }
                                  />
                                  <span className="text-sm text-muted-foreground ml-1">
                                    {currentDataElement.required ? 'Required' : 'Optional'}
                                  </span>
                                </div>
                              </div>
                            )}
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setEditElementOpen(false)}>Cancel</Button>
                              <Button onClick={handleUpdateDataElement}>Save Changes</Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="training-data">
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <h4 className="font-medium">Classification Training</h4>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <ClassificationFeedbackStats 
                              documentType={docType.name}
                              onTrainClick={handleTrainWithFeedback}
                            />
                          </div>
                          <div>
                            <TrainingDatasetPanel />
                          </div>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </TabsContent>
              ))}
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  )
} 