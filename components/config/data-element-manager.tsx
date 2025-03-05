"use client"

import { useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Plus, Pencil, Trash2, Loader2, X } from "lucide-react"
import { useConfigStoreDB } from "@/lib/config-store-db"
import type { DocumentTypeConfig, DataElementConfig, DataElementType, DataElementCategory, DataElementAction } from "@/lib/types"
import { useToast } from "@/components/ui/use-toast"

interface DataElementManagerProps {
  documentType: DocumentTypeConfig;
  subTypeId: string | null;
  isLoading: boolean;
}

export function DataElementManager({ 
  documentType, 
  subTypeId,
  isLoading 
}: DataElementManagerProps) {
  const {
    addDataElement,
    updateDataElement,
    deleteDataElement
  } = useConfigStoreDB()
  
  const [newElementOpen, setNewElementOpen] = useState(false)
  const [editElementOpen, setEditElementOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  
  const [newDataElement, setNewDataElement] = useState<Omit<DataElementConfig, 'id'>>({
    name: "",
    type: "Text" as DataElementType,
    category: "General" as DataElementCategory,
    action: "Extract" as DataElementAction,
    description: "",
    required: false,
    aliases: []
  })
  
  const [currentDataElement, setCurrentDataElement] = useState<DataElementConfig | null>(null)
  const [newAlias, setNewAlias] = useState<string>("")
  
  const { toast } = useToast()
  
  const handleCreateDataElement = async () => {
    if (!newDataElement.name.trim()) return
    
    try {
      const elementToAdd: Omit<DataElementConfig, 'id'> = {
        ...newDataElement,
        documentTypeId: documentType.id,
        subTypeId: subTypeId || undefined
      }
      
      await addDataElement(documentType.id, elementToAdd)
      
      setNewElementOpen(false)
      setNewDataElement({
        name: "",
        type: "Text",
        category: "General",
        action: "Extract",
        description: "",
        required: false,
        aliases: []
      })
      setNewAlias("")
      
      toast({
        title: "Success",
        description: "Data element created successfully",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create data element",
        variant: "destructive"
      })
    }
  }
  
  const handleUpdateDataElement = async () => {
    if (!currentDataElement || !currentDataElement.name.trim()) return
    
    try {
      await updateDataElement(
        documentType.id, 
        currentDataElement.id, 
        currentDataElement
      )
      
      setEditElementOpen(false)
      setCurrentDataElement(null)
      setNewAlias("")
      
      toast({
        title: "Success",
        description: "Data element updated successfully",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update data element",
        variant: "destructive"
      })
    }
  }
  
  const handleDeleteDataElement = async () => {
    if (!currentDataElement) return
    
    try {
      await deleteDataElement(documentType.id, currentDataElement.id)
      
      setDeleteConfirmOpen(false)
      setCurrentDataElement(null)
      
      toast({
        title: "Success",
        description: "Data element deleted successfully",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete data element",
        variant: "destructive"
      })
    }
  }
  
  const openEditElement = (element: DataElementConfig) => {
    setCurrentDataElement(element)
    setEditElementOpen(true)
  }
  
  const getCategoryColor = (category: DataElementCategory) => {
    switch (category) {
      case "General": return "bg-blue-100 text-blue-800"
      case "PII": return "bg-purple-100 text-purple-800"
      case "Financial": return "bg-green-100 text-green-800"
      case "Medical": return "bg-orange-100 text-orange-800"
      case "Legal": return "bg-yellow-100 text-yellow-800"
      default: return "bg-gray-100 text-gray-800"
    }
  }
  
  const getActionDescription = (action: DataElementAction) => {
    switch (action) {
      case "Extract": return "Extract value from document"
      case "Redact": return "Redact this value from document"
      case "ExtractAndRedact": return "Extract and redact this value"
      case "Ignore": return "Ignore this value"
      default: return action
    }
  }
  
  const dataElements = subTypeId && documentType.subTypes 
    ? ((documentType.subTypes || []).find(st => st.id === subTypeId)?.dataElements || [])
    : (documentType.dataElements || [])

  const addAlias = (isNew: boolean) => {
    if (!newAlias.trim()) return
    
    if (isNew) {
      setNewDataElement({
        ...newDataElement,
        aliases: [...(newDataElement.aliases || []), newAlias]
      })
    } else if (currentDataElement) {
      setCurrentDataElement({
        ...currentDataElement,
        aliases: [...(currentDataElement.aliases || []), newAlias]
      })
    }
    
    setNewAlias("")
  }
  
  const removeAlias = (alias: string, isNew: boolean) => {
    if (isNew) {
      setNewDataElement({
        ...newDataElement,
        aliases: (newDataElement.aliases || []).filter(a => a !== alias)
      })
    } else if (currentDataElement) {
      setCurrentDataElement({
        ...currentDataElement,
        aliases: (currentDataElement.aliases || []).filter(a => a !== alias)
      })
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>
            {subTypeId && documentType.subTypes 
              ? `${(documentType.subTypes || []).find(st => st.id === subTypeId)?.name || 'Subtype'} Elements`
              : 'Data Elements'}
          </CardTitle>
          <CardDescription>
            {subTypeId 
              ? `Data elements specific to this sub-type`
              : `Common data elements for ${documentType.name}`}
          </CardDescription>
        </div>
        <Button 
          onClick={() => setNewElementOpen(true)} 
          disabled={isLoading}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Element
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Required</TableHead>
                <TableHead>Action</TableHead>
                <TableHead className="w-1/5">Aliases</TableHead>
                <TableHead className="text-right">Options</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dataElements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No data elements defined. Click "Add Element" to create one.
                  </TableCell>
                </TableRow>
              ) : (
                dataElements.map((element) => (
                  <TableRow key={element.id}>
                    <TableCell>
                      <div className="font-medium">{element.name}</div>
                      {element.description && (
                        <div className="text-xs text-muted-foreground">{element.description}</div>
                      )}
                    </TableCell>
                    <TableCell>{element.type}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getCategoryColor(element.category)}>
                        {element.category}
                      </Badge>
                    </TableCell>
                    <TableCell>{element.required ? "Yes" : "No"}</TableCell>
                    <TableCell>
                      <div className="text-xs">
                        {getActionDescription(element.action)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {element.aliases && element.aliases.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {element.aliases.map((alias, index) => (
                              <Badge key={index} variant="outline" className="text-xs px-2 py-0">
                                {alias}
                              </Badge>
                            ))}
                            {element.aliases.length > 0 && (
                              <div className="text-xs text-muted-foreground mt-1 w-full">
                                {element.aliases.length} alternative name{element.aliases.length !== 1 ? 's' : ''}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">No aliases defined</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
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
                        onClick={() => {
                          setCurrentDataElement(element)
                          setDeleteConfirmOpen(true)
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* New element dialog */}
      <Dialog open={newElementOpen} onOpenChange={setNewElementOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Data Element</DialogTitle>
            <DialogDescription>
              Add a new data element to your document configuration.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="element-name" className="text-right">Name</Label>
              <Input
                id="element-name"
                value={newDataElement.name}
                onChange={(e) => setNewDataElement({ ...newDataElement, name: e.target.value })}
                className="col-span-3"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="element-description" className="text-right">Description</Label>
              <Textarea
                id="element-description"
                value={newDataElement.description}
                onChange={(e) => setNewDataElement({ ...newDataElement, description: e.target.value })}
                className="col-span-3"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="element-type" className="text-right">Type</Label>
              <Select
                value={newDataElement.type}
                onValueChange={(value) => setNewDataElement({ ...newDataElement, type: value as DataElementType })}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Text">Text</SelectItem>
                  <SelectItem value="Number">Number</SelectItem>
                  <SelectItem value="Date">Date</SelectItem>
                  <SelectItem value="Currency">Currency</SelectItem>
                  <SelectItem value="Boolean">Boolean</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="element-category" className="text-right">Category</Label>
              <Select
                value={newDataElement.category}
                onValueChange={(value) => setNewDataElement({ ...newDataElement, category: value as DataElementCategory })}
              >
                <SelectTrigger className="col-span-3">
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

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="element-action" className="text-right">Action</Label>
              <Select
                value={newDataElement.action}
                onValueChange={(value) => setNewDataElement({ ...newDataElement, action: value as DataElementAction })}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Extract">Extract</SelectItem>
                  <SelectItem value="Redact">Redact</SelectItem>
                  <SelectItem value="ExtractAndRedact">Extract and Redact</SelectItem>
                  <SelectItem value="Ignore">Ignore</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Aliases section */}
            <div className="grid grid-cols-4 items-start gap-4">
              <Label className="text-right pt-2">Aliases</Label>
              <div className="col-span-3">
                <div className="flex flex-wrap gap-2 mb-2">
                  {(newDataElement.aliases || []).map((alias, index) => (
                    <Badge key={index} variant="secondary" className="flex items-center gap-1">
                      {alias}
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-4 w-4 p-0" 
                        onClick={() => removeAlias(alias, true)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newAlias}
                    onChange={(e) => setNewAlias(e.target.value)}
                    placeholder="Add alternative variable name"
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addAlias(true);
                      }
                    }}
                  />
                  <Button 
                    type="button" 
                    size="sm" 
                    onClick={() => addAlias(true)}
                  >
                    Add
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  <strong>Alternative variable names</strong> are used to match incoming data fields that may use different naming conventions. For example, a "Full Name" field might be called "name", "fullName", or "customer_name" in different systems.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="element-required" className="text-right">Required</Label>
              <div className="col-span-3 flex items-center space-x-2">
                <Switch
                  id="element-required"
                  checked={newDataElement.required}
                  onCheckedChange={(checked) => setNewDataElement({ ...newDataElement, required: checked })}
                />
                <Label htmlFor="element-required">
                  {newDataElement.required ? "Yes" : "No"}
                </Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setNewElementOpen(false);
              setNewDataElement({
                name: "",
                type: "Text",
                category: "General",
                action: "Extract",
                description: "",
                required: false,
                aliases: []
              });
              setNewAlias("");
            }}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateDataElement}
              disabled={!newDataElement.name.trim()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit element dialog */}
      <Dialog open={editElementOpen} onOpenChange={setEditElementOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Data Element</DialogTitle>
            <DialogDescription>
              Update the properties of this data element.
            </DialogDescription>
          </DialogHeader>

          {currentDataElement && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-element-name" className="text-right">Name</Label>
                <Input
                  id="edit-element-name"
                  value={currentDataElement.name}
                  onChange={(e) => setCurrentDataElement({ ...currentDataElement, name: e.target.value })}
                  className="col-span-3"
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-element-description" className="text-right">Description</Label>
                <Textarea
                  id="edit-element-description"
                  value={currentDataElement.description}
                  onChange={(e) => setCurrentDataElement({ ...currentDataElement, description: e.target.value })}
                  className="col-span-3"
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-element-type" className="text-right">Type</Label>
                <Select
                  value={currentDataElement.type}
                  onValueChange={(value) => setCurrentDataElement({ ...currentDataElement, type: value as DataElementType })}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Text">Text</SelectItem>
                    <SelectItem value="Number">Number</SelectItem>
                    <SelectItem value="Date">Date</SelectItem>
                    <SelectItem value="Currency">Currency</SelectItem>
                    <SelectItem value="Boolean">Boolean</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-element-category" className="text-right">Category</Label>
                <Select
                  value={currentDataElement.category}
                  onValueChange={(value) => setCurrentDataElement({ ...currentDataElement, category: value as DataElementCategory })}
                >
                  <SelectTrigger className="col-span-3">
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

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-element-action" className="text-right">Action</Label>
                <Select
                  value={currentDataElement.action}
                  onValueChange={(value) => setCurrentDataElement({ ...currentDataElement, action: value as DataElementAction })}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select action" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Extract">Extract</SelectItem>
                    <SelectItem value="Redact">Redact</SelectItem>
                    <SelectItem value="ExtractAndRedact">Extract and Redact</SelectItem>
                    <SelectItem value="Ignore">Ignore</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Aliases section */}
              <div className="grid grid-cols-4 items-start gap-4">
                <Label className="text-right pt-2">Aliases</Label>
                <div className="col-span-3">
                  <div className="flex flex-wrap gap-2 mb-2">
                    {(currentDataElement.aliases || []).map((alias, index) => (
                      <Badge key={index} variant="secondary" className="flex items-center gap-1">
                        {alias}
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-4 w-4 p-0" 
                          onClick={() => removeAlias(alias, false)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newAlias}
                      onChange={(e) => setNewAlias(e.target.value)}
                      placeholder="Add alternative variable name"
                      className="flex-1"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addAlias(false);
                        }
                      }}
                    />
                    <Button 
                      type="button" 
                      size="sm" 
                      onClick={() => addAlias(false)}
                    >
                      Add
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    <strong>Alternative variable names</strong> are used to match incoming data fields that may use different naming conventions. For example, a "Full Name" field might be called "name", "fullName", or "customer_name" in different systems.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-element-required" className="text-right">Required</Label>
                <div className="col-span-3 flex items-center space-x-2">
                  <Switch
                    id="edit-element-required"
                    checked={currentDataElement.required}
                    onCheckedChange={(checked) => setCurrentDataElement({ ...currentDataElement, required: checked })}
                  />
                  <Label htmlFor="edit-element-required">
                    {currentDataElement.required ? "Yes" : "No"}
                  </Label>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setEditElementOpen(false);
              setCurrentDataElement(null);
              setNewAlias("");
            }}>
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateDataElement}
              disabled={!currentDataElement?.name.trim()}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Data Element</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this data element? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {currentDataElement && (
            <div className="py-4">
              <p><strong>Name:</strong> {currentDataElement.name}</p>
              {currentDataElement.description && (
                <p><strong>Description:</strong> {currentDataElement.description}</p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteDataElement}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
} 