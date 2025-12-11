import { useCallback, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Node } from 'kubernetes-types/core/v1'
import { Link, useNavigate } from 'react-router-dom'
import {
  IconRefresh,
  IconTerminal2,
  IconFileCode,
  IconAlertCircle,
  IconCircleCheck,
  IconCircleX
} from '@tabler/icons-react'

import { formatDate } from '@/lib/utils'
import { ResourceTable } from '@/components/resource-table'
import { restartKubelet, restartKubeProxy } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { NodeConfigDialog } from '@/components/node-config-dialog'

// Restart confirmation dialog component
interface RestartConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  nodeName: string
  serviceType: 'kubelet' | 'kube-proxy'
  onConfirm: () => Promise<void>
}

function RestartConfirmDialog({
  open,
  onOpenChange,
  nodeName,
  serviceType,
  onConfirm,
}: RestartConfirmDialogProps) {
  const [isRestarting, setIsRestarting] = useState(false)

  const handleConfirm = async () => {
    setIsRestarting(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch (error) {
      console.error('Restart failed:', error)
    } finally {
      setIsRestarting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <IconAlertCircle className="w-5 h-5" />
            确认重启 {serviceType}
          </DialogTitle>
          <DialogDescription>
            你确定要重启节点 <span className="font-semibold">{nodeName}</span> 上的{' '}
            <span className="font-semibold">{serviceType}</span> 吗？
          </DialogDescription>
        </DialogHeader>
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-sm text-yellow-800">
          <p className="font-medium">⚠️ 警告</p>
          <p className="mt-1">
            {serviceType === 'kubelet'
              ? '重启 kubelet 可能会导致该节点上的所有 Pod 短暂中断。'
              : '重启 kube-proxy 可能会导致该节点上的网络服务短暂中断。'}
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isRestarting}
          >
            取消
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isRestarting}
          >
            {isRestarting ? '重启中...' : '确认重启'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Batch restart dialog component
interface BatchRestartDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  nodes: Node[]
  serviceType: 'kubelet' | 'kube-proxy'
  onConfirm: () => Promise<void>
}

function BatchRestartDialog({
  open,
  onOpenChange,
  nodes,
  serviceType,
  onConfirm,
}: BatchRestartDialogProps) {
  const [isRestarting, setIsRestarting] = useState(false)
  const [progress, setProgress] = useState<{
    [nodeName: string]: 'pending' | 'processing' | 'completed' | 'error'
  }>({})

  const handleConfirm = async () => {
    setIsRestarting(true)
    const initialProgress: typeof progress = {}
    nodes.forEach((node) => {
      initialProgress[node.metadata!.name!] = 'pending'
    })
    setProgress(initialProgress)

    try {
      await onConfirm()
    } catch (error) {
      console.error('Batch restart failed:', error)
    } finally {
      setIsRestarting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <IconAlertCircle className="w-5 h-5" />
            批量重启 {serviceType}
          </DialogTitle>
          <DialogDescription>
            你确定要重启以下 <span className="font-semibold">{nodes.length}</span> 个节点上的{' '}
            <span className="font-semibold">{serviceType}</span> 吗？
          </DialogDescription>
        </DialogHeader>

        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-sm text-yellow-800">
          <p className="font-medium">⚠️ 警告</p>
          <p className="mt-1">
            {serviceType === 'kubelet'
              ? '批量重启 kubelet 可能会导致这些节点上的所有 Pod 短暂中断。'
              : '批量重启 kube-proxy 可能会导致这些节点上的网络服务短暂中断。'}
          </p>
        </div>

        <div className="space-y-2 max-h-60 overflow-y-auto">
          <p className="text-sm font-medium">将要重启的节点：</p>
          {nodes.map((node) => {
            const nodeName = node.metadata!.name!
            const status = progress[nodeName]
            return (
              <div
                key={nodeName}
                className="flex items-center justify-between p-2 rounded border"
              >
                <span className="text-sm">{nodeName}</span>
                {status && (
                  <Badge
                    variant={
                      status === 'completed'
                        ? 'default'
                        : status === 'error'
                        ? 'destructive'
                        : 'secondary'
                    }
                  >
                    {status === 'pending' && '等待中'}
                    {status === 'processing' && '处理中...'}
                    {status === 'completed' && '已完成'}
                    {status === 'error' && '失败'}
                  </Badge>
                )}
              </div>
            )
          })}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isRestarting}
          >
            取消
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isRestarting}
          >
            {isRestarting ? '重启中...' : `确认批量重启 (${nodes.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function NodeListPage() {
  const columnHelper = createColumnHelper<Node>()
  const navigate = useNavigate()

  // State for restart dialogs
  const [restartDialog, setRestartDialog] = useState<{
    open: boolean
    nodeName: string
    serviceType: 'kubelet' | 'kube-proxy'
  }>({
    open: false,
    nodeName: '',
    serviceType: 'kubelet',
  })

  // State for batch restart dialog
  const [batchRestartDialog, setBatchRestartDialog] = useState<{
    open: boolean
    nodes: Node[]
    serviceType: 'kubelet' | 'kube-proxy'
  }>({
    open: false,
    nodes: [],
    serviceType: 'kubelet',
  })

  // State for config dialog
  const [configDialog, setConfigDialog] = useState<{
    open: boolean
    nodeName: string
  }>({
    open: false,
    nodeName: '',
  })

  // Helper function to get node internal IP
  const getNodeIP = (node: Node): string => {
    const internalIP = node.status?.addresses?.find(
      (addr) => addr.type === 'InternalIP'
    )
    return internalIP?.address || '-'
  }

  // Helper function to get kubelet status
  const getKubeletStatus = (node: Node): { ready: boolean; message: string } => {
    const condition = node.status?.conditions?.find((c) => c.type === 'Ready')
    return {
      ready: condition?.status === 'True',
      message: condition?.message || condition?.reason || 'Unknown',
    }
  }

  // Helper function to check if kube-proxy is running (simplified)
  const getKubeProxyStatus = (node: Node): { ready: boolean; message: string } => {
    // In a real implementation, you would check if kube-proxy pod is running on this node
    // For now, we'll assume it's running if the node is ready
    const nodeReady = node.status?.conditions?.find((c) => c.type === 'Ready')?.status === 'True'
    return {
      ready: nodeReady,
      message: nodeReady ? 'Running' : 'Unknown',
    }
  }

  // Handle restart kubelet
  const handleRestartKubelet = async (nodeName: string) => {
    try {
      const result = await restartKubelet(nodeName)
      console.log('Kubelet restart initiated:', result)
      // You can show a success notification here
    } catch (error) {
      console.error('Failed to restart kubelet:', error)
      // You can show an error notification here
    }
  }

  // Handle restart kube-proxy
  const handleRestartKubeProxy = async (nodeName: string) => {
    try {
      const result = await restartKubeProxy(nodeName)
      console.log('Kube-proxy restart initiated:', result)
      // You can show a success notification here
    } catch (error) {
      console.error('Failed to restart kube-proxy:', error)
      // You can show an error notification here
    }
  }

  // Define columns for the node table
  const columns = useMemo(
    () => [
      columnHelper.accessor('metadata.name', {
        header: 'Name',
        cell: ({ row }) => (
          <div className="font-medium text-blue-500 hover:underline">
            <Link to={`/nodes/${row.original.metadata!.name}`}>
              {row.original.metadata!.name}
            </Link>
          </div>
        ),
      }),
      columnHelper.accessor((row) => getNodeIP(row), {
        id: 'ip',
        header: 'IP',
        cell: ({ getValue }) => (
          <span className="text-sm text-muted-foreground">{getValue()}</span>
        ),
      }),
      columnHelper.accessor((row) => row.status?.nodeInfo?.kubeletVersion, {
        id: 'version',
        header: 'Kubelet Version',
        cell: ({ getValue }) => (
          <span className="text-sm text-muted-foreground">{getValue() || '-'}</span>
        ),
      }),
      columnHelper.accessor((row) => getKubeletStatus(row), {
        id: 'kubelet-status',
        header: 'Kubelet',
        sortingFn: (rowA, rowB) => {
          const statusA = rowA.getValue('kubelet-status') as { ready: boolean; message: string }
          const statusB = rowB.getValue('kubelet-status') as { ready: boolean; message: string }
          // Ready nodes come first (true > false, so we reverse)
          if (statusA.ready === statusB.ready) return 0
          return statusA.ready ? -1 : 1
        },
        cell: ({ row, getValue }) => {
          const status = getValue()
          const nodeName = row.original.metadata!.name!

          return (
            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant={status.ready ? 'default' : 'destructive'}
                      className="cursor-help"
                    >
                      {status.ready ? (
                        <IconCircleCheck className="w-3 h-3 mr-1" />
                      ) : (
                        <IconCircleX className="w-3 h-3 mr-1" />
                      )}
                      {status.ready ? 'Ready' : 'NotReady'}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs">{status.message}</div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 hover:bg-red-100 hover:text-red-700"
                      onClick={() =>
                        setRestartDialog({
                          open: true,
                          nodeName,
                          serviceType: 'kubelet',
                        })
                      }
                    >
                      <IconRefresh className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs font-medium">重启 Kubelet</div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )
        },
      }),
      columnHelper.accessor((row) => getKubeProxyStatus(row), {
        id: 'kubeproxy-status',
        header: 'Kube-Proxy',
        sortingFn: (rowA, rowB) => {
          const statusA = rowA.getValue('kubeproxy-status') as { ready: boolean; message: string }
          const statusB = rowB.getValue('kubeproxy-status') as { ready: boolean; message: string }
          // Running nodes come first
          if (statusA.ready === statusB.ready) return 0
          return statusA.ready ? -1 : 1
        },
        cell: ({ row, getValue }) => {
          const status = getValue()
          const nodeName = row.original.metadata!.name!

          return (
            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant={status.ready ? 'default' : 'secondary'}
                      className="cursor-help"
                    >
                      {status.ready ? (
                        <IconCircleCheck className="w-3 h-3 mr-1" />
                      ) : (
                        <IconCircleX className="w-3 h-3 mr-1" />
                      )}
                      {status.ready ? 'Running' : 'Unknown'}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs">{status.message}</div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 hover:bg-red-100 hover:text-red-700"
                      onClick={() =>
                        setRestartDialog({
                          open: true,
                          nodeName,
                          serviceType: 'kube-proxy',
                        })
                      }
                    >
                      <IconRefresh className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs font-medium">重启 Kube-Proxy</div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )
        },
      }),
      columnHelper.accessor((row) => row, {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const nodeName = row.original.metadata!.name!

          return (
            <div className="flex items-center gap-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 hover:bg-blue-100 hover:text-blue-700"
                      onClick={() => navigate(`/nodes/${nodeName}?tab=events`)}
                    >
                      <IconAlertCircle className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs font-medium">查看 Events</div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 hover:bg-green-100 hover:text-green-700"
                      onClick={() => navigate(`/nodes/${nodeName}?tab=terminal`)}
                    >
                      <IconTerminal2 className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs font-medium">进入节点终端</div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 hover:bg-purple-100 hover:text-purple-700"
                      onClick={() =>
                        setConfigDialog({ open: true, nodeName })
                      }
                    >
                      <IconFileCode className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs font-medium">查看配置</div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )
        },
      }),
      columnHelper.accessor('metadata.creationTimestamp', {
        header: 'Age',
        cell: ({ getValue }) => {
          const dateStr = formatDate(getValue() || '', true)
          return <span className="text-muted-foreground text-sm">{dateStr}</span>
        },
      }),
    ],
    [columnHelper, navigate]
  )

  // Handle batch restart
  const handleBatchRestart = useCallback(
    async (selectedNodes: Node[], serviceType: 'kubelet' | 'kube-proxy') => {
      for (const node of selectedNodes) {
        const nodeName = node.metadata!.name!
        try {
          if (serviceType === 'kubelet') {
            await restartKubelet(nodeName)
          } else {
            await restartKubeProxy(nodeName)
          }
          console.log(`${serviceType} restart initiated on ${nodeName}`)
        } catch (error) {
          console.error(`Failed to restart ${serviceType} on ${nodeName}:`, error)
        }
      }
    },
    []
  )

  // Handle batch action
  const handleBatchAction = useCallback(
    async (selectedNodes: Node[], action: string) => {
      if (action === 'restart-kubelet') {
        setBatchRestartDialog({
          open: true,
          nodes: selectedNodes,
          serviceType: 'kubelet',
        })
      } else if (action === 'restart-kubeproxy') {
        setBatchRestartDialog({
          open: true,
          nodes: selectedNodes,
          serviceType: 'kube-proxy',
        })
      }
    },
    []
  )

  // Define batch actions
  const batchActions = useMemo(
    () => [
      {
        label: '批量重启 Kubelet',
        action: 'restart-kubelet',
        variant: 'destructive' as const,
      },
      {
        label: '批量重启 Kube-Proxy',
        action: 'restart-kubeproxy',
        variant: 'destructive' as const,
      },
    ],
    []
  )

  // Custom filter for node search
  const nodeSearchFilter = useCallback((node: Node, query: string) => {
    const name = node.metadata!.name!.toLowerCase()
    const ip = getNodeIP(node).toLowerCase()
    const kubeletStatus = getKubeletStatus(node)
    const kubeProxyStatus = getKubeProxyStatus(node)
    const version = node.status?.nodeInfo?.kubeletVersion?.toLowerCase() || ''
    const lowerQuery = query.toLowerCase()

    return (
      name.includes(lowerQuery) ||
      ip.includes(lowerQuery) ||
      version.includes(lowerQuery) ||
      (kubeletStatus.ready && 'ready'.includes(lowerQuery)) ||
      (!kubeletStatus.ready && 'notready'.includes(lowerQuery)) ||
      (kubeProxyStatus.ready && 'running'.includes(lowerQuery))
    )
  }, [])

  return (
    <>
      <ResourceTable<Node>
        resourceName="Nodes"
        columns={columns}
        clusterScope={true}
        searchQueryFilter={nodeSearchFilter}
        enableRowSelection={true}
        onBatchAction={handleBatchAction}
        batchActions={batchActions}
      />

      <RestartConfirmDialog
        open={restartDialog.open}
        onOpenChange={(open) =>
          setRestartDialog({ ...restartDialog, open })
        }
        nodeName={restartDialog.nodeName}
        serviceType={restartDialog.serviceType}
        onConfirm={async () => {
          if (restartDialog.serviceType === 'kubelet') {
            await handleRestartKubelet(restartDialog.nodeName)
          } else {
            await handleRestartKubeProxy(restartDialog.nodeName)
          }
        }}
      />

      <BatchRestartDialog
        open={batchRestartDialog.open}
        onOpenChange={(open) =>
          setBatchRestartDialog({ ...batchRestartDialog, open })
        }
        nodes={batchRestartDialog.nodes}
        serviceType={batchRestartDialog.serviceType}
        onConfirm={async () => {
          await handleBatchRestart(
            batchRestartDialog.nodes,
            batchRestartDialog.serviceType
          )
        }}
      />

      <NodeConfigDialog
        open={configDialog.open}
        onOpenChange={(open) =>
          setConfigDialog({ ...configDialog, open })
        }
        nodeName={configDialog.nodeName}
      />
    </>
  )
}
