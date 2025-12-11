import { useState, useEffect } from 'react'
import { IconFileCode, IconLoader, IconAlertCircle } from '@tabler/icons-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Button } from './ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { getContainerdConfig, getCNIConfig } from '@/lib/api'
import { apiClient } from '@/lib/api-client'

interface NodeConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  nodeName: string
}

export function NodeConfigDialog({
  open,
  onOpenChange,
  nodeName,
}: NodeConfigDialogProps) {
  const [activeTab, setActiveTab] = useState<'containerd' | 'cni'>('containerd')
  const [containerdConfig, setContainerdConfig] = useState<string>('')
  const [cniConfig, setCniConfig] = useState<string>('')
  const [containerdLoading, setContainerdLoading] = useState(false)
  const [cniLoading, setCniLoading] = useState(false)
  const [containerdError, setContainerdError] = useState<string>('')
  const [cniError, setCniError] = useState<string>('')
  const [containerdPodName, setContainerdPodName] = useState<string>('')
  const [cniPodName, setCniPodName] = useState<string>('')

  // Fetch containerd config
  const fetchContainerdConfig = async () => {
    setContainerdLoading(true)
    setContainerdError('')
    try {
      const result = await getContainerdConfig(nodeName)
      setContainerdPodName(result.pod)

      // Wait a bit for the pod to complete
      await new Promise((resolve) => setTimeout(resolve, 3000))

      // Fetch logs from the pod
      try {
        const logs = await apiClient.get<string>(
          `/pods/kube-system/${result.pod}/logs?container=read-config`
        )
        setContainerdConfig(logs || '配置文件为空或无法读取')
      } catch (logError) {
        setContainerdError('无法获取配置内容，请稍后重试或检查节点权限')
      }
    } catch (error) {
      setContainerdError('获取 containerd 配置失败: ' + (error as Error).message)
    } finally {
      setContainerdLoading(false)
    }
  }

  // Fetch CNI config
  const fetchCNIConfig = async () => {
    setCniLoading(true)
    setCniError('')
    try {
      const result = await getCNIConfig(nodeName)
      setCniPodName(result.pod)

      // Wait a bit for the pod to complete
      await new Promise((resolve) => setTimeout(resolve, 3000))

      // Fetch logs from the pod
      try {
        const logs = await apiClient.get<string>(
          `/pods/kube-system/${result.pod}/logs?container=read-config`
        )
        setCniConfig(logs || '配置文件为空或无法读取')
      } catch (logError) {
        setCniError('无法获取配置内容，请稍后重试或检查节点权限')
      }
    } catch (error) {
      setCniError('获取 CNI 配置失败: ' + (error as Error).message)
    } finally {
      setCniLoading(false)
    }
  }

  // Load config when tab changes
  useEffect(() => {
    if (!open) return

    if (activeTab === 'containerd' && !containerdConfig && !containerdLoading && !containerdError) {
      fetchContainerdConfig()
    } else if (activeTab === 'cni' && !cniConfig && !cniLoading && !cniError) {
      fetchCNIConfig()
    }
  }, [activeTab, open])

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setContainerdConfig('')
      setCniConfig('')
      setContainerdError('')
      setCniError('')
      setActiveTab('containerd')
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconFileCode className="w-5 h-5" />
            节点配置 - {nodeName}
          </DialogTitle>
          <DialogDescription>
            查看节点上的 containerd 和 CNI 配置文件
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'containerd' | 'cni')} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="containerd">Containerd 配置</TabsTrigger>
            <TabsTrigger value="cni">CNI 配置</TabsTrigger>
          </TabsList>

          <TabsContent value="containerd" className="flex-1 overflow-hidden flex flex-col mt-4">
            {containerdLoading ? (
              <div className="flex items-center justify-center py-12">
                <IconLoader className="w-6 h-6 animate-spin mr-2" />
                <span>正在获取 containerd 配置...</span>
              </div>
            ) : containerdError ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <IconAlertCircle className="w-12 h-12 text-red-500" />
                <p className="text-red-600">{containerdError}</p>
                <Button onClick={fetchContainerdConfig} variant="outline">
                  重试
                </Button>
              </div>
            ) : containerdConfig ? (
              <div className="flex-1 overflow-auto">
                <div className="bg-slate-50 border rounded-md p-4">
                  <div className="text-xs text-muted-foreground mb-2">
                    配置来源: /etc/containerd/config.toml
                    {containerdPodName && ` (Pod: ${containerdPodName})`}
                  </div>
                  <pre className="text-xs font-mono whitespace-pre-wrap break-words">
                    {containerdConfig}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center py-12">
                <Button onClick={fetchContainerdConfig}>
                  加载 Containerd 配置
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="cni" className="flex-1 overflow-hidden flex flex-col mt-4">
            {cniLoading ? (
              <div className="flex items-center justify-center py-12">
                <IconLoader className="w-6 h-6 animate-spin mr-2" />
                <span>正在获取 CNI 配置...</span>
              </div>
            ) : cniError ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <IconAlertCircle className="w-12 h-12 text-red-500" />
                <p className="text-red-600">{cniError}</p>
                <Button onClick={fetchCNIConfig} variant="outline">
                  重试
                </Button>
              </div>
            ) : cniConfig ? (
              <div className="flex-1 overflow-auto">
                <div className="bg-slate-50 border rounded-md p-4">
                  <div className="text-xs text-muted-foreground mb-2">
                    配置来源: /etc/cni/net.d/
                    {cniPodName && ` (Pod: ${cniPodName})`}
                  </div>
                  <pre className="text-xs font-mono whitespace-pre-wrap break-words">
                    {cniConfig}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center py-12">
                <Button onClick={fetchCNIConfig}>
                  加载 CNI 配置
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
