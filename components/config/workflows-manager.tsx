"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Settings2 } from "lucide-react"

export function WorkflowsManager() {
  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle>Workflow Configuration</CardTitle>
            <CardDescription>Configure automated document processing workflows</CardDescription>
          </div>
          <Button disabled>
            <Plus className="mr-2 h-4 w-4" />
            Add Workflow
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            <div className="text-center">
              <Settings2 className="h-8 w-8 mx-auto mb-4 text-muted-foreground/50" />
              <p>Workflow configuration coming soon...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 