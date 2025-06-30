import { useState } from 'react'
import { Deployment } from 'kubernetes-types/apps/v1'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle } from 'lucide-react'

interface DeploymentRestartDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  deployments: Deployment[]
  onConfirm: (action: 'restart' | 'scale-restart', options?: { finalReplicas?: number }) => void
}

export function DeploymentRestartDialog({
  open,
  onOpenChange,
  deployments,
  onConfirm,
}: DeploymentRestartDialogProps) {
  const [isLoading, setIsLoading] = useState(false)

  // Check if any deployment has only 1 replica
  const singleReplicaDeployments = deployments.filter(
    (deployment) => deployment.spec?.replicas === 1
  )
  const hasSingleReplica = singleReplicaDeployments.length > 0

  const handleConfirm = async (action: 'restart' | 'scale-restart', options?: { finalReplicas?: number }) => {
    setIsLoading(true)
    try {
      await onConfirm(action, options)
      onOpenChange(false)
    } catch (error) {
      console.error('Restart failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            批量滚动重启确认
          </DialogTitle>
          <DialogDescription>
            即将重启 {deployments.length} 个 Deployment
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Display deployments to be restarted */}
          <div className="max-h-32 overflow-y-auto">
            <div className="grid grid-cols-1 gap-2">
              {deployments.map((deployment) => (
                <div
                  key={`${deployment.metadata?.namespace}/${deployment.metadata?.name}`}
                  className="flex items-center justify-between p-2 bg-slate-50 rounded-md"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{deployment.metadata?.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {deployment.metadata?.namespace}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-600">
                      副本数: {deployment.spec?.replicas || 0}
                    </span>
                    {deployment.spec?.replicas === 1 && (
                      <Badge variant="destructive" className="text-xs">
                        单副本
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Warning for single replica deployments */}
          {hasSingleReplica && (
            <Alert className="border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <AlertDescription className="text-red-700">
                检测到 {singleReplicaDeployments.length} 个单副本 Deployment。
                滚动重启单副本 Deployment 实际上是杀死重建，会导致服务短暂中断。
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="flex-col gap-3 sm:flex-row sm:justify-end sm:flex-wrap">
          {hasSingleReplica ? (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
              >
                取消
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleConfirm('restart')}
                disabled={isLoading}
              >
                {isLoading ? '重启中...' : '确定重启（接受中断）'}
              </Button>
              <Button
                onClick={() => handleConfirm('scale-restart', { finalReplicas: 1 })}
                disabled={isLoading}
                className="bg-orange-600 hover:bg-orange-700 whitespace-nowrap"
              >
                {isLoading ? '处理中...' : '扩容重启后缩回1副本'}
              </Button>
              <Button
                onClick={() => handleConfirm('scale-restart', { finalReplicas: 3 })}
                disabled={isLoading}
                className="bg-blue-600 hover:bg-blue-700 whitespace-nowrap"
              >
                {isLoading ? '处理中...' : '扩容重启保持3副本'}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
              >
                取消
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleConfirm('restart')}
                disabled={isLoading}
              >
                {isLoading ? '重启中...' : '确定重启'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}