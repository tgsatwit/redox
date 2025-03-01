"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Loader2, RefreshCw, Database, BookOpen } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

interface FeedbackStats {
  totalItems: number
  untrained: number
  trained: number
  byDocumentType: Record<string, { 
    total: number
    untrained: number
    trained: number 
  }>
}

interface ClassificationFeedbackStatsProps {
  documentType: string
  onTrainClick?: (documentType: string, count: number) => Promise<void>
}

export function ClassificationFeedbackStats({ 
  documentType,
  onTrainClick
}: ClassificationFeedbackStatsProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [stats, setStats] = useState<FeedbackStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isTraining, setIsTraining] = useState(false)
  const { toast } = useToast()

  const fetchFeedbackStats = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/classification-feedback/stats')
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `HTTP error ${response.status}`)
      }
      
      const data = await response.json()
      setStats(data.stats)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feedback statistics')
      console.error('Error fetching feedback stats:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchFeedbackStats()
  }, [])

  const handleTrainClick = async () => {
    if (!stats || !documentType || !onTrainClick) return
    
    // Get count of untrained items for this document type
    const docStats = stats.byDocumentType[documentType]
    
    if (!docStats || docStats.untrained === 0) {
      toast({
        title: "No items to train",
        description: "There are no untrained feedback items for this document type.",
        variant: "destructive"
      })
      return
    }
    
    setIsTraining(true)
    
    try {
      await onTrainClick(documentType, docStats.untrained)
      
      // Refresh stats after training
      await fetchFeedbackStats()
      
      toast({
        title: "Training initiated",
        description: `Started training for ${documentType} with ${docStats.untrained} feedback items.`,
      })
    } catch (err) {
      toast({
        title: "Training failed",
        description: err instanceof Error ? err.message : 'Failed to start training process',
        variant: "destructive"
      })
    } finally {
      setIsTraining(false)
    }
  }

  // Get stats for the specific document type
  const docTypeStats = stats?.byDocumentType[documentType]
  
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Database className="h-4 w-4" />
          Classification Feedback
        </CardTitle>
        <CardDescription>
          Feedback data collected for this document type
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        {isLoading ? (
          <div className="py-6 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <Alert variant="destructive" className="mt-2">
            <AlertTitle>Error loading feedback data</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-muted/40 rounded p-3 text-center">
                <div className="text-2xl font-bold">
                  {docTypeStats?.total || 0}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Total Feedback Items
                </div>
              </div>
              
              <div className="bg-muted/40 rounded p-3 text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {docTypeStats?.untrained || 0}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Untrained Items
                </div>
              </div>
            </div>
            
            {docTypeStats?.untrained ? (
              <div className="mt-4">
                <Button 
                  onClick={handleTrainClick} 
                  disabled={isTraining || docTypeStats.untrained === 0}
                  className="w-full"
                >
                  {isTraining ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Initiating Training...
                    </>
                  ) : (
                    <>
                      <BookOpen className="mr-2 h-4 w-4" />
                      Train Model with {docTypeStats.untrained} Items
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="bg-muted/30 rounded-md p-3 text-sm text-center mt-2">
                <p>No untrained feedback items available.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Feedback will be collected when users correct classification results.
                </p>
              </div>
            )}
            
            <div className="mt-4 flex justify-end">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={fetchFeedbackStats}
                disabled={isLoading}
                className="text-xs"
              >
                <RefreshCw className={`mr-1 h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
} 