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
import { Progress } from '@/components/ui/progress'
import { AlertTriangle, Server, CheckCircle, Clock, Loader2 } from 'lucide-react'

export interface PodRestartProgress {
  pod: Pod
  status: 'pending' | 'processing' | 'completed' | 'error'
  error?: string
}

interface PodRestartDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pods: Pod[]
  onConfirm: (onProgress?: (progress: PodRestartProgress[]) => void) => void
}

export function PodRestartDialog({
  open,
  onOpenChange,
  pods,
  onConfirm,
}: PodRestartDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState<PodRestartProgress[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  // Initialize progress when pods change
  const initializeProgress = () => {
    const initialProgress = pods.map(pod => ({
      pod,
      status: 'pending' as const
    }))
    setProgress(initialProgress)
  }

  // Initialize progress when dialog opens
  if (open && progress.length === 0 && pods.length > 0) {
    initializeProgress()
  }

  // Reset states when dialog closes
  if (!open && (progress.length > 0 || isProcessing)) {
    setProgress([])
    setIsProcessing(false)
    setIsLoading(false)
  }

  // Check if any pod is in critical state
  const criticalPods = pods.filter(
    (pod) => pod.status?.phase === 'Running' && 
    pod.status?.containerStatuses?.some(container => container.ready)
  )
  const hasCriticalPods = criticalPods.length > 0

  // Calculate progress statistics
  const completedCount = progress.filter(p => p.status === 'completed').length
  const errorCount = progress.filter(p => p.status === 'error').length
  const processingCount = progress.filter(p => p.status === 'processing').length
  const totalCount = progress.length
  const progressPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0

  const handleConfirm = async () => {
    setIsLoading(true)
    setIsProcessing(true)
    
    // Initialize progress state immediately when starting
    const initialProgress = pods.map(pod => ({
      pod,
      status: 'pending' as const
    }))
    setProgress(initialProgress)
    
    try {
      await onConfirm((newProgress) => {
        setProgress(newProgress)
      })
      
      // After completion, check if there were any errors
      const finalErrorCount = progress.filter(p => p.status === 'error').length
      
      if (finalErrorCount === 0) {
        setTimeout(() => {
          handleClose()
        }, 2000) // Allow user to see completion status
      }
    } catch (error) {
      console.error('Pod restart failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    if (!isProcessing || (isProcessing && completedCount + errorCount === totalCount)) {
      onOpenChange(false)
      setProgress([])
      setIsProcessing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="w-5 h-5" />
            批量重启 Pod{isProcessing ? '进行中' : '确认'}
          </DialogTitle>
          <DialogDescription>
            {isProcessing ? (
              <div className="space-y-2">
                <div>正在重启 {pods.length} 个 Pod</div>
                <div className="text-sm">
                  已完成: {completedCount} | 进行中: {processingCount} | 失败: {errorCount} | 总计: {totalCount}
                </div>
              </div>
            ) : (
              `您确定要重启以下 ${pods.length} 个 Pod 吗？此操作将删除这些 Pod，Kubernetes 会自动重新创建它们。`
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Progress bar - only show when processing */}
          {isProcessing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>重启进度</span>
                <span>{Math.round(progressPercentage)}%</span>
              </div>
              <Progress value={progressPercentage} className="w-full" />
            </div>
          )}

          {!isProcessing && hasCriticalPods && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                注意：有 {criticalPods.length} 个 Pod 正在运行中，重启可能会导致短暂的服务中断。
              </AlertDescription>
            </Alert>
          )}

          {/* Display pods with status */}
          <div className="max-h-64 overflow-y-auto space-y-2">
            {(isProcessing && progress.length > 0 ? progress : pods.map(pod => ({ pod, status: 'pending' as const }))).map((item) => {
              const pod = 'pod' in item ? item.pod : item
              const status = 'status' in item ? item.status : 'pending'
              const error = 'error' in item ? item.error : undefined
              
              const getStatusIcon = () => {
                switch (status) {
                  case 'completed':
                    return <CheckCircle className="w-4 h-4 text-green-500" />
                  case 'processing':
                    return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                  case 'error':
                    return <AlertTriangle className="w-4 h-4 text-red-500" />
                  default:
                    return <Clock className="w-4 h-4 text-gray-400" />
                }
              }

              const getStatusText = () => {
                switch (status) {
                  case 'completed':
                    return '已完成'
                  case 'processing':
                    return '进行中...'
                  case 'error':
                    return '失败'
                  default:
                    return '等待中'
                }
              }

              return (
                <div
                  key={`${pod.metadata?.namespace}-${pod.metadata?.name}`}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    status === 'completed' ? 'bg-green-50 border-green-200' :
                    status === 'processing' ? 'bg-blue-50 border-blue-200' :
                    status === 'error' ? 'bg-red-50 border-red-200' :
                    'bg-muted/30 border-muted'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon()}
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">
                        {pod.metadata?.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {pod.metadata?.namespace}
                      </span>
                    </div>
                    {isProcessing && (
                      <span className={`text-xs font-medium ${
                        status === 'completed' ? 'text-green-600' :
                        status === 'processing' ? 'text-blue-600' :
                        status === 'error' ? 'text-red-600' :
                        'text-gray-500'
                      }`}>
                        {getStatusText()}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={pod.status?.phase === 'Running' ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {pod.status?.phase || 'Unknown'}
                    </Badge>
                  </div>
                  {error && (
                    <div className="mt-1 text-xs text-red-600 max-w-xs truncate" title={error}>
                      {error}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <DialogFooter className="flex-col gap-3 sm:flex-row sm:justify-end">
          {isProcessing ? (
            // Show progress actions when processing
            <div className="flex items-center gap-3 w-full justify-between">
              <div className="text-sm text-slate-600">
                {completedCount + errorCount === totalCount ? (
                  errorCount > 0 ? (
                    <span className="text-red-600">重启完成，{errorCount} 个失败</span>
                  ) : (
                    <span className="text-green-600">全部重启完成</span>
                  )
                ) : (
                  <span>正在重启中，请耐心等待...</span>
                )}
              </div>
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={processingCount > 0}
              >
                {processingCount > 0 ? '重启中...' : '关闭'}
              </Button>
            </div>
          ) : (
            // Show confirmation actions when not processing
            <>
              <Button
                variant="outline"
                onClick={handleClose}
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
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}