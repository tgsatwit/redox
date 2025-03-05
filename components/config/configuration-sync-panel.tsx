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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Loader2, Check, RotateCw, AlertCircle } from "lucide-react"
import type { DocumentTypeConfig } from "@/lib/types"
import { useToast } from "@/components/ui/use-toast"

interface ConfigurationSyncPanelProps {
  documentType: DocumentTypeConfig;
  isLoading: boolean;
}

export function ConfigurationSyncPanel({ 
  documentType, 
  isLoading 
}: ConfigurationSyncPanelProps) {
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle')
  const { toast } = useToast()
  
  const handleSyncConfig = async () => {
    setSyncStatus('syncing')
    
    // Simulate API call to sync configuration
    setTimeout(() => {
      setSyncStatus('success')
      
      toast({
        title: "Success",
        description: "Document type configuration synced successfully.",
      })
    }, 2000)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{documentType.name} Configuration Sync</CardTitle>
        <CardDescription>
          Apply configuration changes to all environments
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Sync Configuration</AlertTitle>
            <AlertDescription>
              This will sync the current document type configuration to all environments.
              Any changes will be applied to the document processing pipeline.
            </AlertDescription>
          </Alert>
          
          <Button 
            onClick={handleSyncConfig}
            disabled={syncStatus === 'syncing' || isLoading}
            className="w-full"
          >
            {syncStatus === 'syncing' ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Syncing...
              </>
            ) : syncStatus === 'success' ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                Synced Successfully
              </>
            ) : (
              <>
                <RotateCw className="mr-2 h-4 w-4" />
                Sync Configuration
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
} 