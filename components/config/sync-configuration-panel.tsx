"use client"

import { useState, useEffect } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Loader2, AlertTriangle, Check, RotateCw, AlertCircle, Database } from "lucide-react"
import { useConfigStoreDB } from "@/lib/config-store-db"
import type { DocumentTypeConfig } from "@/lib/types"
import { useToast } from "@/components/ui/use-toast"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

interface SyncConfigurationPanelProps {
  documentType: DocumentTypeConfig;
  isLoading: boolean;
}

export function SyncConfigurationPanel({ 
  documentType, 
  isLoading 
}: SyncConfigurationPanelProps) {
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle')
  const [activeTab, setActiveTab] = useState<'sync' | 'feedback'>('sync')
  const [feedbackData, setFeedbackData] = useState<any[]>([])
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [trainStatus, setTrainStatus] = useState<'idle' | 'training' | 'success' | 'error'>('idle')
  
  const { toast } = useToast()

  // Load feedback data for current document type
  const loadFeedbackData = async () => {
    if (!documentType || !documentType.id) return
    
    try {
      setFeedbackLoading(true)
      
      const response = await fetch(`/api/classification-feedback/by-doctype?docTypeId=${documentType.id}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch feedback data')
      }
      
      const data = await response.json()
      setFeedbackData(data || [])
    } catch (error) {
      console.error('Error loading feedback data:', error)
      toast({
        title: "Error",
        description: "Failed to load feedback data. Please try again.",
        variant: "destructive"
      })
    } finally {
      setFeedbackLoading(false)
    }
  }
  
  // Load feedback data when tab changes or document type changes
  useEffect(() => {
    if (activeTab === 'feedback') {
      loadFeedbackData()
    }
  }, [activeTab, documentType.id])
  
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
  
  const handleTrainWithFeedback = async () => {
    try {
      setTrainStatus('training')
      
      // Call the API to train with feedback
      const response = await fetch('/api/train-with-feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          documentType: documentType.id
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to train with feedback')
      }
      
      const result = await response.json()
      setTrainStatus('success')
      
      toast({
        title: "Success",
        description: `Training completed successfully. ${result.processedCount || 0} feedback items processed.`,
      })
      
      // Reload feedback data after training
      loadFeedbackData()
    } catch (error) {
      setTrainStatus('error')
      
      toast({
        title: "Error",
        description: "Failed to train with feedback data. Please try again.",
        variant: "destructive"
      })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{documentType.name} Configuration</CardTitle>
        <CardDescription>
          Manage document type configuration and view feedback data
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="sync" value={activeTab} onValueChange={(value) => setActiveTab(value as 'sync' | 'feedback')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="sync">Configuration Sync</TabsTrigger>
            <TabsTrigger value="feedback">Feedback & Training</TabsTrigger>
          </TabsList>
          
          <TabsContent value="sync">
            <div className="space-y-4 mt-4">
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
          </TabsContent>
          
          <TabsContent value="feedback">
            <div className="space-y-4 mt-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">Classification Feedback</h3>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadFeedbackData}
                    disabled={feedbackLoading}
                  >
                    {feedbackLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCw className="h-4 w-4" />
                    )}
                    <span className="ml-2">Refresh</span>
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleTrainWithFeedback}
                    disabled={feedbackLoading || trainStatus === 'training' || feedbackData.length === 0}
                  >
                    {trainStatus === 'training' ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Database className="h-4 w-4 mr-2" />
                    )}
                    Train with Feedback
                  </Button>
                </div>
              </div>
              
              {feedbackLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : feedbackData.length === 0 ? (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>No Feedback Data</AlertTitle>
                  <AlertDescription>
                    There is no feedback data available for this document type yet.
                    Feedback is collected when users correct document classifications.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Document ID</TableHead>
                        <TableHead>Original Classification</TableHead>
                        <TableHead>Corrected To</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {feedbackData.map((feedback) => (
                        <TableRow key={feedback.id}>
                          <TableCell className="font-medium">
                            {feedback.documentId.substring(0, 8)}...
                          </TableCell>
                          <TableCell>{feedback.originalType || 'Unknown'}</TableCell>
                          <TableCell>{feedback.correctedType}</TableCell>
                          <TableCell>
                            <Badge variant={feedback.trained ? "secondary" : "outline"}>
                              {feedback.trained ? 'Trained' : 'Pending'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {new Date(feedback.timestamp).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
} 