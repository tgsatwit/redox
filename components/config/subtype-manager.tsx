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
import { ChevronDown, ChevronRight, Plus, Loader2, Trash2, AlertTriangle } from "lucide-react"
import { useConfigStoreDB } from "@/lib/config-store-db"
import type { DocumentTypeConfig, DocumentSubTypeConfig, DataElementConfig } from "@/lib/types"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

interface SubTypeManagerProps {
  documentType: DocumentTypeConfig;
  activeSubTypeId: string | null;
  setActiveSubTypeId: (id: string | null) => void;
  isLoading: boolean;
}

export function SubTypeManager({ 
  documentType, 
  activeSubTypeId,
  setActiveSubTypeId,
  isLoading 
}: SubTypeManagerProps) {
  const {
    addSubType,
    deleteSubType
  } = useConfigStoreDB()
  
  const [newSubTypeOpen, setNewSubTypeOpen] = useState(false)
  const [expandedSubTypes, setExpandedSubTypes] = useState<Set<string>>(new Set())
  
  const [newSubType, setNewSubType] = useState<Omit<DocumentSubTypeConfig, 'id'>>({
    name: "",
    description: "",
    dataElements: [],
    awsAnalysisType: "TEXTRACT_ANALYZE_DOCUMENT" as const,
    isActive: true
  })
  
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [subTypeToDelete, setSubTypeToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  
  const { toast } = useToast()
  
  const handleCreateSubType = async () => {
    if (!newSubType.name.trim()) return
    
    try {
      const subTypeId = crypto.randomUUID()
      
      await addSubType(documentType.id, {
        ...newSubType,
        id: subTypeId
      })
      
      setNewSubTypeOpen(false)
      setNewSubType({
        name: "",
        description: "",
        dataElements: [],
        awsAnalysisType: "TEXTRACT_ANALYZE_DOCUMENT",
        isActive: true
      })
      
      // Automatically select the new subtype
      setActiveSubTypeId(subTypeId)
      
      toast({
        title: "Success",
        description: "Document sub-type created successfully",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create document sub-type",
        variant: "destructive"
      })
    }
  }
  
  const handleDeleteSubType = async () => {
    if (!subTypeToDelete) return
    
    try {
      setIsDeleting(true)
      await deleteSubType(documentType.id, subTypeToDelete)
      
      setDeleteDialogOpen(false)
      setSubTypeToDelete(null)
      
      // If the deleted sub-type was the active one, deselect it
      if (subTypeToDelete === activeSubTypeId) {
        setActiveSubTypeId(null)
      }
      
      toast({
        title: "Success",
        description: "Document sub-type deleted successfully",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete document sub-type",
        variant: "destructive"
      })
    } finally {
      setIsDeleting(false)
    }
  }
  
  const openDeleteDialog = (subTypeId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSubTypeToDelete(subTypeId)
    setDeleteDialogOpen(true)
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

  // Helper function to get category badge color
  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'PII':
        return 'bg-pink-100 text-pink-800 border-pink-300';
      case 'Financial':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'Legal':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">
          {documentType ? `${documentType.name} Sub-Types` : 'Sub-Types'}
        </CardTitle>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => setNewSubTypeOpen(true)}
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
            {documentType && documentType.subTypes && documentType.subTypes.length > 0 ? (
              documentType.subTypes.map((subType) => (
                <Collapsible 
                  key={subType.id}
                  open={expandedSubTypes.has(subType.id)}
                  onOpenChange={() => toggleSubTypeExpand(subType.id)}
                  className="border rounded-md"
                >
                  <div className="flex items-center p-2">
                    <CollapsibleTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="p-1 h-6 w-6 mr-2"
                      >
                        {expandedSubTypes.has(subType.id) ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                    </CollapsibleTrigger>
                    <Button
                      variant={subType.id === activeSubTypeId ? "default" : "outline"}
                      className="flex-grow justify-start"
                      onClick={() => setActiveSubTypeId(subType.id)}
                    >
                      <span className="truncate">{subType.name}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-1 h-8 w-8 flex-shrink-0"
                      onClick={(e) => openDeleteDialog(subType.id, e)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <CollapsibleContent>
                    <div className="px-2 pb-2">
                      {subType.description && (
                        <p className="text-sm text-muted-foreground mb-2 px-2">
                          {subType.description}
                        </p>
                      )}
                      
                      {subType.dataElements && subType.dataElements.length > 0 ? (
                        <div className="border rounded-md overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead>Required</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {subType.dataElements.map((element) => (
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
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground text-center py-4">
                          No data elements defined for this sub-type.
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))
            ) : (
              <p className="text-sm text-gray-500">No sub-types defined for this document type.</p>
            )}
          </div>
        )}
      </CardContent>

      {/* New sub-type dialog */}
      <Dialog open={newSubTypeOpen} onOpenChange={setNewSubTypeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Sub-Type</DialogTitle>
            <DialogDescription>
              Add a new sub-type to {documentType?.name || 'this document type'}.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input
                id="name"
                value={newSubType.name}
                onChange={(e) => setNewSubType({ ...newSubType, name: e.target.value })}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="description" className="text-right">
                Description
              </Label>
              <Textarea
                id="description"
                value={newSubType.description}
                onChange={(e) => setNewSubType({ ...newSubType, description: e.target.value })}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="analysis-type" className="text-right">
                Analysis Type
              </Label>
              <Select
                value={newSubType.awsAnalysisType}
                onValueChange={(value) => setNewSubType({ ...newSubType, awsAnalysisType: value as any })}
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
                  checked={newSubType.isActive}
                  onCheckedChange={(checked) => setNewSubType({ ...newSubType, isActive: checked })}
                />
                <Label htmlFor="is-active">
                  {newSubType.isActive ? "Yes" : "No"}
                </Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNewSubTypeOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateSubType}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Sub-Type
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this sub-type and all its data elements.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteSubType} 
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