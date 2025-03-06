"use client"

import { useState } from "react"
import { useConfigStore } from "@/lib/config-store"
import { RetentionPolicy } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/components/ui/use-toast"
import { Pencil, Trash2, Plus, Loader2 } from "lucide-react"

// Helper function to convert days to years (rounded to 2 decimal places)
const daysToYears = (days: number) => Number((days / 365).toFixed(2))

// Helper function to convert years to days
const yearsToDays = (years: number) => Math.round(years * 365)

export function RetentionPolicyManager() {
  const { config, addRetentionPolicy, updateRetentionPolicy, deleteRetentionPolicy } = useConfigStore()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingPolicy, setEditingPolicy] = useState<RetentionPolicy | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    durationYears: 1 // Default to 1 year
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log("Form submission started")
    
    if (!formData.name || !formData.description || !formData.durationYears) {
      toast({
        title: "Validation Error",
        description: "Please fill in all fields",
        variant: "destructive"
      })
      return
    }

    setIsLoading(true)
    try {
      // Convert years to days for storage
      const duration = yearsToDays(formData.durationYears)
      
      // First update local state via the store
      if (editingPolicy) {
        updateRetentionPolicy(editingPolicy.id, { ...formData, duration })
      } else {
        addRetentionPolicy({ ...formData, duration })
      }
      
      // Then update DynamoDB via API
      const apiData = {
        name: formData.name,
        description: formData.description,
        duration
      }
      
      console.log('Sending data to API:', apiData)
      
      if (editingPolicy) {
        // Update existing policy
        const response = await fetch('/api/retention-policies', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingPolicy.id, ...apiData })
        })
        
        console.log('API response status:', response.status)
        
        if (!response.ok) {
          throw new Error(`Failed to update policy in database: ${response.status}`)
        }
        
        toast({
          title: "Success",
          description: "Retention policy updated successfully in database"
        })
      } else {
        // Create new policy
        const response = await fetch('/api/retention-policies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(apiData)
        })
        
        console.log('API response status:', response.status)
        
        if (!response.ok) {
          throw new Error(`Failed to create policy in database: ${response.status}`)
        }
        
        toast({
          title: "Success",
          description: "Retention policy added successfully to database"
        })
      }
    } catch (error) {
      console.error('Error saving retention policy to database:', error)
      toast({
        title: "Database Error",
        description: error instanceof Error ? error.message : "Failed to save to database",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
      setIsDialogOpen(false)
      setEditingPolicy(null)
      setFormData({
        name: "",
        description: "",
        durationYears: 1
      })
    }
  }

  const handleEdit = (policy: RetentionPolicy) => {
    setEditingPolicy(policy)
    setFormData({
      name: policy.name,
      description: policy.description,
      durationYears: daysToYears(policy.duration)
    })
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this retention policy?")) {
      return
    }
    
    setIsLoading(true)
    try {
      // First update local state
      deleteRetentionPolicy(id)
      
      // Then update DynamoDB via API
      console.log('Deleting policy from database:', id)
      const response = await fetch('/api/retention-policies', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      
      console.log('API response status:', response.status)
      
      if (!response.ok) {
        throw new Error(`Failed to delete policy from database: ${response.status}`)
      }
      
      toast({
        title: "Success",
        description: "Retention policy deleted successfully from database"
      })
    } catch (error) {
      console.error('Error deleting retention policy from database:', error)
      toast({
        title: "Database Error",
        description: error instanceof Error ? error.message : "Failed to delete from database",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Retention Policies</CardTitle>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={isLoading}>
                <Plus className="mr-2 h-4 w-4" />
                Add Policy
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>
                    {editingPolicy ? "Edit Retention Policy" : "Add Retention Policy"}
                  </DialogTitle>
                  <DialogDescription>
                    Configure a retention policy for document storage.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Standard 2-Year Retention"
                      disabled={isLoading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Describe the purpose and requirements of this retention policy"
                      disabled={isLoading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="duration">Duration (years)</Label>
                    <Input
                      id="duration"
                      type="number"
                      step="0.5"
                      min="0.5"
                      value={formData.durationYears}
                      onChange={(e) => setFormData({ ...formData, durationYears: parseFloat(e.target.value) })}
                      placeholder="e.g., 2 for two years"
                      disabled={isLoading}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {editingPolicy ? "Updating..." : "Adding..."}
                      </>
                    ) : (
                      editingPolicy ? "Update Policy" : "Add Policy"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {config.retentionPolicies?.map((policy) => (
                <TableRow key={policy.id}>
                  <TableCell>{policy.name}</TableCell>
                  <TableCell>{policy.description}</TableCell>
                  <TableCell>{daysToYears(policy.duration)} years</TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(policy)}
                        disabled={isLoading}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(policy.id)}
                        disabled={isLoading}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(!config.retentionPolicies || config.retentionPolicies.length === 0) && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No retention policies configured. Click "Add Policy" to create one.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
} 