import { useCallback, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Pod } from 'kubernetes-types/core/v1'
import { Link, useNavigate } from 'react-router-dom'
import { IconServer } from '@tabler/icons-react'

import { formatDate } from '@/lib/utils'
import { PodStatusBadge } from '@/components/pod-status-badge'
import { ResourceTable } from '@/components/resource-table'
import { restartPod, restartPodsBatch, useResources } from '@/lib/api'
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export function PodListPage() {
  // Define column helper outside of any hooks
  const columnHelper = createColumnHelper<Pod>()
  const navigate = useNavigate()
  
  // Get namespace from localStorage for initial state
  const [selectedNamespace, setSelectedNamespace] = useState<string | undefined>(() => {
    const stored = localStorage.getItem('selectedNamespace')
    return stored || 'default'
  })
  
  // Get refetch function from useResources hook
  const { refetch } = useResources('pods', selectedNamespace, {
    refreshInterval: 5000,
  })

  // Define columns for the pod table - moved outside render cycle for better performance
  const columns = useMemo(
    () => [
      columnHelper.accessor('metadata.name', {
        header: 'Name',
        cell: ({ row }) => (
          <div className="font-medium text-blue-500 hover:underline">
            <Link
              to={`/pods/${row.original.metadata!.namespace}/${
                row.original.metadata!.name
              }`}
            >
              {row.original.metadata!.name}
            </Link>
          </div>
        ),
      }),
      columnHelper.accessor((row) => row.status!.containerStatuses, {
        id: 'containers',
        header: 'Ready',
        cell: ({ row }) => {
          const containerStatuses = row.original.status!.containerStatuses || []
          return (
            <div>
              {containerStatuses.filter((s) => s.ready).length} /{' '}
              {containerStatuses.length}
            </div>
          )
        },
      }),
      columnHelper.accessor('status.phase', {
        header: 'Status',
        enableColumnFilter: true,
        meta: { align: 'left' },
        cell: ({ row }) => {
          const pod = row.original
          const handleViewLogs = () => {
            navigate(`/pods/${pod.metadata?.namespace}/${pod.metadata?.name}?tab=logs`)
          }
          
          const handleRestartPod = async () => {
            if (!pod.metadata?.namespace || !pod.metadata?.name) return
            
            try {
              await restartPod(pod.metadata.namespace, pod.metadata.name)
              console.log(`Pod ${pod.metadata.name} restart triggered successfully`)
              // Refresh the data using React Query instead of page reload
              refetch()
            } catch (error) {
              console.error('Failed to restart pod:', error)
            }
          }
          
          return (
            <PodStatusBadge 
              pod={pod}
              showHistoryButton={true}
              showLogsButton={true}
              showRestartButton={true}
              onViewLogs={handleViewLogs}
              onRestartPod={handleRestartPod}
            />
          )
        },
      }),
      columnHelper.accessor('status.podIP', {
        header: 'IP',
        cell: ({ getValue }) => getValue() || '-',
      }),
      columnHelper.accessor('spec.nodeName', {
        header: 'Node',
        enableColumnFilter: true,
        cell: ({ getValue }) => {
          const nodeName = getValue() || '-'
          if (nodeName === '-') return nodeName
          
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    to={`/nodes/${nodeName}`}
                    className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    <IconServer className="w-3 h-3" />
                    {nodeName}
                  </Link>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-xs">
                    <div className="font-medium text-slate-700">节点信息</div>
                    <div className="mt-1 text-slate-600">名称: {nodeName}</div>
                    <div className="text-slate-600">💡 点击查看节点详情</div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
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
    [columnHelper, navigate, refetch]
  )

  // Custom filter for pod search
  const podSearchFilter = useCallback((pod: Pod, query: string) => {
    return (
      pod.metadata!.name!.toLowerCase().includes(query) ||
      (pod.spec!.nodeName?.toLowerCase() || '').includes(query) ||
      (pod.status!.podIP?.toLowerCase() || '').includes(query)
    )
  }, [])

  // Handle batch actions
  const handleBatchAction = useCallback(async (selectedPods: Pod[], action: string) => {
    console.log('Pod handleBatchAction called:', action, 'selectedPods:', selectedPods.length)
    if (action === 'restart') {
      try {
        const podList = selectedPods.map(pod => ({
          namespace: pod.metadata!.namespace!,
          name: pod.metadata!.name!
        }))
        
        console.log('Calling restartPodsBatch with:', podList)
        await restartPodsBatch(podList)
        console.log(`Batch restart triggered for ${podList.length} pods`)
        // Refresh the data using React Query instead of page reload
        refetch()
      } catch (error) {
        console.error('Failed to restart pods batch:', error)
      }
    }
  }, [refetch])

  // Define batch actions
  const batchActions = useMemo(() => [
    { label: '批量重启', action: 'restart', variant: 'destructive' as const }
  ], [])

  return (
    <ResourceTable<Pod>
      resourceName="Pods"
      columns={columns}
      clusterScope={false}
      searchQueryFilter={podSearchFilter}
      enableRowSelection={true}
      onBatchAction={handleBatchAction}
      batchActions={batchActions}
    />
  )
}
