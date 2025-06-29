import { useState } from 'react'
import { IconHistory, IconAlertTriangle, IconEye, IconServer, IconRefresh } from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { usePodHistory, type PodNodeHistory } from '@/lib/api'
import { safeFormatDistanceToNow } from '@/lib/date-utils'

interface PodStatusBadgeProps {
  pod: any
  showHistoryButton?: boolean
  showLogsButton?: boolean
  onViewLogs?: () => void
}

export function PodStatusBadge({ 
  pod, 
  showHistoryButton = true,
  showLogsButton = true,
  onViewLogs 
}: PodStatusBadgeProps) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const { data: podHistory, isLoading } = usePodHistory(
    pod.metadata?.namespace || '',
    pod.metadata?.name || '',
    { 
      staleTime: 30000,
      refreshInterval: historyOpen ? 60000 : 0
    }
  )


  const getStatusVariant = (phase: string) => {
    switch (phase?.toLowerCase()) {
      case 'running':
        return 'default'
      case 'pending':
        return 'outline'
      case 'succeeded':
        return 'secondary'
      case 'failed':
        return 'destructive'
      default:
        return 'secondary'
    }
  }

  const isErrorState = (pod: any) => {
    if (pod.status?.phase === 'Failed') return true
    
    // Check container statuses for errors
    if (pod.status?.containerStatuses) {
      return pod.status.containerStatuses.some((container: any) => {
        const waiting = container.state?.waiting
        if (waiting) {
          const errorReasons = ['ImagePullBackOff', 'ErrImagePull', 'CrashLoopBackOff', 'CreateContainerConfigError']
          return errorReasons.includes(waiting.reason)
        }
        
        const terminated = container.state?.terminated
        if (terminated && terminated.exitCode !== 0) {
          return true
        }
        
        return false
      })
    }
    
    return false
  }

  const getErrorMessage = (pod: any) => {
    if (pod.status?.message) return pod.status.message
    
    // Check container statuses for error messages
    if (pod.status?.containerStatuses) {
      for (const container of pod.status.containerStatuses) {
        const waiting = container.state?.waiting
        if (waiting && waiting.message) {
          return `${container.name}: ${waiting.reason} - ${waiting.message}`
        }
        
        const terminated = container.state?.terminated
        if (terminated && terminated.exitCode !== 0) {
          return `${container.name} exited with code ${terminated.exitCode}: ${terminated.message || terminated.reason}`
        }
      }
    }
    
    return 'Unknown error'
  }

  const hasErrors = isErrorState(pod)
  const errorMessage = hasErrors ? getErrorMessage(pod) : ''
  
  const getRestartCount = (pod: any) => {
    if (!pod.status?.containerStatuses) return 0
    return pod.status.containerStatuses.reduce((total: number, container: any) => 
      total + (container.restartCount || 0), 0
    )
  }

  const restartCount = getRestartCount(pod)

  const NodeHistoryCard = ({ history }: { history: PodNodeHistory }) => (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <IconServer className="w-4 h-4" />
          节点历史 (最近5次)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {!history.nodeHistory || history.nodeHistory.length === 0 ? (
            <p className="text-muted-foreground text-sm">暂无节点历史记录</p>
          ) : (
            history.nodeHistory.map((entry, index) => (
              <div key={index} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      index === 0 ? "bg-green-500" : "bg-gray-400"
                    )} />
                    <span className="font-medium text-sm">{entry.nodeName}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {entry.phase}
                  </Badge>
                </div>
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">
                    {safeFormatDistanceToNow(entry.startTime, { 
                      addSuffix: true
                    })}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {entry.reason}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )

  const RestartHistoryCard = ({ history }: { history: PodNodeHistory }) => (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <IconRefresh className="w-4 h-4" />
          重启历史
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {!history.restartHistory || history.restartHistory.length === 0 ? (
            <p className="text-muted-foreground text-sm">暂无重启记录</p>
          ) : (
            history.restartHistory.map((entry, index) => (
              <div key={index} className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="outline" className="text-xs">
                    总重启次数: {entry.restartCount}
                  </Badge>
                  {entry.lastRestartTime && (
                    <span className="text-xs text-muted-foreground">
                      {safeFormatDistanceToNow(entry.lastRestartTime, { 
                        addSuffix: true
                      })}
                    </span>
                  )}
                </div>
                
                {entry.containerStates && entry.containerStates.length > 0 ? (
                  entry.containerStates.map((container, containerIndex) => (
                    <div key={containerIndex} className="mt-2 p-2 rounded border-l-2 border-orange-500 bg-background">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-xs">{container.containerName}</span>
                        <Badge variant="secondary" className="text-xs">
                          重启 {container.restartCount} 次
                        </Badge>
                      </div>
                      {container.reason && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          原因: {container.reason}
                          {container.exitCode !== undefined && ` (退出码: ${container.exitCode})`}
                        </div>
                      )}
                      {container.message && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {container.message}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-muted-foreground">暂无容器重启详情</div>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        {/* Status Badge with Error Tooltip */}
        {hasErrors ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1">
                <Badge variant={getStatusVariant(pod.status?.phase)} className="cursor-help">
                  <IconAlertTriangle className="w-3 h-3 mr-1" />
                  {pod.status?.phase || 'Unknown'}
                </Badge>
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-sm">
              <div className="space-y-1">
                <div className="font-medium text-xs">错误详情:</div>
                <div className="text-xs">{errorMessage}</div>
              </div>
            </TooltipContent>
          </Tooltip>
        ) : (
          <Badge variant={getStatusVariant(pod.status?.phase)}>
            {pod.status?.phase || 'Unknown'}
          </Badge>
        )}

        {/* Restart Count Badge */}
        {restartCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="cursor-help">
                <IconRefresh className="w-3 h-3 mr-1" />
                {restartCount}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-xs">容器重启次数: {restartCount}</div>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-1">
          {/* Logs Button */}
          {showLogsButton && onViewLogs && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onViewLogs}
                  className="h-6 w-6 p-0"
                >
                  <IconEye className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs">查看日志</div>
              </TooltipContent>
            </Tooltip>
          )}

          {/* History Button */}
          {showHistoryButton && (
            <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
              <DialogTrigger asChild>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                    >
                      <IconHistory className="w-3 h-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs">查看历史</div>
                  </TooltipContent>
                </Tooltip>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <IconHistory className="w-5 h-5" />
                    Pod 历史记录: {pod.metadata?.name}
                  </DialogTitle>
                  <DialogDescription>
                    查看Pod的节点调度历史、重启记录和相关事件
                  </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-sm text-muted-foreground">加载历史记录中...</div>
                  </div>
                ) : podHistory ? (
                  <div className="space-y-4">
                    {/* Current Status */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">当前状态</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">节点:</span>
                            <span className="ml-2 font-medium">{podHistory.currentNode || '未分配'}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">状态:</span>
                            <span className="ml-2">
                              <Badge variant={getStatusVariant(podHistory.status.phase)}>
                                {podHistory.status.phase}
                              </Badge>
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">就绪状态:</span>
                            <span className="ml-2">
                              <Badge variant={podHistory.status.isReady ? 'default' : 'secondary'}>
                                {podHistory.status.isReady ? '就绪' : '未就绪'}
                              </Badge>
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">QoS等级:</span>
                            <span className="ml-2 font-medium">{podHistory.status.qosClass || 'Unknown'}</span>
                          </div>
                        </div>
                        {podHistory.status.hasErrors && (
                          <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200">
                            <div className="text-sm font-medium text-red-800">错误信息:</div>
                            <div className="text-sm text-red-700 mt-1">{podHistory.status.errorMessage}</div>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Node History */}
                    <NodeHistoryCard history={podHistory} />

                    {/* Restart History */}
                    <RestartHistoryCard history={podHistory} />

                    {/* Recent Events */}
                    {podHistory.events && podHistory.events.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-sm">最近事件</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {podHistory.events.slice(0, 10).map((event, index) => (
                              <div key={index} className="p-2 rounded border-l-2 border-blue-500 bg-blue-50/50">
                                <div className="flex items-center justify-between">
                                  <span className="font-medium text-xs">{event.reason}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {safeFormatDistanceToNow(event.creationTimestamp, { 
                                      addSuffix: true
                                    })}
                                  </span>
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  {event.message}
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-sm text-muted-foreground">无法加载历史记录</div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}