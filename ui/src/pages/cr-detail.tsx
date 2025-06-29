import { useEffect, useState } from 'react'
import {
  IconLoader,
  IconRefresh,
  IconReload,
  IconScale,
  IconTrash,
} from '@tabler/icons-react'
import * as yaml from 'js-yaml'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import {
  deleteResource,
  restartCR,
  scaleCR,
  updateResource,
  useCRRelated,
  useCREvents,
  useResource,
  useResources,
} from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { CustomResource } from '@/types/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ResponsiveTabs } from '@/components/ui/responsive-tabs'
import { DeleteConfirmationDialog } from '@/components/delete-confirmation-dialog'
import { LabelsAnno } from '@/components/lables-anno'
import { LogViewer } from '@/components/log-viewer'
import { PodMonitoring } from '@/components/pod-monitoring'
import { PodTable } from '@/components/pod-table'
import { ServiceTable } from '@/components/service-table'
import { Terminal } from '@/components/terminal'
import { YamlEditor } from '@/components/yaml-editor'

export function CRDetail(props: { 
  crd: string
  namespace?: string
  name: string 
}) {
  const { crd, namespace, name } = props
  const [scaleReplicas, setScaleReplicas] = useState<number>(1)
  const [yamlContent, setYamlContent] = useState('')
  const [isSavingYaml, setIsSavingYaml] = useState(false)
  const [isScalePopoverOpen, setIsScalePopoverOpen] = useState(false)
  const [isRestartPopoverOpen, setIsRestartPopoverOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [refreshInterval, setRefreshInterval] = useState<number>(0)
  const navigate = useNavigate()

  // Fetch custom resource data
  const {
    data: customResource,
    isLoading: isLoadingCR,
    isError: isCRError,
    error: crError,
    refetch: refetchCR,
  } = useResource(crd as any, name, namespace, {
    refreshInterval,
  })

  // Fetch related resources
  const { data: relatedResources, isLoading: isLoadingRelated } =
    useCRRelated(crd, namespace, name, {
      refreshInterval,
    })

  // Fetch events
  const { data: eventsData } = useCREvents(crd, namespace, name, {
    refreshInterval,
  })

  // Get label selector from CR labels for finding related pods
  const labelSelector = customResource?.metadata?.labels
    ? Object.entries(customResource.metadata.labels)
        .map(([key, value]) => `${key}=${value}`)
        .join(',')
    : undefined

  const { data: relatedPods } = useResources('pods', namespace, {
    labelSelector,
    refreshInterval,
    disable: !customResource?.metadata?.labels,
  })

  useEffect(() => {
    if (customResource) {
      setYamlContent(yaml.dump(customResource, { indent: 2 }))
      // Try to get replicas from spec
      const spec = (customResource as CustomResource).spec
      if (spec && typeof spec === 'object' && 'replicas' in spec) {
        setScaleReplicas((spec as any).replicas || 1)
      }
    }
  }, [customResource])

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1)
    refetchCR()
  }

  const handleSaveYaml = async (content: CustomResource) => {
    setIsSavingYaml(true)
    try {
      await updateResource(crd as any, name, namespace, content)
      toast.success('YAML saved successfully')
      setRefreshInterval(1000)
    } catch (error) {
      console.error('Failed to save YAML:', error)
      toast.error(
        `Failed to save YAML: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      )
    } finally {
      setIsSavingYaml(false)
    }
  }

  const handleYamlChange = (content: string) => {
    setYamlContent(content)
  }

  const handleScale = async () => {
    try {
      await scaleCR(crd, namespace, name, scaleReplicas)
      toast.success(`Custom Resource scaled to ${scaleReplicas} replicas`)
      setIsScalePopoverOpen(false)
      setRefreshInterval(1000)
    } catch (error) {
      console.error('Failed to scale custom resource:', error)
      toast.error(
        `Failed to scale custom resource: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      )
    }
  }

  const handleRestart = async () => {
    try {
      await restartCR(crd, namespace, name)
      toast.success('Custom Resource restarted successfully')
      setRefreshInterval(1000)
    } catch (error) {
      console.error('Failed to restart custom resource:', error)
      toast.error(
        `Failed to restart custom resource: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      )
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await deleteResource(crd as any, name, namespace)
      toast.success('Custom Resource deleted successfully')

      // Navigate back to the CRD list page
      navigate(`/crds/${crd}`)
    } catch (error) {
      toast.error(
        `Failed to delete custom resource: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      )
    } finally {
      setIsDeleting(false)
      setIsDeleteDialogOpen(false)
    }
  }

  const getCRStatus = (cr: CustomResource) => {
    const status = cr.status
    if (!status) return 'Unknown'
    
    // Try to extract status from common patterns
    if (typeof status === 'object') {
      if ('phase' in status && typeof status.phase === 'string') {
        return status.phase
      }
      if ('conditions' in status && Array.isArray(status.conditions)) {
        const readyCondition = status.conditions.find(
          (c: any) => c.type === 'Ready' || c.type === 'Available'
        )
        if (readyCondition) {
          return readyCondition.status === 'True' ? 'Ready' : 'Not Ready'
        }
      }
      if ('ready' in status && typeof status.ready === 'boolean') {
        return status.ready ? 'Ready' : 'Not Ready'
      }
    }
    
    return 'Unknown'
  }

  const getReplicasInfo = (cr: CustomResource) => {
    const spec = cr.spec
    const status = cr.status
    
    let desired = 0
    let ready = 0
    let current = 0
    
    if (spec && typeof spec === 'object' && 'replicas' in spec) {
      desired = (spec as any).replicas || 0
    }
    
    if (status && typeof status === 'object') {
      if ('readyReplicas' in status) {
        ready = (status as any).readyReplicas || 0
      }
      if ('replicas' in status) {
        current = (status as any).replicas || 0
      }
      // If no readyReplicas, try to use current replicas
      if (ready === 0 && current > 0) {
        ready = current
      }
    }
    
    return { desired, ready, current }
  }

  const supportsScaling = (cr: CustomResource) => {
    return cr.spec && typeof cr.spec === 'object' && 'replicas' in cr.spec
  }

  if (isLoadingCR) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center gap-2">
              <IconLoader className="animate-spin" />
              <span>Loading custom resource details...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isCRError || !customResource) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-destructive">
              Error loading custom resource:{' '}
              {crError?.message || 'Custom resource not found'}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const status = getCRStatus(customResource)
  const replicasInfo = getReplicasInfo(customResource)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{name}</h1>
          <p className="text-muted-foreground">
            Kind: <span className="font-medium">{customResource.kind}</span>
            {namespace && (
              <>
                {' | '}Namespace: <span className="font-medium">{namespace}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <IconRefresh className="w-4 h-4" />
            Refresh
          </Button>
          {supportsScaling(customResource) && (
            <Popover
              open={isScalePopoverOpen}
              onOpenChange={setIsScalePopoverOpen}
            >
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <IconScale className="w-4 h-4" />
                  Scale
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80" align="end">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="font-medium">Scale Custom Resource</h4>
                    <p className="text-sm text-muted-foreground">
                      Adjust the number of replicas for this custom resource.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="replicas">Replicas</Label>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 w-9 p-0"
                        onClick={() =>
                          setScaleReplicas(Math.max(0, scaleReplicas - 1))
                        }
                        disabled={scaleReplicas <= 0}
                      >
                        -
                      </Button>
                      <Input
                        id="replicas"
                        type="number"
                        min="0"
                        value={scaleReplicas}
                        onChange={(e) =>
                          setScaleReplicas(parseInt(e.target.value) || 0)
                        }
                        className="text-center"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 w-9 p-0"
                        onClick={() => setScaleReplicas(scaleReplicas + 1)}
                      >
                        +
                      </Button>
                    </div>
                  </div>
                  <Button onClick={handleScale} className="w-full">
                    <IconScale className="w-4 h-4 mr-2" />
                    Scale
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          )}
          <Popover
            open={isRestartPopoverOpen}
            onOpenChange={setIsRestartPopoverOpen}
          >
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <IconReload className="w-4 h-4" />
                Restart
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-4">
                <div className="space-y-2">
                  <h4 className="font-medium">Restart Custom Resource</h4>
                  <p className="text-sm text-muted-foreground">
                    This will add a restart annotation to trigger a restart.
                    This action cannot be undone.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setIsRestartPopoverOpen(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      handleRestart()
                      setIsRestartPopoverOpen(false)
                    }}
                    className="flex-1"
                  >
                    <IconReload className="w-4 h-4 mr-2" />
                    Restart
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setIsDeleteDialogOpen(true)}
            disabled={isDeleting}
          >
            <IconTrash className="w-4 h-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <ResponsiveTabs
        tabs={[
          {
            value: 'overview',
            label: 'Overview',
            content: (
              <div className="space-y-4">
                {/* Status Overview */}
                <Card>
                  <CardHeader>
                    <CardTitle>Status Overview</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                      <div>
                        <p className="text-xs text-muted-foreground">Status</p>
                        <Badge variant={status === 'Ready' ? 'default' : 'secondary'}>
                          {status}
                        </Badge>
                      </div>

                      {supportsScaling(customResource) && (
                        <>
                          <div>
                            <p className="text-xs text-muted-foreground">
                              Ready Replicas
                            </p>
                            <p className="text-sm font-medium">
                              {replicasInfo.ready} / {replicasInfo.desired}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs text-muted-foreground">
                              Current Replicas
                            </p>
                            <p className="text-sm font-medium">
                              {replicasInfo.current}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs text-muted-foreground">
                              Desired Replicas
                            </p>
                            <p className="text-sm font-medium">
                              {replicasInfo.desired}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Custom Resource Info */}
                <Card>
                  <CardHeader>
                    <CardTitle>Custom Resource Information</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          Created
                        </Label>
                        <p className="text-sm">
                          {formatDate(
                            customResource.metadata?.creationTimestamp || '',
                            true
                          )}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          API Version
                        </Label>
                        <p className="text-sm">{customResource.apiVersion}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          Kind
                        </Label>
                        <p className="text-sm">{customResource.kind}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          UID
                        </Label>
                        <p className="text-sm font-mono text-xs">
                          {customResource.metadata?.uid}
                        </p>
                      </div>
                    </div>
                    <LabelsAnno
                      labels={customResource.metadata?.labels || {}}
                      annotations={customResource.metadata?.annotations || {}}
                    />
                  </CardContent>
                </Card>

                {/* Status Details */}
                {customResource.status && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Status Details</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="text-xs bg-muted p-3 rounded overflow-auto">
                        {JSON.stringify(customResource.status, null, 2)}
                      </pre>
                    </CardContent>
                  </Card>
                )}
              </div>
            ),
          },
          {
            value: 'yaml',
            label: 'YAML',
            content: (
              <YamlEditor<any>
                key={refreshKey}
                value={yamlContent}
                title="YAML Configuration"
                onSave={handleSaveYaml}
                onChange={handleYamlChange}
                isSaving={isSavingYaml}
              />
            ),
          },
          ...(relatedPods && relatedPods.length > 0
            ? [
                {
                  value: 'pods',
                  label: (
                    <>
                      Pods{' '}
                      <Badge variant="secondary">{relatedPods.length}</Badge>
                    </>
                  ),
                  content: (
                    <PodTable
                      pods={relatedPods}
                      isLoading={isLoadingRelated}
                      labelSelector={labelSelector}
                    />
                  ),
                },
                {
                  value: 'logs',
                  label: 'Logs',
                  content: (
                    <div className="space-y-6">
                      <LogViewer
                        namespace={namespace!}
                        pods={relatedPods}
                        containers={
                          relatedPods?.[0]?.spec?.containers?.map(
                            (container) => ({
                              name: container.name,
                              image: container.image || '',
                            })
                          ) || []
                        }
                      />
                    </div>
                  ),
                },
                {
                  value: 'terminal',
                  label: 'Terminal',
                  content: (
                    <div className="space-y-6">
                      {relatedPods && relatedPods.length > 0 && (
                        <Terminal
                          namespace={namespace!}
                          pods={relatedPods}
                          containers={
                            relatedPods[0].spec?.containers?.map(
                              (container) => ({
                                name: container.name,
                                image: container.image || '',
                              })
                            ) || []
                          }
                        />
                      )}
                    </div>
                  ),
                },
                {
                  value: 'monitor',
                  label: 'Monitor',
                  content: (
                    <PodMonitoring
                      namespace={namespace!}
                      pods={relatedPods}
                      containers={relatedPods?.[0]?.spec?.containers || []}
                      labelSelector={labelSelector}
                    />
                  ),
                },
              ]
            : []),
          ...(relatedResources?.services && relatedResources.services.length > 0
            ? [
                {
                  value: 'services',
                  label: (
                    <>
                      Services{' '}
                      <Badge variant="secondary">
                        {relatedResources.services.length}
                      </Badge>
                    </>
                  ),
                  content: (
                    <ServiceTable
                      services={relatedResources.services}
                      isLoading={isLoadingRelated}
                    />
                  ),
                },
              ]
            : []),
          {
            value: 'events',
            label: 'Events',
            content: (
              <div>
                {eventsData?.events && eventsData.events.length > 0 ? (
                  <div className="space-y-2">
                    {eventsData.events.map((event: any, index: number) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 p-2 border rounded"
                      >
                        <Badge
                          variant={
                            event.type === 'Normal' ? 'default' : 'destructive'
                          }
                        >
                          {event.type}
                        </Badge>
                        <span className="text-sm">{event.message}</span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {formatDate(event.firstTimestamp || event.eventTime)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    No events found for this custom resource.
                  </div>
                )}
              </div>
            ),
          },
        ]}
      />

      <DeleteConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={handleDelete}
        resourceName={name}
        resourceType="custom resource"
        namespace={namespace}
        isDeleting={isDeleting}
      />
    </div>
  )
}