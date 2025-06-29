import { useMemo } from 'react'
import { IconHistory, IconServer, IconRefresh, IconAlertTriangle, IconTrendingUp } from '@tabler/icons-react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'

import { usePodsHistoryBatch } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface PodHistoryOverviewProps {
  namespace: string
  labelSelector?: string
  pods?: any[]
}

export function PodHistoryOverview({ 
  namespace, 
  labelSelector
}: PodHistoryOverviewProps) {
  
  const { data: batchHistory, isLoading, error } = usePodsHistoryBatch(
    namespace,
    {
      labelSelector,
      limit: 50,
      staleTime: 30000,
      refreshInterval: 60000,
    }
  )

  const handleRefresh = () => {
    window.location.reload()
  }

  // Aggregate statistics
  const stats = useMemo(() => {
    if (!batchHistory?.histories || !Array.isArray(batchHistory.histories)) return null

    const histories = batchHistory.histories
    const totalPods = histories.length
    const podsWithErrors = histories.filter(h => h.status?.hasErrors).length
    const podsWithRestarts = histories.filter(h => 
      h.restartHistory && Array.isArray(h.restartHistory) && 
      h.restartHistory.some(r => r.restartCount > 0)
    ).length
    const totalRestarts = histories.reduce((sum, h) => 
      sum + (h.restartHistory && Array.isArray(h.restartHistory) ? 
        h.restartHistory.reduce((rSum, r) => rSum + (r.restartCount || 0), 0) : 0), 0
    )
    
    // Node distribution
    const nodeDistribution = new Map<string, number>()
    histories.forEach(h => {
      if (h.currentNode) {
        nodeDistribution.set(h.currentNode, (nodeDistribution.get(h.currentNode) || 0) + 1)
      }
    })
    
    const nodesUsed = nodeDistribution.size
    const mostUsedNode = Array.from(nodeDistribution.entries())
      .sort((a, b) => b[1] - a[1])[0]

    return {
      totalPods,
      podsWithErrors,
      podsWithRestarts,
      totalRestarts,
      nodesUsed,
      mostUsedNode: mostUsedNode ? { node: mostUsedNode[0], count: mostUsedNode[1] } : null,
      nodeDistribution: Array.from(nodeDistribution.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5) // Top 5 nodes
    }
  }, [batchHistory])

  // Recent events and alerts
  const recentAlerts = useMemo(() => {
    if (!batchHistory?.histories) return []

    const alerts: Array<{
      type: 'error' | 'restart' | 'node_change'
      podName: string
      message: string
      timestamp: Date
      severity: 'high' | 'medium' | 'low'
    }> = []

    batchHistory.histories.forEach(history => {
      // Error alerts
      if (history.status?.hasErrors) {
        alerts.push({
          type: 'error',
          podName: history.podName,
          message: history.status.errorMessage || 'Pod has errors',
          timestamp: new Date(), // Use current time as we don't have exact error time
          severity: 'high'
        })
      }

      // Restart alerts (recent restarts)
      if (history.restartHistory && Array.isArray(history.restartHistory)) {
        history.restartHistory.forEach(restart => {
          if (restart.lastRestartTime) {
            const restartTime = new Date(restart.lastRestartTime)
            const hoursSinceRestart = (Date.now() - restartTime.getTime()) / (1000 * 60 * 60)
            
            if (hoursSinceRestart < 24) { // Restarts in last 24 hours
              alerts.push({
                type: 'restart',
                podName: history.podName,
                message: `Container restarted ${restart.restartCount} times - ${restart.reason}`,
                timestamp: restartTime,
                severity: restart.restartCount > 5 ? 'high' : 'medium'
              })
            }
          }
        })
      }

      // Node changes (recent migrations)
      if (history.nodeHistory && Array.isArray(history.nodeHistory) && history.nodeHistory.length > 1) {
        const recentChange = history.nodeHistory[1] // Second most recent (current is first)
        const changeTime = new Date(recentChange.startTime)
        const hoursSinceChange = (Date.now() - changeTime.getTime()) / (1000 * 60 * 60)
        
        if (hoursSinceChange < 72) { // Node changes in last 3 days
          alerts.push({
            type: 'node_change',
            podName: history.podName,
            message: `Moved from ${recentChange.nodeName} to ${history.currentNode}`,
            timestamp: changeTime,
            severity: 'low'
          })
        }
      }
    })

    return alerts
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10) // Most recent 10 alerts
  }, [batchHistory])

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconHistory className="w-5 h-5" />
            Pod历史概览
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-muted-foreground">加载Pod历史数据中...</div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error || !stats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconHistory className="w-5 h-5" />
            Pod历史概览
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-muted-foreground">无法加载Pod历史数据</div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <IconServer className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">总Pod数量</div>
                <div className="text-2xl font-bold">{stats.totalPods}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2 rounded-lg",
                stats.podsWithErrors > 0 ? "bg-red-100" : "bg-green-100"
              )}>
                <IconAlertTriangle className={cn(
                  "w-5 h-5",
                  stats.podsWithErrors > 0 ? "text-red-600" : "text-green-600"
                )} />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">异常Pod</div>
                <div className="text-2xl font-bold">{stats.podsWithErrors}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2 rounded-lg",
                stats.totalRestarts > 0 ? "bg-orange-100" : "bg-green-100"
              )}>
                <IconRefresh className={cn(
                  "w-5 h-5",
                  stats.totalRestarts > 0 ? "text-orange-600" : "text-green-600"
                )} />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">总重启次数</div>
                <div className="text-2xl font-bold">{stats.totalRestarts}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <IconTrendingUp className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">使用节点数</div>
                <div className="text-2xl font-bold">{stats.nodesUsed}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Node Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <IconServer className="w-4 h-4" />
                节点分布
              </span>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleRefresh}
                className="h-6 w-6 p-0"
              >
                <IconRefresh className="w-3 h-3" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.nodeDistribution.map(([node, count], index) => (
                <div key={node} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      index === 0 ? "bg-blue-500" : "bg-gray-400"
                    )} />
                    <span className="text-sm font-medium">{node}</span>
                    {index === 0 && (
                      <Badge variant="secondary" className="text-xs">
                        最多
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{count} pods</span>
                    <div className="w-16 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-500 h-2 rounded-full"
                        style={{ width: `${(count / stats.totalPods) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <IconAlertTriangle className="w-4 h-4" />
              最近告警
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {recentAlerts.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4">
                  暂无告警
                </div>
              ) : (
                recentAlerts.map((alert, index) => (
                  <div key={index} className="p-3 rounded-lg bg-muted/50 border-l-2 border-l-orange-500">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant={alert.severity === 'high' ? 'destructive' : 
                                  alert.severity === 'medium' ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {alert.type === 'error' ? '错误' : 
                           alert.type === 'restart' ? '重启' : '迁移'}
                        </Badge>
                        <span className="text-sm font-medium">{alert.podName}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(alert.timestamp, { 
                          addSuffix: true,
                          locale: zhCN 
                        })}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {alert.message}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}