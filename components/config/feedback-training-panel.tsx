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
import { Loader2, AlertTriangle, RotateCw, Database } from "lucide-react"
import type { DocumentTypeConfig } from "@/lib/types"
import { useToast } from "@/components/ui/use-toast"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

interface FeedbackTrainingPanelProps {
  documentType: DocumentTypeConfig;
  isLoading: boolean;
}

export function FeedbackTrainingPanel({ 
  documentType, 
  isLoading 
}: FeedbackTrainingPanelProps) {
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
  
  // Load feedback data when document type changes
  useEffect(() => {
    loadFeedbackData()
  }, [documentType.id])
  
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
        <CardTitle>{documentType.name} Feedback & Training</CardTitle>
        <CardDescription>
          View classification feedback and train the model
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
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
      </CardContent>
    </Card>
  )
} 