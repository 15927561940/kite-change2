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
import { Progress } from '@/components/ui/progress'
import { AlertTriangle, CheckCircle, Clock, Loader2 } from 'lucide-react'

export interface DeploymentRestartProgress {
  deployment: Deployment
  status: 'pending' | 'processing' | 'completed' | 'error'
  error?: string
}

interface DeploymentRestartDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  deployments: Deployment[]
  onConfirm: (
    action: 'restart' | 'scale-restart', 
    options?: { finalReplicas?: number },
    onProgress?: (progress: DeploymentRestartProgress[]) => void
  ) => void
}

export function DeploymentRestartDialog({
  open,
  onOpenChange,
  deployments,
  onConfirm,
}: DeploymentRestartDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState<DeploymentRestartProgress[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  // Initialize progress when deployments change
  const initializeProgress = () => {
    const initialProgress = deployments.map(deployment => ({
      deployment,
      status: 'pending' as const
    }))
    setProgress(initialProgress)
  }

  // Initialize progress when dialog opens
  if (open && progress.length === 0 && deployments.length > 0) {
    initializeProgress()
  }

  // Reset states when dialog closes
  if (!open && (progress.length > 0 || isProcessing)) {
    setProgress([])
    setIsProcessing(false)
    setIsLoading(false)
  }

  // Check if any deployment has only 1 replica
  const singleReplicaDeployments = deployments.filter(
    (deployment) => deployment.spec?.replicas === 1
  )
  const hasSingleReplica = singleReplicaDeployments.length > 0

  // Calculate progress statistics
  const completedCount = progress.filter(p => p.status === 'completed').length
  const errorCount = progress.filter(p => p.status === 'error').length
  const processingCount = progress.filter(p => p.status === 'processing').length
  const totalCount = progress.length
  const progressPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0

  const handleConfirm = async (action: 'restart' | 'scale-restart', options?: { finalReplicas?: number }) => {
    setIsLoading(true)
    setIsProcessing(true)
    
    // Initialize progress state immediately when starting
    const initialProgress = deployments.map(deployment => ({
      deployment,
      status: 'pending' as const
    }))
    setProgress(initialProgress)
    
    try {
      await onConfirm(action, options, (newProgress) => {
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
      console.error('Restart failed:', error)
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
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            批量滚动重启{isProcessing ? '进行中' : '确认'}
          </DialogTitle>
          <DialogDescription>
            {isProcessing ? (
              <div className="space-y-2">
                <div>正在重启 {deployments.length} 个 Deployment</div>
                <div className="text-sm">
                  已完成: {completedCount} | 进行中: {processingCount} | 失败: {errorCount} | 总计: {totalCount}
                </div>
              </div>
            ) : (
              `即将重启 ${deployments.length} 个 Deployment`
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

          {/* Display deployments with status */}
          <div className="max-h-64 overflow-y-auto">
            <div className="grid grid-cols-1 gap-2">
              {(isProcessing && progress.length > 0 ? progress : deployments.map(deployment => ({ deployment, status: 'pending' as const }))).map((item) => {
                const deployment = 'deployment' in item ? item.deployment : item
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
                    key={`${deployment.metadata?.namespace}/${deployment.metadata?.name}`}
                    className={`flex items-center justify-between p-3 rounded-md border ${
                      status === 'completed' ? 'bg-green-50 border-green-200' :
                      status === 'processing' ? 'bg-blue-50 border-blue-200' :
                      status === 'error' ? 'bg-red-50 border-red-200' :
                      'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {getStatusIcon()}
                      <span className="font-medium">{deployment.metadata?.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {deployment.metadata?.namespace}
                      </Badge>
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
                      <span className="text-sm text-slate-600">
                        副本数: {deployment.spec?.replicas || 0}
                      </span>
                      {deployment.spec?.replicas === 1 && (
                        <Badge variant="destructive" className="text-xs">
                          单副本
                        </Badge>
                      )}
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
              {hasSingleReplica ? (
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
                    onClick={() => handleConfirm('restart')}
                    disabled={isLoading}
                  >
                    {isLoading ? '启动中...' : '确定重启（接受中断）'}
                  </Button>
                  <Button
                    onClick={() => handleConfirm('scale-restart', { finalReplicas: 1 })}
                    disabled={isLoading}
                    className="bg-orange-600 hover:bg-orange-700 whitespace-nowrap"
                  >
                    {isLoading ? '启动中...' : '扩容重启后缩回1副本'}
                  </Button>
                  <Button
                    onClick={() => handleConfirm('scale-restart', { finalReplicas: 3 })}
                    disabled={isLoading}
                    className="bg-blue-600 hover:bg-blue-700 whitespace-nowrap"
                  >
                    {isLoading ? '启动中...' : '扩容重启保持3副本'}
                  </Button>
                </>
              ) : (
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
                    onClick={() => handleConfirm('restart')}
                    disabled={isLoading}
                  >
                    {isLoading ? '启动中...' : '确定重启'}
                  </Button>
                </>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}