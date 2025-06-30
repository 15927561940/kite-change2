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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Target } from 'lucide-react'

interface DeploymentScaleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  deployments: Deployment[]
  onConfirm: (scaleRequests: Array<{ deployment: Deployment; replicas: number }>) => void
}

export function DeploymentScaleDialog({
  open,
  onOpenChange,
  deployments,
  onConfirm,
}: DeploymentScaleDialogProps) {
  const [scaleMode, setScaleMode] = useState<'uniform' | 'individual'>('uniform')
  const [uniformReplicas, setUniformReplicas] = useState<string>('')
  const [individualReplicas, setIndividualReplicas] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)

  // Initialize individual replicas with current values
  const initializeIndividualReplicas = () => {
    const initial: Record<string, string> = {}
    deployments.forEach(deployment => {
      const key = `${deployment.metadata?.namespace}/${deployment.metadata?.name}`
      initial[key] = (deployment.spec?.replicas || 0).toString()
    })
    setIndividualReplicas(initial)
  }

  // Initialize individual replicas when dialog opens
  if (open && Object.keys(individualReplicas).length === 0) {
    initializeIndividualReplicas()
  }

  const handleConfirm = async () => {
    const scaleRequests: Array<{ deployment: Deployment; replicas: number }> = []

    if (scaleMode === 'uniform') {
      const replicasNum = parseInt(uniformReplicas)
      if (isNaN(replicasNum) || replicasNum < 0) {
        alert('请输入有效的副本数（≥0）')
        return
      }
      
      deployments.forEach(deployment => {
        scaleRequests.push({ deployment, replicas: replicasNum })
      })
    } else {
      // Individual mode
      let hasError = false
      
      deployments.forEach(deployment => {
        const key = `${deployment.metadata?.namespace}/${deployment.metadata?.name}`
        const replicasStr = individualReplicas[key] || '0'
        const replicasNum = parseInt(replicasStr)
        
        if (isNaN(replicasNum) || replicasNum < 0) {
          alert(`${deployment.metadata?.name} 的副本数无效，请输入大于等于0的数字`)
          hasError = true
          return
        }
        
        scaleRequests.push({ deployment, replicas: replicasNum })
      })
      
      if (hasError) return
    }

    setIsLoading(true)
    try {
      await onConfirm(scaleRequests)
      onOpenChange(false)
      setUniformReplicas('')
      setIndividualReplicas({})
    } catch (error) {
      console.error('Scale failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleReset = () => {
    onOpenChange(false)
    setUniformReplicas('')
    setIndividualReplicas({})
    setScaleMode('uniform')
  }

  const updateIndividualReplicas = (key: string, value: string) => {
    setIndividualReplicas(prev => ({
      ...prev,
      [key]: value
    }))
  }

  // Get current replica counts
  const replicaCounts = deployments.map(d => d.spec?.replicas || 0)
  const minReplicas = Math.min(...replicaCounts)
  const maxReplicas = Math.max(...replicaCounts)
  const allSameReplicas = minReplicas === maxReplicas

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
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
          {/* Current status summary */}
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

          {/* Scale mode selection */}
          <div className="space-y-3">
            <Label className="text-base font-medium">调整模式</Label>
            <RadioGroup value={scaleMode} onValueChange={(value: string) => setScaleMode(value as 'uniform' | 'individual')}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="uniform" id="uniform" />
                <Label htmlFor="uniform" className="font-normal">统一设置 - 所有 Deployment 设为相同副本数</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="individual" id="individual" />
                <Label htmlFor="individual" className="font-normal">单独设置 - 每个 Deployment 设置不同副本数</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Uniform mode settings */}
          {scaleMode === 'uniform' && (
            <div className="space-y-3">
              <Label htmlFor="uniform-replicas">统一副本数</Label>
              <Input
                id="uniform-replicas"
                type="number"
                min="0"
                value={uniformReplicas}
                onChange={(e) => setUniformReplicas(e.target.value)}
                placeholder="请输入目标副本数（如：3）"
                className="w-full"
              />
              
              {/* Quick scale buttons */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600">快速设置：</span>
                {[0, 1, 3, 5].map((num) => (
                  <Button
                    key={num}
                    variant="outline"
                    size="sm"
                    onClick={() => setUniformReplicas(num.toString())}
                    className="h-8"
                  >
                    {num}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Individual mode settings */}
          {scaleMode === 'individual' && (
            <div className="space-y-3">
              <Label className="text-base">单独设置每个 Deployment</Label>
              <div className="max-h-60 overflow-y-auto space-y-2">
                {deployments.map((deployment) => {
                  const key = `${deployment.metadata?.namespace}/${deployment.metadata?.name}`
                  const currentReplicas = deployment.spec?.replicas || 0
                  
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between p-3 bg-slate-50 rounded-md"
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <span className="font-medium text-sm">{deployment.metadata?.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {deployment.metadata?.namespace}
                        </Badge>
                        <span className="text-xs text-slate-500">
                          (当前: {currentReplicas})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          value={individualReplicas[key] || ''}
                          onChange={(e) => updateIndividualReplicas(key, e.target.value)}
                          placeholder="副本数"
                          className="w-20 h-8"
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
              
              {/* Batch set buttons for individual mode */}
              <div className="flex items-center gap-2 pt-2 border-t">
                <span className="text-sm text-slate-600">批量填充：</span>
                {[0, 1, 3, 5].map((num) => (
                  <Button
                    key={num}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const newIndividual: Record<string, string> = {}
                      deployments.forEach(deployment => {
                        const key = `${deployment.metadata?.namespace}/${deployment.metadata?.name}`
                        newIndividual[key] = num.toString()
                      })
                      setIndividualReplicas(newIndividual)
                    }}
                    className="h-8"
                  >
                    全部设为{num}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={isLoading}
          >
            取消
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading || (scaleMode === 'uniform' && uniformReplicas === '')}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isLoading ? '调整中...' : '确定调整'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}