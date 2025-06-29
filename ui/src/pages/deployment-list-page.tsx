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
import { ResourceTable } from '@/components/resource-table'
import { restartDeployment, restartDeploymentsBatch } from '@/lib/api'
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export function DeploymentListPage() {
  const navigate = useNavigate()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)

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
            
            try {
              await restartDeployment(deployment.metadata.namespace, deployment.metadata.name)
              console.log(`Deployment ${deployment.metadata.name} rolling restart triggered successfully`)
              // Reload the page to show updated status
              window.location.reload()
            } catch (error) {
              console.error('Failed to restart deployment:', error)
            }
          }
          
          return (
            <div className="flex items-center gap-2">
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
    if (action === 'restart') {
      try {
        const deploymentList = selectedDeployments.map(deployment => ({
          namespace: deployment.metadata!.namespace!,
          name: deployment.metadata!.name!
        }))
        
        await restartDeploymentsBatch(deploymentList)
        console.log(`Batch rolling restart triggered for ${deploymentList.length} deployments`)
        // Reload the page to show updated status
        window.location.reload()
      } catch (error) {
        console.error('Failed to restart deployments batch:', error)
      }
    }
  }, [])

  // Define batch actions
  const batchActions = useMemo(() => [
    { label: '批量滚动重启', action: 'restart', variant: 'destructive' as const }
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
    </>
  )
}
