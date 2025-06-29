import { useState, useEffect } from 'react'
import { IconPlus, IconLoader, IconCheck } from '@tabler/icons-react'
import { toast } from 'sonner'

import { createCRResource, useResources } from '@/lib/api'
import {
  getTemplatesForCRD,
  applyTemplate,
  validateTemplateValues,
  CRTemplate,
  TemplateField,
} from '@/lib/templates'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface CRCreateDialogProps {
  crdName: string
  crdData?: any
  onSuccess?: () => void
}

export function CRCreateDialog({
  crdName,
  crdData,
  onSuccess,
}: CRCreateDialogProps) {
  const [open, setOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<CRTemplate | null>(null)
  const [formValues, setFormValues] = useState<Record<string, any>>({})
  const [isCreating, setIsCreating] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  
  // Special state for LogPilot dynamic logAlerts
  const [logAlerts, setLogAlerts] = useState<Array<{appSelector: string, logPattern: string, alertInterval?: number}>>([
    { appSelector: 'app="log-generator"', logPattern: 'ERROR', alertInterval: 60 }
  ])

  const templates = getTemplatesForCRD(crdName)
  
  // Fetch namespaces for namespace selector
  const { data: namespaces } = useResources('namespaces', undefined, {
    staleTime: 30000, // Cache for 30 seconds
  })
  const defaultNamespace = crdData?.spec?.scope === 'Cluster' ? undefined : 'default'

  // Initialize form with default values when template changes
  useEffect(() => {
    if (selectedTemplate) {
      const defaultValues: Record<string, any> = {}
      selectedTemplate.fields.forEach(field => {
        // 优先使用字段的默认值
        if (field.default !== undefined && field.default !== null && field.default !== '') {
          defaultValues[field.key] = field.default
        } else if (field.type === 'number') {
          defaultValues[field.key] = field.default || 0
        } else if (field.type === 'boolean') {
          defaultValues[field.key] = field.default || false
        } else {
          // 对于string类型，如果没有默认值则留空，让用户手动填写或使用Tab补全
          defaultValues[field.key] = ''
        }
        
        // Set default namespace for namespaced resources
        if (field.key === 'namespace' && defaultNamespace && !field.default) {
          defaultValues[field.key] = defaultNamespace
        }
      })
      
      console.log('Setting default values:', defaultValues)
      setFormValues(defaultValues)
      setValidationErrors([])
    }
  }, [selectedTemplate, defaultNamespace])

  // Handle Tab key for auto-completion
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, field: TemplateField) => {
    if (e.key === 'Tab' && field.placeholder && !formValues[field.key]) {
      e.preventDefault()
      setFormValues(prev => ({ ...prev, [field.key]: field.placeholder }))
    }
  }

  const handleFieldChange = (fieldKey: string, value: any) => {
    setFormValues(prev => ({ ...prev, [fieldKey]: value }))
    
    // Clear validation errors when user starts typing
    if (validationErrors.length > 0) {
      setValidationErrors([])
    }
  }

  const handleCreate = async () => {
    if (!selectedTemplate) return

    // Validate form
    const errors = validateTemplateValues(selectedTemplate, formValues)
    if (errors.length > 0) {
      setValidationErrors(errors)
      return
    }

    setIsCreating(true)
    
    // Prepare variables for error logging
    let resource: any = undefined
    let namespaceForApi: string | undefined = undefined
    
    try {
      // For LogPilot, merge logAlerts data
      const finalValues = selectedTemplate.crdKind === 'LogPilot' 
        ? { ...formValues, logAlerts }
        : formValues
      
      // Apply template to generate resource
      resource = applyTemplate(selectedTemplate, finalValues)
      
      // Determine namespace for API call
      namespaceForApi = crdData?.spec?.scope === 'Cluster' 
        ? undefined 
        : formValues.namespace || defaultNamespace

      // Create the resource using CRD API
      await createCRResource(crdName, namespaceForApi, resource)
      
      toast.success(`${selectedTemplate.crdKind} created successfully`)
      setOpen(false)
      setSelectedTemplate(null)
      setFormValues({})
      setValidationErrors([])
      
      if (onSuccess) {
        onSuccess()
      }
    } catch (error) {
      console.error('Failed to create custom resource:', error)
      
      // Ensure namespace is set for error logging
      if (!namespaceForApi) {
        namespaceForApi = crdData?.spec?.scope === 'Cluster' 
          ? undefined 
          : formValues.namespace || defaultNamespace
      }
      
      console.error('Request details:', {
        crdName,
        namespace: namespaceForApi,
        resource: resource || 'resource generation failed',
        endpoint: namespaceForApi ? `/${crdName}/${namespaceForApi}` : `/${crdName}/_all`
      })
      
      let errorMessage = 'Unknown error'
      if (error instanceof Error) {
        errorMessage = error.message
        console.error('Error stack:', error.stack)
      }
      
      // 如果是网络错误，尝试提供更多信息
      if (error && typeof error === 'object' && 'response' in error) {
        const response = (error as any).response
        console.error('Response status:', response?.status)
        console.error('Response data:', response?.data)
        errorMessage = `HTTP ${response?.status}: ${response?.data?.message || response?.statusText || errorMessage}`
      }
      
      toast.error(
        `Failed to create ${selectedTemplate.crdKind}: ${errorMessage}`,
        {
          duration: 10000, // 显示10秒以便用户看到完整错误
          description: `Endpoint: ${namespaceForApi ? `/${crdName}/${namespaceForApi}` : `/${crdName}/_all`}`
        }
      )
    } finally {
      setIsCreating(false)
    }
  }

  const renderField = (field: TemplateField) => {
    const value = formValues[field.key]
    const hasError = validationErrors.some(error => error.includes(field.label))

    switch (field.type) {
      case 'boolean':
        return (
          <div key={field.key} className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor={field.key}>
                {field.label}
                {field.required && <span className="text-destructive ml-1">*</span>}
              </Label>
              {field.description && (
                <p className="text-xs text-muted-foreground">{field.description}</p>
              )}
            </div>
            <Switch
              id={field.key}
              checked={value || false}
              onCheckedChange={checked => handleFieldChange(field.key, checked)}
            />
          </div>
        )

      case 'select':
        return (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={field.key}>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            {field.description && (
              <p className="text-xs text-muted-foreground">{field.description}</p>
            )}
            <Select
              value={value || ''}
              onValueChange={val => handleFieldChange(field.key, val)}
            >
              <SelectTrigger className={hasError ? 'border-destructive' : ''}>
                <SelectValue placeholder={`Select ${field.label}`} />
              </SelectTrigger>
              <SelectContent>
                {field.options?.map(option => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )

      case 'number':
        return (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={field.key}>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            {field.description && (
              <p className="text-xs text-muted-foreground">{field.description}</p>
            )}
            <Input
              id={field.key}
              type="number"
              placeholder={field.placeholder}
              value={value || ''}
              onChange={e => handleFieldChange(field.key, Number(e.target.value) || '')}
              className={hasError ? 'border-destructive' : ''}
            />
          </div>
        )

      case 'namespace':
        return (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={field.key}>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            {field.description && (
              <p className="text-xs text-muted-foreground">{field.description}</p>
            )}
            <Select
              value={value || ''}
              onValueChange={val => handleFieldChange(field.key, val)}
            >
              <SelectTrigger className={hasError ? 'border-destructive' : ''}>
                <SelectValue placeholder={`Select ${field.label}`} />
              </SelectTrigger>
              <SelectContent>
                {namespaces?.map((ns: any) => (
                  <SelectItem key={ns.metadata.name} value={ns.metadata.name}>
                    {ns.metadata.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )

      default: // string
        return (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={field.key}>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            {field.description && (
              <p className="text-xs text-muted-foreground">{field.description}</p>
            )}
            <Input
              id={field.key}
              placeholder={field.placeholder ? `${field.placeholder} (Tab键快速填充)` : undefined}
              value={value || ''}
              onChange={e => handleFieldChange(field.key, e.target.value)}
              onKeyDown={e => handleKeyDown(e, field)}
              className={hasError ? 'border-destructive' : ''}
            />
            {field.placeholder && !value && (
              <p className="text-xs text-muted-foreground">
                提示：按Tab键快速填充 "{field.placeholder}"
              </p>
            )}
          </div>
        )
    }
  }

  // Special LogPilot form renderer with dynamic logAlerts
  const renderLogPilotForm = () => {
    const basicFields = selectedTemplate?.fields.filter(field => 
      !field.key.startsWith('appSelector') && 
      !field.key.startsWith('logPattern') && 
      !field.key.startsWith('alertInterval') &&
      field.key !== 'managedBy' &&
      field.key !== 'appName'
    ) || []

    const addLogAlert = () => {
      setLogAlerts([...logAlerts, { appSelector: '', logPattern: '', alertInterval: undefined }])
    }

    const removeLogAlert = (index: number) => {
      setLogAlerts(logAlerts.filter((_, i) => i !== index))
    }

    const updateLogAlert = (index: number, field: string, value: any) => {
      const updated = [...logAlerts]
      updated[index] = { ...updated[index], [field]: value }
      setLogAlerts(updated)
    }

    return (
      <div className="space-y-6">
        {/* Basic Configuration */}
        <div className="space-y-6">
          <h3 className="text-lg font-medium">基础配置</h3>
          <div className="grid grid-cols-1 gap-6">
            {basicFields.map(renderField)}
          </div>
        </div>

        {/* Log Alerts Section */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">日志告警规则</h3>
            <Button type="button" variant="outline" size="sm" onClick={addLogAlert}>
              <IconPlus className="w-4 h-4 mr-2" />
              添加告警规则
            </Button>
          </div>
          
          <div className="space-y-6">
            {logAlerts.map((alert, index) => (
              <Card key={index} className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h4 className="font-medium text-base">告警规则 {index + 1}</h4>
                  {logAlerts.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeLogAlert(index)}
                      className="text-destructive hover:text-destructive"
                    >
                      删除
                    </Button>
                  )}
                </div>
                
                <div className="grid grid-cols-1 gap-6">
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">应用选择器 *</Label>
                    <Input
                      placeholder='app="my-app"'
                      value={alert.appSelector}
                      onChange={e => updateLogAlert(index, 'appSelector', e.target.value)}
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground">
                      Loki标签选择器，如: app="my-app"
                    </p>
                  </div>
                  
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">日志模式 *</Label>
                    <Input
                      placeholder="ERROR"
                      value={alert.logPattern}
                      onChange={e => updateLogAlert(index, 'logPattern', e.target.value)}
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground">
                      要匹配的日志模式，如: ERROR, WARN
                    </p>
                  </div>
                  
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">告警间隔(秒)</Label>
                    <Input
                      type="number"
                      placeholder="60"
                      value={alert.alertInterval || ''}
                      onChange={e => updateLogAlert(index, 'alertInterval', e.target.value ? Number(e.target.value) : undefined)}
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground">
                      可选，覆盖全局设置
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <IconPlus className="w-4 h-4 mr-2" />
          Create {crdData?.spec?.names?.kind || 'Resource'}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Create {crdData?.spec?.names?.kind || 'Custom Resource'}
          </DialogTitle>
          <DialogDescription>
            Choose a template and configure the parameters to create a new{' '}
            {crdData?.spec?.names?.kind || 'custom resource'}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Template Selection */}
          <div className="space-y-3">
            <Label>Template</Label>
            <div className="grid grid-cols-1 gap-3">
              {templates.map(template => (
                <Card
                  key={template.name}
                  className={`cursor-pointer transition-colors ${
                    selectedTemplate?.name === template.name
                      ? 'ring-2 ring-primary bg-primary/5'
                      : 'hover:bg-muted/50'
                  }`}
                  onClick={() => setSelectedTemplate(template)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">{template.name}</CardTitle>
                      {selectedTemplate?.name === template.name && (
                        <IconCheck className="w-4 h-4 text-primary" />
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-xs text-muted-foreground">
                      {template.description}
                    </p>
                    <div className="flex gap-2 mt-2">
                      <Badge variant="outline" className="text-xs">
                        {template.crdKind}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {template.apiVersion}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Form Fields */}
          {selectedTemplate && (
            <div className="space-y-4">
              <Label className="text-sm font-medium">Configuration</Label>
              <div className="space-y-4">
                {selectedTemplate.crdKind === 'LogPilot' ? renderLogPilotForm() : selectedTemplate.fields.map(renderField)}
              </div>

              {/* Validation Errors */}
              {validationErrors.length > 0 && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
                  <div className="text-sm text-destructive font-medium mb-1">
                    Please fix the following errors:
                  </div>
                  <ul className="text-sm text-destructive space-y-1">
                    {validationErrors.map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!selectedTemplate || isCreating}
          >
            {isCreating ? (
              <>
                <IconLoader className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <IconPlus className="w-4 h-4 mr-2" />
                Create
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}