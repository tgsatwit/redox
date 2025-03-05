"use client"

import { useState } from "react"
import { useConfigStoreDB } from "@/lib/config-store-db"
import { Prompt, PromptCategory, PromptRole } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { toast } from "@/components/ui/use-toast"
import { Plus, Pencil, Trash2, Save, ChevronRight, ChevronDown } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"

export function PromptsConfigManager() {
  const { config, addPromptCategory, updatePromptCategory, deletePromptCategory, addPrompt, updatePrompt, deletePrompt } = useConfigStoreDB()
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null)
  const [isAddingCategory, setIsAddingCategory] = useState(false)
  const [isAddingPrompt, setIsAddingPrompt] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [activeTab, setActiveTab] = useState("prompts")

  const [categoryForm, setCategoryForm] = useState({
    name: "",
    description: ""
  })

  const [promptForm, setPromptForm] = useState({
    name: "",
    description: "",
    role: "system" as PromptRole,
    content: "",
    isActive: true,
    category: ""
  })

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await addPromptCategory(categoryForm)
      toast({
        title: "Success",
        description: "Category added successfully"
      })
      setIsAddingCategory(false)
      setCategoryForm({ name: "", description: "" })
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add category",
        variant: "destructive"
      })
    }
  }

  const handleAddPrompt = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCategory) return

    try {
      await addPrompt(selectedCategory, promptForm)
      toast({
        title: "Success",
        description: "Prompt added successfully"
      })
      setIsAddingPrompt(false)
      setPromptForm({
        name: "",
        description: "",
        role: "system",
        content: "",
        isActive: true,
        category: ""
      })
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add prompt",
        variant: "destructive"
      })
    }
  }

  const handleEditPrompt = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCategory || !selectedPrompt) return

    try {
      await updatePrompt(selectedCategory, selectedPrompt, promptForm)
      toast({
        title: "Success",
        description: "Prompt updated successfully"
      })
      setIsEditing(false)
      setSelectedPrompt(null)
      setPromptForm({
        name: "",
        description: "",
        role: "system",
        content: "",
        isActive: true,
        category: ""
      })
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update prompt",
        variant: "destructive"
      })
    }
  }

  const handleDeletePrompt = async (promptId: string) => {
    if (!selectedCategory || !window.confirm("Are you sure you want to delete this prompt?")) return

    try {
      await deletePrompt(selectedCategory, promptId)
      toast({
        title: "Success",
        description: "Prompt deleted successfully"
      })
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete prompt",
        variant: "destructive"
      })
    }
  }

  const activeCategory = selectedCategory 
    ? config.promptCategories?.find(cat => cat.id === selectedCategory)
    : null

  const activePrompt = selectedPrompt && activeCategory
    ? activeCategory.prompts.find(p => p.id === selectedPrompt)
    : null

  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader>
          <CardTitle>Prompts Configuration</CardTitle>
          <CardDescription>
            Manage prompt categories and their associated prompts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            {/* Categories Panel */}
            <div className="w-full md:w-1/4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-base">Categories</CardTitle>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setIsAddingCategory(true)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[calc(100vh-20rem)]">
                    <div className="space-y-2">
                      {config.promptCategories?.map((category) => (
                        <Button
                          key={category.id}
                          variant={selectedCategory === category.id ? "default" : "ghost"}
                          className="w-full justify-start"
                          onClick={() => setSelectedCategory(category.id)}
                        >
                          <span className="truncate">{category.name}</span>
                          <Badge variant="secondary" className="ml-2">
                            {category.prompts.length}
                          </Badge>
                        </Button>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            {/* Prompts Panel */}
            <div className="w-full md:w-3/4">
              {selectedCategory ? (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div>
                      <CardTitle>{activeCategory?.name}</CardTitle>
                      <CardDescription>{activeCategory?.description}</CardDescription>
                    </div>
                    <div className="flex space-x-2">
                      <Button onClick={() => setIsAddingPrompt(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Prompt
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="prompts">Prompts</TabsTrigger>
                        <TabsTrigger value="settings">Settings</TabsTrigger>
                      </TabsList>

                      <TabsContent value="prompts" className="space-y-4">
                        {activeCategory?.prompts.map((prompt) => (
                          <Card key={prompt.id}>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                              <div>
                                <CardTitle className="text-base">{prompt.name}</CardTitle>
                                <CardDescription>{prompt.description}</CardDescription>
                              </div>
                              <div className="flex space-x-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setSelectedPrompt(prompt.id)
                                    setPromptForm({
                                      name: prompt.name,
                                      description: prompt.description,
                                      role: prompt.role,
                                      content: prompt.content,
                                      isActive: prompt.isActive,
                                      category: prompt.category
                                    })
                                    setIsEditing(true)
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeletePrompt(prompt.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <div className="space-y-2">
                                <div className="flex items-center space-x-2">
                                  <Badge variant="secondary">{prompt.role}</Badge>
                                  <Badge variant={prompt.isActive ? "default" : "secondary"}>
                                    {prompt.isActive ? "Active" : "Inactive"}
                                  </Badge>
                                </div>
                                <div className="mt-2">
                                  <pre className="whitespace-pre-wrap text-sm text-muted-foreground bg-muted p-4 rounded-md">
                                    {prompt.content}
                                  </pre>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </TabsContent>

                      <TabsContent value="settings">
                        <Card>
                          <CardHeader>
                            <CardTitle>Category Settings</CardTitle>
                            <CardDescription>
                              Manage settings for this prompt category
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-4">
                              <div className="space-y-2">
                                <Label>Category Name</Label>
                                <Input value={activeCategory?.name} disabled />
                              </div>
                              <div className="space-y-2">
                                <Label>Description</Label>
                                <Textarea value={activeCategory?.description} disabled />
                              </div>
                              <div className="space-y-2">
                                <Label>Statistics</Label>
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-1">
                                    <p className="text-sm font-medium">Total Prompts</p>
                                    <p className="text-2xl font-bold">{activeCategory?.prompts.length}</p>
                                  </div>
                                  <div className="space-y-1">
                                    <p className="text-sm font-medium">Active Prompts</p>
                                    <p className="text-2xl font-bold">
                                      {activeCategory?.prompts.filter(p => p.isActive).length}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              ) : (
                <div className="flex h-[calc(100vh-20rem)] items-center justify-center">
                  <p className="text-muted-foreground">Select a category to view prompts</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add Category Dialog */}
      <Dialog open={isAddingCategory} onOpenChange={setIsAddingCategory}>
        <DialogContent>
          <form onSubmit={handleAddCategory}>
            <DialogHeader>
              <DialogTitle>Add Category</DialogTitle>
              <DialogDescription>
                Create a new category for organizing prompts
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit">Add Category</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Prompt Dialog */}
      <Dialog open={isAddingPrompt || isEditing} onOpenChange={(open) => {
        if (!open) {
          setIsAddingPrompt(false)
          setIsEditing(false)
          setPromptForm({
            name: "",
            description: "",
            role: "system",
            content: "",
            isActive: true,
            category: ""
          })
        }
      }}>
        <DialogContent>
          <form onSubmit={isEditing ? handleEditPrompt : handleAddPrompt}>
            <DialogHeader>
              <DialogTitle>{isEditing ? "Edit Prompt" : "Add Prompt"}</DialogTitle>
              <DialogDescription>
                {isEditing ? "Modify an existing prompt" : "Create a new prompt"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={promptForm.name}
                  onChange={(e) => setPromptForm({ ...promptForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={promptForm.description}
                  onChange={(e) => setPromptForm({ ...promptForm, description: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select
                  value={promptForm.role}
                  onValueChange={(value: PromptRole) => setPromptForm({ ...promptForm, role: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">System</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="assistant">Assistant</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="content">Content</Label>
                <Textarea
                  id="content"
                  value={promptForm.content}
                  onChange={(e) => setPromptForm({ ...promptForm, content: e.target.value })}
                  className="min-h-[200px] font-mono"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit">
                {isEditing ? "Save Changes" : "Add Prompt"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
} 