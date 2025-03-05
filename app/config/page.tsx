'use client'

import { ConfigLayout } from "@/components/config"
import { Button } from "@/components/ui/button"
import { ChevronLeft, Plus } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { useConfigStoreDB } from "@/lib/config-store-db"
import { useConfigContext } from "@/providers/config-provider"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"

export default function ConfigPage() {
  const { resetToDefaults, isLoading: storeIsLoading } = useConfigStoreDB()
  const { isLoading: contextIsLoading } = useConfigContext()
  const isLoading = storeIsLoading || contextIsLoading
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const { toast } = useToast()

  const handleResetToDefaults = async () => {
    try {
      await resetToDefaults()
      setResetConfirmOpen(false)
      toast({
        title: "Success",
        description: "Configuration reset to defaults successfully"
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to reset configuration",
        variant: "destructive"
      })
    }
  }

  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System Configuration</h1>
          <p className="text-muted-foreground">
            Configure document types, retention policies, and automated workflows.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button 
            variant="secondary" 
            onClick={() => setResetConfirmOpen(true)}
            disabled={isLoading}
          >
            Reset to Defaults
          </Button>
          <Link href="/">
            <Button variant="outline" size="sm" className="gap-1">
              <ChevronLeft className="h-4 w-4" />
              Back to Document Processor
            </Button>
          </Link>
        </div>
      </div>
      <ConfigLayout />

      {/* Reset Confirmation Dialog */}
      <Dialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Configuration</DialogTitle>
            <DialogDescription>
              This will reset all document types, data elements, and configurations to their default values.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setResetConfirmOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleResetToDefaults}
              disabled={isLoading}
            >
              Reset to Defaults
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
} 