"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronUp } from "lucide-react"
import type { ExtractedField, DataElementConfig } from "@/lib/types"

interface DataExtractorProps {
  extractedFields: ExtractedField[]
  fieldsToRedact: Set<string>
  onToggleField: (fieldId: string) => void
  documentType?: string
  documentSubType?: string
  documentConfig?: {
    dataElements: DataElementConfig[]
    subTypeDataElements?: DataElementConfig[]
  }
}

export function DataExtractor({ 
  extractedFields, 
  fieldsToRedact, 
  onToggleField, 
  documentType,
  documentSubType,
  documentConfig
}: DataExtractorProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  const getDataTypeBadgeColor = (dataType: string) => {
    switch (dataType) {
      case "PII":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
      case "Financial":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
      case "Date":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300"
      case "Address":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300"
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300"
    }
  }

  // Helper function to check if a field should be displayed based on document type/subtype
  const shouldDisplayField = (field: ExtractedField): boolean => {
    if (!documentConfig) return true
    
    // Get the relevant data elements based on subtype (if selected) or document type
    const relevantDataElements = documentSubType && documentConfig.subTypeDataElements 
      ? documentConfig.subTypeDataElements 
      : documentConfig.dataElements

    // Check if there are any data elements with 'Extract' or 'ExtractAndRedact' action
    const extractableElementIds = relevantDataElements
      .filter(element => element.action === 'Extract' || element.action === 'ExtractAndRedact')
      .map(element => element.id)
    
    // If no extractable elements found, show all fields
    if (extractableElementIds.length === 0) return true
    
    // Match field to extractable elements by id or label
    return extractableElementIds.some(elementId => 
      field.id === elementId || 
      field.label.toLowerCase() === relevantDataElements.find(e => e.id === elementId)?.name.toLowerCase()
    )
  }

  // Filter fields based on document type/subtype
  const filteredFields = extractedFields.filter(shouldDisplayField)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Extracted Data Fields</CardTitle>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label={isCollapsed ? "Expand" : "Collapse"}
        >
          {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </Button>
      </CardHeader>
      {!isCollapsed && (
        <CardContent>
          {filteredFields.length === 0 ? (
            <p className="text-muted-foreground">No fields detected</p>
          ) : (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground mb-2">Select fields to redact in the document</div>
              <div className="space-y-2">
                {filteredFields.map((field) => (
                  <div key={field.id} className="flex items-start space-x-3 p-3 rounded-md border">
                    <Checkbox
                      id={field.id}
                      checked={fieldsToRedact.has(field.id)}
                      onCheckedChange={() => onToggleField(field.id)}
                    />
                    <div className="grid gap-1.5 leading-none">
                      <div className="flex items-center gap-2">
                        <label
                          htmlFor={field.id}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          {field.label}
                        </label>
                        <Badge className={getDataTypeBadgeColor(field.dataType)}>{field.dataType}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground break-all">{field.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}

