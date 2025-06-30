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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Target } from 'lucide-react'

interface DeploymentScaleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  deployments: Deployment[]
  onConfirm: (replicas: number) => void
}

export function DeploymentScaleDialog({
  open,
  onOpenChange,
  deployments,
  onConfirm,
}: DeploymentScaleDialogProps) {
  const [replicas, setReplicas] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)

  const handleConfirm = async () => {
    const replicasNum = parseInt(replicas)
    if (isNaN(replicasNum) || replicasNum < 0) {
      alert('请输入有效的副本数（≥0）')
      return
    }

    setIsLoading(true)
    try {
      await onConfirm(replicasNum)
      onOpenChange(false)
      setReplicas('')
    } catch (error) {
      console.error('Scale failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Get current replica counts
  const replicaCounts = deployments.map(d => d.spec?.replicas || 0)
  const minReplicas = Math.min(...replicaCounts)
  const maxReplicas = Math.max(...replicaCounts)
  const allSameReplicas = minReplicas === maxReplicas

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-blue-500" />
            批量调整副本数
          </DialogTitle>
          <DialogDescription>
            即将调整 {deployments.length} 个 Deployment 的副本数
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Display deployments to be scaled */}
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
                      当前副本数: {deployment.spec?.replicas || 0}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Replica count summary */}
          <div className="p-3 bg-blue-50 rounded-md">
            <div className="text-sm font-medium text-blue-800">
              当前副本数情况：
              {allSameReplicas ? (
                <span className="ml-2">所有 Deployment 都是 {minReplicas} 个副本</span>
              ) : (
                <span className="ml-2">副本数范围：{minReplicas} - {maxReplicas}</span>
              )}
            </div>
          </div>

          {/* Replica input */}
          <div className="space-y-2">
            <Label htmlFor="replicas">目标副本数</Label>
            <Input
              id="replicas"
              type="number"
              min="0"
              value={replicas}
              onChange={(e) => setReplicas(e.target.value)}
              placeholder="请输入目标副本数（如：3）"
              className="w-full"
            />
            <div className="text-xs text-slate-500">
              提示：设置为 0 将暂停所有 Pod，设置大于 0 的数字将扩容或缩容
            </div>
          </div>

          {/* Quick scale buttons */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">快速设置：</span>
            {[0, 1, 3, 5].map((num) => (
              <Button
                key={num}
                variant="outline"
                size="sm"
                onClick={() => setReplicas(num.toString())}
                className="h-8"
              >
                {num}
              </Button>
            ))}
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false)
              setReplicas('')
            }}
            disabled={isLoading}
          >
            取消
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading || replicas === ''}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isLoading ? '调整中...' : `确定调整到 ${replicas || '?'} 个副本`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}