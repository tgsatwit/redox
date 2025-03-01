"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Loader2, RefreshCw, Database, BookOpen, Brain } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

interface FeedbackStats {
  total: number
  trained: number
  untrained: number
  byDocumentType: Record<string, {
    total: number
    trained: number
    untrained: number
    bySubType: Record<string, {
      total: number
      trained: number
      untrained: number
    }>
  }>
}

interface ClassificationFeedbackStatsProps {
  documentType?: string;
  onTrainClick?: (documentType: string, count: number) => Promise<any>;
}

export function ClassificationFeedbackStats({ 
  documentType,
  onTrainClick
}: ClassificationFeedbackStatsProps = {}) {
  const [isLoading, setIsLoading] = useState(false)
  const [stats, setStats] = useState<FeedbackStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isTraining, setIsTraining] = useState(false)
  const { toast } = useToast()

  // Fetch feedback stats when the component mounts
  useEffect(() => {
    fetchFeedbackStats()
  }, [])

  const fetchFeedbackStats = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/classification-feedback/stats")
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to fetch feedback statistics")
      }
      
      const data = await response.json()
      setStats(data)
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unknown error")
      toast({
        title: "Error fetching statistics",
        description: error instanceof Error ? error.message : "Could not load feedback statistics",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleTrainClick = async (docType: string, subType?: string) => {
    if (!stats) return;
    
    // Use the passed documentType if specified, otherwise use the docType parameter
    const typeToUse = documentType || docType;
    
    // Determine how many untrained items we have
    const untrainedCount = subType 
      ? stats.byDocumentType[typeToUse]?.bySubType[subType]?.untrained || 0
      : stats.byDocumentType[typeToUse]?.untrained || 0;
    
    if (untrainedCount === 0) {
      toast({
        title: "No data to train",
        description: "There are no untrained feedback items for this document type.",
        variant: "default"
      });
      return;
    }

    setIsTraining(true);
    
    try {
      // If we have an external onTrainClick handler, use it
      if (onTrainClick) {
        await onTrainClick(typeToUse, untrainedCount);
        toast({
          title: "Training initiated",
          description: `Training started with ${untrainedCount} feedback items for ${typeToUse}${subType ? ` (${subType})` : ''}.`,
          variant: "default"
        });
      } else {
        // Otherwise use the default implementation
        const response = await fetch("/api/train-with-feedback", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            documentType: typeToUse,
            documentSubType: subType,
            count: untrainedCount
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Training failed");
        }

        const data = await response.json();
        
        toast({
          title: "Training initiated",
          description: `Training started with ${data.processedCount} feedback items for ${typeToUse}${subType ? ` (${subType})` : ''}.`,
          variant: "default"
        });
      }
      
      // Refresh stats after successful training
      fetchFeedbackStats();
    } catch (error) {
      toast({
        title: "Training failed",
        description: error instanceof Error ? error.message : "Failed to initiate training",
        variant: "destructive"
      });
    } finally {
      setIsTraining(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardDescription>Statistics on document classification feedback</CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="icon" 
            onClick={fetchFeedbackStats} 
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        {error ? (
          <div className="text-center p-4 text-destructive">
            <p>{error}</p>
          </div>
        ) : !stats ? (
          <div className="text-center p-4 text-muted-foreground">
            {isLoading ? "Loading statistics..." : "No feedback data available"}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Total feedback items:</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Untrained items:</p>
                <p className="text-2xl font-bold">{stats.untrained}</p>
              </div>
            </div>
            
            {stats.untrained > 0 && (
              <Accordion type="single" collapsible className="w-full">
                {Object.entries(stats.byDocumentType)
                  // Filter by the provided document type if specified
                  .filter(([docType, _]) => documentType ? docType === documentType : true)
                  .filter(([_, docStats]) => docStats.untrained > 0)
                  .map(([docType, docStats]) => (
                    <AccordionItem key={docType} value={docType}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center justify-between w-full pr-4">
                          <span>{docType}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{docStats.untrained} untrained</Badge>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation() // Prevent accordion from toggling
                                handleTrainClick(docType)
                              }}
                              disabled={isTraining || docStats.untrained === 0}
                            >
                              <Brain className="w-4 h-4 mr-2" />
                              Train
                            </Button>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="ml-4 space-y-2">
                          {Object.entries(docStats.bySubType)
                            .filter(([_, subTypeStats]) => subTypeStats.untrained > 0)
                            .map(([subType, subTypeStats]) => (
                              <div key={subType} className="flex items-center justify-between border-b pb-2">
                                <span className="text-sm">{subType}</span>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">{subTypeStats.untrained} untrained</Badge>
                                  <Button 
                                    size="sm" 
                                    variant="ghost"
                                    onClick={() => handleTrainClick(docType, subType)}
                                    disabled={isTraining || subTypeStats.untrained === 0}
                                  >
                                    <Brain className="w-3 h-3 mr-1" />
                                    Train
                                  </Button>
                                </div>
                              </div>
                            ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
              </Accordion>
            )}
          </div>
        )}
      </CardContent>
      
      <CardFooter className="flex justify-between">
        <p className="text-xs text-muted-foreground">
          {stats ? `Last updated: ${new Date().toLocaleTimeString()}` : ""}
        </p>
        {stats && stats.untrained > 0 && (
          <Button 
            variant="default" 
            onClick={() => handleTrainClick("all")}
            disabled={isTraining}
          >
            <Brain className="w-4 h-4 mr-2" />
            Train All ({stats.untrained})
          </Button>
        )}
      </CardFooter>
    </Card>
  )
} 