"use client"

import { useState } from "react"
import { useConfigStore } from "@/lib/config-store"
import { TrainingDataset, TrainingExample } from "@/lib/types"
import { v4 as uuidv4 } from "uuid"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
  AlertCircle, 
  Check, 
  Plus, 
  RefreshCw, 
  AlertTriangle,
  Clock,
  Database,
  ArrowRight
} from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { toast } from "sonner"

export function TrainingDatasetPanel() {
  const { 
    config, 
    activeDocumentTypeId,
    addTrainingDataset,
    updateTrainingDataset,
    updateModelStatus,
    setDefaultModelForDocType
  } = useConfigStore()

  const activeDocType = config.documentTypes.find(dt => dt.id === activeDocumentTypeId)
  
  const [newDatasetOpen, setNewDatasetOpen] = useState(false)
  const [newDatasetName, setNewDatasetName] = useState("")
  const [newDatasetDescription, setNewDatasetDescription] = useState("")
  const [isTraining, setIsTraining] = useState<string | null>(null)
  const [trainingProgress, setTrainingProgress] = useState(0)
  const [trainingError, setTrainingError] = useState<string | null>(null)

  // Get datasets for the active document type
  const activeDatasets = activeDocType?.trainingDatasets || []

  // Create a new training dataset
  const handleCreateDataset = () => {
    if (!activeDocumentTypeId) {
      toast.error("No document type selected")
      return
    }

    if (!newDatasetName.trim()) {
      toast.error("Dataset name cannot be empty")
      return
    }

    addTrainingDataset(activeDocumentTypeId, {
      name: newDatasetName,
      description: newDatasetDescription,
      documentTypeId: activeDocumentTypeId,
      examples: [],
    })
    
    setNewDatasetName("")
    setNewDatasetDescription("")
    setNewDatasetOpen(false)
    toast.success("New training dataset created")
  }

  // Format date for display
  const formatDate = (timestamp?: number) => {
    if (!timestamp) return "Never"
    
    const date = new Date(timestamp)
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date)
  }

  // Handle training a model
  const handleTrainModel = async (datasetId: string) => {
    if (!activeDocumentTypeId) return
    
    const dataset = activeDocType?.trainingDatasets?.find(d => d.id === datasetId)
    if (!dataset) {
      toast.error("Dataset not found")
      return
    }

    // Check if there are enough approved examples
    const approvedExamples = dataset.examples.filter(ex => ex.status === 'approved')
    if (approvedExamples.length < 5) {
      toast.error("At least 5 approved examples are required for training")
      return
    }

    setIsTraining(datasetId)
    setTrainingProgress(0)
    setTrainingError(null)

    try {
      // Update dataset status to TRAINING
      updateModelStatus(activeDocumentTypeId, datasetId, 'TRAINING')
      
      // Simulate training progress
      const simulateProgress = () => {
        const interval = setInterval(() => {
          setTrainingProgress(prev => {
            const newProgress = prev + Math.random() * 10
            if (newProgress >= 100) {
              clearInterval(interval)
              
              // Simulate success (90% chance) or error (10% chance)
              if (Math.random() > 0.1) {
                // Success
                const mockModelId = `model-${Math.random().toString(36).substring(2, 10)}`
                const mockArn = `arn:aws:comprehend:us-east-1:123456789012:document-classifier/${mockModelId}`
                
                updateModelStatus(activeDocumentTypeId, datasetId, 'TRAINED', mockModelId, mockArn)
                
                toast.success("Model training completed successfully")
                setIsTraining(null)
              } else {
                // Error
                setTrainingError("Training failed: AWS Comprehend error occurred")
                updateModelStatus(activeDocumentTypeId, datasetId, 'FAILED')
                toast.error("Model training failed")
                setTimeout(() => setIsTraining(null), 1000)
              }
              
              return 100
            }
            return newProgress
          })
        }, 300)
      }

      // In a real implementation, this would be an API call to start training
      toast.info("Starting model training - this may take several minutes")
      
      // Start progress simulation
      simulateProgress()
      
    } catch (error) {
      setTrainingError("An unexpected error occurred")
      setIsTraining(null)
      updateModelStatus(activeDocumentTypeId, datasetId, 'FAILED')
      toast.error("Failed to start model training")
    }
  }

  // Set a model as active
  const handleSetActiveModel = (datasetId: string) => {
    if (!activeDocumentTypeId) return
    
    const dataset = activeDocType?.trainingDatasets?.find(d => d.id === datasetId)
    if (!dataset || !dataset.modelId) {
      toast.error("Cannot set as active: No model ID found")
      return
    }

    setDefaultModelForDocType(activeDocumentTypeId, dataset.modelId)
    toast.success(`Set ${dataset.name} as the active model`)
  }

  // Calculate dataset statistics
  const getDatasetStats = (dataset: TrainingDataset) => {
    const examples = dataset.examples || []
    const total = examples.length
    const approved = examples.filter(ex => ex.status === 'approved').length
    
    return { total, approved }
  }

  // Determine training state visual indicators
  const getTrainingState = (dataset: TrainingDataset) => {
    if (isTraining === dataset.id) {
      return {
        icon: <RefreshCw className="h-4 w-4 animate-spin" />,
        label: "Training",
        variant: "outline" as const,
        progress: trainingProgress
      }
    }
    
    switch (dataset.modelStatus) {
      case "TRAINING":
        return {
          icon: <RefreshCw className="h-4 w-4 animate-spin" />,
          label: "Training",
          variant: "outline" as const,
          progress: 50 // Arbitrary progress for display
        }
      case "TRAINED":
        return {
          icon: <Check className="h-4 w-4" />,
          label: "Trained",
          variant: "default" as const,
          progress: null
        }
      case "FAILED":
        return {
          icon: <AlertCircle className="h-4 w-4" />,
          label: "Failed",
          variant: "destructive" as const,
          progress: null
        }
      case "DELETING":
        return {
          icon: <RefreshCw className="h-4 w-4 animate-spin" />,
          label: "Deleting",
          variant: "outline" as const,
          progress: null
        }
      case "IN_ERROR":
        return {
          icon: <AlertCircle className="h-4 w-4" />,
          label: "Error",
          variant: "destructive" as const,
          progress: null
        }
      default:
        return {
          icon: <Clock className="h-4 w-4" />,
          label: "Ready to Train",
          variant: "outline" as const,
          progress: null
        }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Training Datasets</h3>
        <Dialog open={newDatasetOpen} onOpenChange={setNewDatasetOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1">
              <Plus className="h-4 w-4" />
              New Dataset
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Training Dataset</DialogTitle>
              <DialogDescription>
                Create a training dataset for {activeDocType?.name || "this document type"}.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="dataset-name">Dataset Name</Label>
                <Input
                  id="dataset-name"
                  value={newDatasetName}
                  onChange={(e) => setNewDatasetName(e.target.value)}
                  placeholder="e.g. Initial Training Set, Q1 2024 Data"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dataset-description">Description (Optional)</Label>
                <Input
                  id="dataset-description"
                  value={newDatasetDescription}
                  onChange={(e) => setNewDatasetDescription(e.target.value)}
                  placeholder="Brief description of this dataset"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewDatasetOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateDataset}>Create Dataset</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {activeDatasets.length === 0 ? (
        <Card>
          <CardContent className="pt-6 px-6 pb-6 text-center">
            <Database className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">No training datasets available.</p>
            <p className="text-sm text-muted-foreground mb-4">
              Create a new training dataset to start collecting examples for model training.
            </p>
            <Button 
              variant="outline" 
              className="mt-2" 
              onClick={() => setNewDatasetOpen(true)}
            >
              Create Training Dataset
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {activeDatasets.map((dataset) => {
            const stats = getDatasetStats(dataset)
            const trainingState = getTrainingState(dataset)
            const isActive = activeDocType?.defaultModelId === dataset.modelId
            
            return (
              <Card key={dataset.id} className={isActive ? "border-primary" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        {dataset.name}
                        {isActive && (
                          <Badge variant="default" className="ml-2">Active Model</Badge>
                        )}
                      </CardTitle>
                      <CardDescription>
                        {dataset.description || `Created: ${formatDate(dataset.lastTrainedDate)}`}
                      </CardDescription>
                    </div>
                    <Badge variant={trainingState.variant} className="flex items-center gap-1">
                      {trainingState.icon}
                      <span>{trainingState.label}</span>
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {trainingState.progress !== null && (
                    <div className="mb-4">
                      <Progress value={trainingState.progress} className="h-2" />
                      <p className="text-xs text-muted-foreground mt-1">
                        Training in progress ({Math.round(trainingState.progress)}%)
                      </p>
                    </div>
                  )}
                  
                  {trainingError && dataset.id === isTraining && (
                    <div className="mb-4 p-2 bg-destructive/10 border border-destructive/20 rounded-md text-sm text-destructive">
                      <AlertCircle className="h-4 w-4 inline-block mr-1" />
                      {trainingError}
                    </div>
                  )}
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Examples</p>
                      <p className="font-medium">
                        <span>{stats.approved}</span>
                        <span className="text-muted-foreground"> approved / </span>
                        <span>{stats.total}</span>
                        <span className="text-muted-foreground"> total</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Last Trained</p>
                      <p className="font-medium">
                        {formatDate(dataset.lastTrainedDate)}
                      </p>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTrainModel(dataset.id)}
                    disabled={isTraining !== null || stats.approved < 5}
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Train Model
                  </Button>
                  
                  {dataset.modelStatus === "TRAINED" && dataset.modelId && !isActive && (
                    <Button
                      size="sm"
                      onClick={() => handleSetActiveModel(dataset.id)}
                    >
                      <ArrowRight className="h-4 w-4 mr-1" />
                      Set as Active
                    </Button>
                  )}
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
} 