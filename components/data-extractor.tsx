"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import type { ExtractedField } from "@/lib/types"

interface DataExtractorProps {
  extractedFields: ExtractedField[]
  fieldsToRedact: Set<string>
  onToggleField: (fieldId: string) => void
}

export function DataExtractor({ extractedFields, fieldsToRedact, onToggleField }: DataExtractorProps) {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Extracted Data Fields</CardTitle>
      </CardHeader>
      <CardContent>
        {extractedFields.length === 0 ? (
          <p className="text-muted-foreground">No fields detected</p>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground mb-2">Select fields to redact in the document</div>
            <div className="space-y-2">
              {extractedFields.map((field) => (
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
    </Card>
  )
}

