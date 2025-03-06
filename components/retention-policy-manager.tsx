"use client"

import { useState, useEffect } from "react"
import { useConfigStoreDB } from "@/lib/config-store-db"
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
  // Get the full store with all methods
  const { 
    config, 
    initialize, 
    // Add methods we need for operating on retention policies
    addRetentionPolicy,
    updateRetentionPolicy,
    deleteRetentionPolicy
  } = useConfigStoreDB();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<RetentionPolicy | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    durationYears: 1 // Default to 1 year
  });

  // Initialize policies from config
  useEffect(() => {
    if (config.retentionPolicies) {
      setPolicies(config.retentionPolicies);
    }
  }, [config.retentionPolicies]);

  // Initial data load if needed
  useEffect(() => {
    console.log("Component mounted, refreshing data if needed...");
    if (!config.retentionPolicies || config.retentionPolicies.length === 0) {
      console.log("No policies in store, initializing...");
      initialize();
    }
  }, [initialize, config.retentionPolicies]);

  const handleSubmit = async (e: React.FormEvent) => {
    console.log("Form submission started");
    e.preventDefault();
    
    if (!formData.name || !formData.description || !formData.durationYears) {
      console.log("Validation failed:", { formData });
      toast({
        title: "Validation Error",
        description: "Please fill in all fields",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      // Convert years to days for storage
      const duration = yearsToDays(formData.durationYears);
      
      console.log('Policy operation starting:', editingPolicy ? 'UPDATE' : 'CREATE');
      
      if (editingPolicy) {
        // Update existing policy using store method
        console.log('Updating policy:', editingPolicy.id, { ...formData, duration });
        await updateRetentionPolicy(editingPolicy.id, { 
          name: formData.name,
          description: formData.description,
          duration
        });
        
        toast({
          title: "Success",
          description: "Retention policy updated successfully"
        });
      } else {
        // Create new policy using store method
        console.log('Creating new policy:', { ...formData, duration });
        await addRetentionPolicy({ 
          name: formData.name,
          description: formData.description,
          duration
        });
        
        toast({
          title: "Success",
          description: "Retention policy added successfully"
        });
      }
      
      // The store will update automatically, so we just need to wait a bit
      await initialize(); // Refresh the store data
    } catch (error) {
      console.error('Error saving retention policy:', error);
      toast({
        title: "Error",
        description: `Failed to save retention policy: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    } finally {
      setIsLoading(false);
      setIsDialogOpen(false);
      setEditingPolicy(null);
      setFormData({
        name: "",
        description: "",
        durationYears: 1
      });
    }
  };

  const handleEdit = (policy: RetentionPolicy) => {
    console.log("Editing policy:", policy);
    setEditingPolicy(policy);
    setFormData({
      name: policy.name,
      description: policy.description,
      durationYears: daysToYears(policy.duration)
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this retention policy?")) {
      return;
    }

    setIsLoading(true);
    try {
      console.log('Deleting policy:', id);
      await deleteRetentionPolicy(id);
      
      toast({
        title: "Success",
        description: "Retention policy deleted successfully"
      });
      
      // Refresh the store data
      await initialize();
    } catch (error) {
      console.error('Error deleting retention policy:', error);
      toast({
        title: "Error",
        description: `Failed to delete retention policy: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Retention Policies</CardTitle>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={isLoading} onClick={() => {
                console.log("Add Policy button clicked");
                setEditingPolicy(null);
                setFormData({
                  name: "",
                  description: "",
                  durationYears: 1
                });
              }}>
                <Plus className="mr-2 h-4 w-4" />
                Add Policy
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={(e) => {
                console.log("Form submitted via onSubmit");
                handleSubmit(e);
              }}>
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
                      onChange={(e) => {
                        console.log("Name changed:", e.target.value);
                        setFormData({ ...formData, name: e.target.value });
                      }}
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
                  <Button 
                    type="submit" 
                    disabled={isLoading}
                    onClick={(e) => {
                      console.log("Submit button clicked");
                      // The actual submission is handled by the form's onSubmit
                    }}
                  >
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
              {policies?.map((policy) => (
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
              {(!policies || policies.length === 0) && (
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
  );
} 