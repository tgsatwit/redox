"use client"

import { useState } from "react"
import { 
  Card,
  CardContent, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card"
import { 
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent 
} from "@/components/ui/tabs"
import { useConfigStoreDB } from "@/lib/config-store-db"
import { useConfigContext } from "@/providers/config-provider"
import { useToast } from "@/components/ui/use-toast"

import { DocumentTypeManager } from "@/components/config/document-type-manager"
import { SubTypeManager } from "@/components/config/subtype-manager"
import { DataElementManager } from "@/components/config/data-element-manager"
import { ConfigurationSyncPanel } from "@/components/config/configuration-sync-panel"
import { FeedbackTrainingPanel } from "@/components/config/feedback-training-panel"

export function DocumentConfigManager() {
  const { 
    config, 
    activeDocumentTypeId, 
    setActiveDocumentType,
    isLoading: storeIsLoading
  } = useConfigStoreDB()
  
  const { isLoading: contextIsLoading } = useConfigContext()
  const isLoading = storeIsLoading || contextIsLoading

  const [documentTypeTabs, setDocumentTypeTabs] = useState<Record<string, string>>({})
  const [activeSubTypeId, setActiveSubTypeId] = useState<string | null>(null)
  
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

  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader>
          <CardTitle>Document Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="w-full md:w-1/4">
              <DocumentTypeManager 
                activeDocumentTypeId={activeDocumentTypeId}
                documentTypes={config.documentTypes}
                onSelectDocType={handleDocTypeSelect}
                isLoading={isLoading}
              />
            </div>
            
            <div className="w-full md:w-3/4">
              {activeDocumentType && (
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="data-elements">Data Elements</TabsTrigger>
                    <TabsTrigger value="subtypes">Sub Types</TabsTrigger>
                    <TabsTrigger value="sync-config">Configuration Sync</TabsTrigger>
                    <TabsTrigger value="feedback">Feedback & Training</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="data-elements">
                    <DataElementManager 
                      documentType={activeDocumentType}
                      subTypeId={activeSubTypeId}
                      isLoading={isLoading}
                    />
                  </TabsContent>
                  
                  <TabsContent value="subtypes">
                    <SubTypeManager
                      documentType={activeDocumentType}
                      activeSubTypeId={activeSubTypeId}
                      setActiveSubTypeId={setActiveSubTypeId}
                      isLoading={isLoading}
                    />
                  </TabsContent>
                  
                  <TabsContent value="sync-config">
                    <ConfigurationSyncPanel
                      documentType={activeDocumentType}
                      isLoading={isLoading}
                    />
                  </TabsContent>
                  
                  <TabsContent value="feedback">
                    <FeedbackTrainingPanel
                      documentType={activeDocumentType}
                      isLoading={isLoading}
                    />
                  </TabsContent>
                </Tabs>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 