import { useCallback, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Deployment } from 'kubernetes-types/apps/v1'
import { Link, useNavigate } from 'react-router-dom'
import { IconReload } from '@tabler/icons-react'

import { getDeploymentStatus } from '@/lib/k8s'
import { formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DeploymentStatusIcon } from '@/components/deployment-status-icon'
import { DeploymentCreateDialog } from '@/components/editors/deployment-create-dialog'
import { DeploymentRestartDialog, DeploymentRestartProgress } from '@/components/deployment-restart-dialog'
import { DeploymentScaleDialog } from '@/components/deployment-scale-dialog'
import { ResourceTable } from '@/components/resource-table'
import { scaleRestartDeploymentsBatch, scaleDeployment, useResources, restartDeployment } from '@/lib/api'
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export function DeploymentListPage() {
  const navigate = useNavigate()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isRestartDialogOpen, setIsRestartDialogOpen] = useState(false)
  const [deploymentsToRestart, setDeploymentsToRestart] = useState<Deployment[]>([])
  const [isScaleDialogOpen, setIsScaleDialogOpen] = useState(false)
  const [deploymentsToScale, setDeploymentsToScale] = useState<Deployment[]>([])

  // Get namespace from localStorage for initial state
  const [selectedNamespace] = useState<string | undefined>(() => {
    const stored = localStorage.getItem('selectedNamespace')
    return stored || 'default'
  })

  // Get refetch function from useResources hook
  const { refetch } = useResources('deployments', selectedNamespace, {
    refreshInterval: 5000,
  })

  // Define column helper outside of any hooks
  const columnHelper = createColumnHelper<Deployment>()

  // Define columns for the deployment table
  const columns = useMemo(
    () => [
      columnHelper.accessor('metadata.name', {
        header: 'Name',
        cell: ({ row }) => (
          <div className="font-medium text-blue-500 hover:underline">
            <Link
              to={`/deployments/${row.original.metadata!.namespace}/${
                row.original.metadata!.name
              }`}
            >
              {row.original.metadata!.name}
            </Link>
          </div>
        ),
      }),
      columnHelper.accessor((row) => row.status, {
        id: 'ready',
        header: 'Ready',
        cell: ({ row }) => {
          const status = row.original.status
          const ready = status?.readyReplicas || 0
          const desired = status?.replicas || 0
          
          return (
            <div>
              {ready} / {desired}
            </div>
          )
        },
      }),
      columnHelper.accessor('status.conditions', {
        header: 'Status',
        cell: ({ row }) => {
          const deployment = row.original
          const status = getDeploymentStatus(deployment)
          
          const handleRestartDeployment = async () => {
            if (!deployment.metadata?.namespace || !deployment.metadata?.name) return
            
            // Show confirmation dialog for single deployment too
            setDeploymentsToRestart([deployment])
            setIsRestartDialogOpen(true)
          }
          
          const handleScaleDeployment = () => {
            setDeploymentsToScale([deployment])
            setIsScaleDialogOpen(true)
          }
          
          return (
            <div className="flex items-center justify-center gap-2">
              {/* Scale Button */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleScaleDeployment}
                      className="h-7 px-2 hover:bg-blue-100 hover:text-blue-700 text-xs font-mono"
                    >
                      {deployment.spec?.replicas || 0}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs font-medium text-slate-700">调整副本数</div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              {/* Rolling Restart Button */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRestartDeployment}
                      className="h-7 w-7 p-0 hover:bg-orange-100 hover:text-orange-700"
                    >
                      <IconReload className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs font-medium text-slate-700">滚动重启Deployment</div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              {/* Status Badge */}
              <Badge variant="outline" className="text-muted-foreground px-1.5">
                <DeploymentStatusIcon status={status} />
                {status}
              </Badge>
            </div>
          )
        },
      }),
      columnHelper.accessor('metadata.creationTimestamp', {
        header: 'Created',
        cell: ({ getValue }) => {
          const dateStr = formatDate(getValue() || '')

          return (
            <span className="text-muted-foreground text-sm">{dateStr}</span>
          )
        },
      }),
    ],
    [columnHelper]
  )

  // Custom filter for deployment search
  const deploymentSearchFilter = useCallback(
    (deployment: Deployment, query: string) => {
      return (
        deployment.metadata!.name!.toLowerCase().includes(query) ||
        (deployment.metadata!.namespace?.toLowerCase() || '').includes(query)
      )
    },
    []
  )

  const handleCreateClick = () => {
    setIsCreateDialogOpen(true)
  }

  const handleCreateSuccess = (deployment: Deployment, namespace: string) => {
    // Navigate to the newly created deployment's detail page
    navigate(`/deployments/${namespace}/${deployment.metadata?.name}`)
  }

  // Handle batch actions
  const handleBatchAction = useCallback(async (selectedDeployments: Deployment[], action: string) => {
    console.log('Deployment handleBatchAction called:', action, 'selectedDeployments:', selectedDeployments.length)
    if (action === 'restart') {
      // Show confirmation dialog
      console.log('Setting deployments to restart:', selectedDeployments.map(d => d.metadata?.name))
      setDeploymentsToRestart(selectedDeployments)
      setIsRestartDialogOpen(true)
    } else if (action === 'scale') {
      // Show scale dialog
      console.log('Setting deployments to scale:', selectedDeployments.map(d => d.metadata?.name))
      setDeploymentsToScale(selectedDeployments)
      setIsScaleDialogOpen(true)
    }
  }, [])

  // Handle restart confirmation
  const handleRestartConfirm = useCallback(async (
    action: 'restart' | 'scale-restart',
    options?: { finalReplicas?: number },
    onProgress?: (progress: DeploymentRestartProgress[]) => void
  ) => {
    try {
      if (action === 'restart') {
        // Normal restart - process one by one for progress tracking
        const deploymentList = deploymentsToRestart.map(deployment => ({
          namespace: deployment.metadata!.namespace!,
          name: deployment.metadata!.name!,
          deployment
        }))
        
        // Initialize progress
        let progress: DeploymentRestartProgress[] = deploymentList.map(({ deployment }) => ({
          deployment,
          status: 'pending'
        }))
        
        if (onProgress) {
          onProgress([...progress])
        }
        
        // Process each deployment sequentially
        for (let i = 0; i < deploymentList.length; i++) {
          const { namespace, name, deployment } = deploymentList[i]
          
          try {
            // Update to processing
            progress[i] = { deployment, status: 'processing' }
            if (onProgress) {
              onProgress([...progress])
            }
            
            // Restart the deployment
            await restartDeployment(namespace, name)
            
            // Update to completed
            progress[i] = { deployment, status: 'completed' }
            if (onProgress) {
              onProgress([...progress])
            }
            
            console.log(`Deployment ${name} restart triggered successfully`)
          } catch (error) {
            // Update to error
            progress[i] = { 
              deployment, 
              status: 'error', 
              error: error instanceof Error ? error.message : 'Unknown error'
            }
            if (onProgress) {
              onProgress([...progress])
            }
            console.error(`Failed to restart deployment ${name}:`, error)
          }
        }
        
        console.log(`Individual restart operation completed for ${deploymentList.length} deployments`)
      } else if (action === 'scale-restart') {
        // Use the new scale-restart batch API (no progress tracking for batch operations)
        const deploymentList = deploymentsToRestart.map(deployment => ({
          namespace: deployment.metadata!.namespace!,
          name: deployment.metadata!.name!
        }))
        
        await scaleRestartDeploymentsBatch(deploymentList, options?.finalReplicas)
        console.log(`Scale-restart operation completed for ${deploymentList.length} deployments`)
      }
      
      // Refresh the data using React Query instead of page reload
      refetch()
    } catch (error) {
      console.error('Failed to restart deployments:', error)
      throw error
    }
  }, [deploymentsToRestart, refetch])

  // Handle scale confirmation
  const handleScaleConfirm = useCallback(async (scaleRequests: Array<{ deployment: Deployment; replicas: number }>) => {
    try {
      console.log(`Scaling ${scaleRequests.length} deployments with individual replica counts`)
      
      // Scale each deployment sequentially to avoid overwhelming the API
      for (const { deployment, replicas } of scaleRequests) {
        if (deployment.metadata?.namespace && deployment.metadata?.name) {
          await scaleDeployment(
            deployment.metadata.namespace,
            deployment.metadata.name,
            replicas
          )
          console.log(`Scaled ${deployment.metadata.name} to ${replicas} replicas`)
        }
      }
      
      // Refresh the data using React Query instead of page reload
      refetch()
    } catch (error) {
      console.error('Failed to scale deployments:', error)
      throw error
    }
  }, [refetch])

  // Define batch actions
  const batchActions = useMemo(() => [
    { label: '批量滚动重启', action: 'restart', variant: 'destructive' as const },
    { label: '批量调整副本数', action: 'scale', variant: 'default' as const }
  ], [])

  return (
    <>
      <ResourceTable
        resourceName="Deployments"
        columns={columns}
        searchQueryFilter={deploymentSearchFilter}
        showCreateButton={true}
        onCreateClick={handleCreateClick}
        enableRowSelection={true}
        onBatchAction={handleBatchAction}
        batchActions={batchActions}
      />

      <DeploymentCreateDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSuccess={handleCreateSuccess}
      />

      <DeploymentRestartDialog
        open={isRestartDialogOpen}
        onOpenChange={setIsRestartDialogOpen}
        deployments={deploymentsToRestart}
        onConfirm={handleRestartConfirm}
      />

      <DeploymentScaleDialog
        open={isScaleDialogOpen}
        onOpenChange={setIsScaleDialogOpen}
        deployments={deploymentsToScale}
        onConfirm={handleScaleConfirm}
      />
    </>
  )
}
