"use client"

import { DataExtractorProps } from "./document-processor/types/component-props"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"

export function DataExtractor({ data, elements, selectedElements, onElementSelect }: DataExtractorProps) {
  if (!data || !elements || elements.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-muted/10 rounded-lg">
        <p className="text-muted-foreground">No data extracted</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[10%]">Select</TableHead>
            <TableHead className="w-[40%]">Field</TableHead>
            <TableHead className="w-[35%]">Value</TableHead>
            <TableHead className="w-[15%] text-right">Confidence</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {elements.map((element) => (
            <TableRow key={element.id}>
              <TableCell className="text-center">
                <Checkbox
                  checked={selectedElements.includes(element.id)}
                  onCheckedChange={() => onElementSelect(element.id)}
                  id={`select-element-${element.id}`}
                />
              </TableCell>
              <TableCell className="font-medium">
                <label htmlFor={`select-element-${element.id}`} className="cursor-pointer">
                  {(element as any).label || "Unknown"}
                  {(element as any).category === 'PII' && (
                    <Badge variant="outline" className="ml-2 text-xs">PII</Badge>
                  )}
                  {(element as any).action && (
                    <Badge variant={(element as any).action === 'Redact' ? "destructive" : 
                                  (element as any).action === 'ExtractAndRedact' ? "default" : 
                                  "secondary"} 
                           className="ml-2 text-xs">
                      {(element as any).action}
                    </Badge>
                  )}
                </label>
              </TableCell>
              <TableCell>{element.text || "Not found"}</TableCell>
              <TableCell className="text-right">
                {element.confidence
                  ? `${(element.confidence * 100).toFixed(0)}%`
                  : "N/A"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

