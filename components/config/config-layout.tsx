"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DocumentConfigManager } from "./document-config-manager"
import { RetentionPolicyManager } from "../retention-policy-manager"
import { WorkflowsManager } from "./workflows-manager"

export function ConfigLayout() {
  return (
    <div className="space-y-4">
      <Tabs defaultValue="document-config">
        <TabsList className="w-full border-b">
          <TabsTrigger value="document-config">Document Configuration</TabsTrigger>
          <TabsTrigger value="retention-policies">Retention Policies</TabsTrigger>
          <TabsTrigger value="workflows">Workflows</TabsTrigger>
        </TabsList>

        <TabsContent value="document-config">
          <DocumentConfigManager />
        </TabsContent>

        <TabsContent value="retention-policies">
          <RetentionPolicyManager />
        </TabsContent>

        <TabsContent value="workflows">
          <WorkflowsManager />
        </TabsContent>
      </Tabs>
    </div>
  )
} 