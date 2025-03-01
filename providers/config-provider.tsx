'use client'

import { PropsWithChildren, createContext, useContext, useEffect, useState } from 'react'
import { useConfigStoreDB } from '@/lib/config-store-db'
import { Loader2, AlertTriangle } from 'lucide-react'

// Create a context for loading status
interface ConfigContextType {
  isLoading: boolean
  error: string | null
  isInitialized: boolean
  useFallbackStorage: boolean
}

const ConfigContext = createContext<ConfigContextType>({
  isLoading: true,
  error: null,
  isInitialized: false,
  useFallbackStorage: false
})

export const useConfigContext = () => useContext(ConfigContext)

export function ConfigProvider({ children }: PropsWithChildren) {
  const { isLoading, error, isInitialized, initialize } = useConfigStoreDB()
  const [initialized, setInitialized] = useState(false)
  const [useFallbackStorage, setUseFallbackStorage] = useState(false)

  // Initialize the configuration store on component mount
  useEffect(() => {
    if (!initialized && !isInitialized) {
      initialize().then(() => {
        setInitialized(true)
      }).catch((err) => {
        // Check if the error is related to DynamoDB permissions
        if (err?.message?.includes('AccessDeniedException') || 
            err?.message?.includes('not authorized to perform')) {
          console.warn('Using local storage fallback due to DynamoDB permission issues');
          setUseFallbackStorage(true);
          setInitialized(true);
        }
      });
    }
  }, [initialize, initialized, isInitialized])

  // Show loading spinner while initializing
  if (isLoading && !isInitialized && !useFallbackStorage) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-xl">Loading configuration...</span>
      </div>
    )
  }

  // Show fallback storage warning instead of error for permission issues
  if (useFallbackStorage) {
    return (
      <div>
        <div className="fixed top-0 left-0 right-0 bg-amber-50 p-2 border-b border-amber-300 flex items-center justify-center z-50">
          <AlertTriangle className="h-5 w-5 text-amber-500 mr-2" />
          <span className="text-sm text-amber-700">
            Using local storage for configuration (DynamoDB permission issue). Your changes will be stored in the browser only.
          </span>
        </div>
        <div className="pt-9">
          <ConfigContext.Provider value={{ isLoading, error, isInitialized, useFallbackStorage }}>
            {children}
          </ConfigContext.Provider>
        </div>
      </div>
    )
  }

  // Show error if initialization failed for reasons other than permissions
  if (error && !isInitialized) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center text-destructive">
        <h1 className="text-2xl font-bold">Configuration Error</h1>
        <p className="mt-2">{error}</p>
        <button
          onClick={() => initialize()}
          className="mt-4 rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <ConfigContext.Provider value={{ isLoading, error, isInitialized, useFallbackStorage }}>
      {children}
    </ConfigContext.Provider>
  )
} 