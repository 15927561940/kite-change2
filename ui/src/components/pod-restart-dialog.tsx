import { useState } from 'react'
import { Pod } from 'kubernetes-types/core/v1'

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
import { AlertTriangle, Server } from 'lucide-react'

interface PodRestartDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pods: Pod[]
  onConfirm: () => void
}

export function PodRestartDialog({
  open,
  onOpenChange,
  pods,
  onConfirm,
}: PodRestartDialogProps) {
  const [isLoading, setIsLoading] = useState(false)

  // Check if any pod is in critical state
  const criticalPods = pods.filter(
    (pod) => pod.status?.phase === 'Running' && 
    pod.status?.containerStatuses?.some(container => container.ready)
  )
  const hasCriticalPods = criticalPods.length > 0

  const handleConfirm = async () => {
    setIsLoading(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch (error) {
      console.error('Pod restart failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="w-5 h-5" />
            确认批量重启 Pod
          </DialogTitle>
          <DialogDescription>
            您确定要重启以下 {pods.length} 个 Pod 吗？此操作将删除这些 Pod，Kubernetes 会自动重新创建它们。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {hasCriticalPods && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                注意：有 {criticalPods.length} 个 Pod 正在运行中，重启可能会导致短暂的服务中断。
              </AlertDescription>
            </Alert>
          )}

          <div className="max-h-60 overflow-y-auto space-y-2">
            {pods.map((pod) => (
              <div
                key={`${pod.metadata?.namespace}-${pod.metadata?.name}`}
                className="flex items-center justify-between p-3 border rounded-lg bg-muted/30"
              >
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">
                      {pod.metadata?.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {pod.metadata?.namespace}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge 
                    variant={pod.status?.phase === 'Running' ? 'default' : 'secondary'}
                    className="text-xs"
                  >
                    {pod.status?.phase || 'Unknown'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            取消
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? '正在重启...' : '确认重启'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}