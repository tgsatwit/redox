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
import { Pencil, Trash2, Plus } from "lucide-react"

// Helper function to convert days to years (rounded to 2 decimal places)
const daysToYears = (days: number) => Number((days / 365).toFixed(2))

// Helper function to convert years to days
const yearsToDays = (years: number) => Math.round(years * 365)

export function RetentionPolicyManager() {
  const { config, addRetentionPolicy, updateRetentionPolicy, deleteRetentionPolicy } = useConfigStore()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingPolicy, setEditingPolicy] = useState<RetentionPolicy | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    durationYears: 1 // Default to 1 year
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name || !formData.description || !formData.durationYears) {
      toast({
        title: "Validation Error",
        description: "Please fill in all fields",
        variant: "destructive"
      })
      return
    }

    // Convert years to days for storage
    const duration = yearsToDays(formData.durationYears)

    if (editingPolicy) {
      updateRetentionPolicy(editingPolicy.id, { ...formData, duration })
      toast({
        title: "Success",
        description: "Retention policy updated successfully"
      })
    } else {
      addRetentionPolicy({ ...formData, duration })
      toast({
        title: "Success",
        description: "Retention policy added successfully"
      })
    }

    setIsDialogOpen(false)
    setEditingPolicy(null)
    setFormData({
      name: "",
      description: "",
      durationYears: 1
    })
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
    if (window.confirm("Are you sure you want to delete this retention policy?")) {
      deleteRetentionPolicy(id)
      toast({
        title: "Success",
        description: "Retention policy deleted successfully"
      })
    }
  }

  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Retention Policies</CardTitle>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
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
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Describe the purpose and requirements of this retention policy"
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
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit">
                    {editingPolicy ? "Update Policy" : "Add Policy"}
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
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(policy.id)}
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