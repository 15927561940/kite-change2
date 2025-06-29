// Kubernetes resource templates

export interface ResourceTemplate {
  name: string
  description: string
  yaml: string
}

// CRD resource templates for common use cases
export interface CRTemplate {
  name: string
  description: string
  crdKind: string
  apiVersion: string
  template: Record<string, any>
  fields: TemplateField[]
}

export interface TemplateField {
  key: string
  label: string
  type: 'string' | 'number' | 'boolean' | 'select' | 'namespace'
  required: boolean
  default?: any
  description?: string
  options?: { label: string; value: any }[]
  placeholder?: string
}

export const resourceTemplates: ResourceTemplate[] = [
  {
    name: 'Pod',
    description: 'A basic Pod with a single container',
    yaml: `apiVersion: v1
kind: Pod
metadata:
  name: example-pod
  namespace: default
  labels:
    app: example
spec:
  containers:
  - name: nginx
    image: nginx:1.21
    ports:
    - containerPort: 80
    resources:
      requests:
        memory: "64Mi"
        cpu: "250m"
      limits:
        memory: "128Mi"
        cpu: "500m"`,
  },
  {
    name: 'Deployment',
    description: 'A Deployment with 3 replicas',
    yaml: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: example-deployment
  namespace: default
  labels:
    app: example
spec:
  replicas: 3
  selector:
    matchLabels:
      app: example
  template:
    metadata:
      labels:
        app: example
    spec:
      containers:
      - name: nginx
        image: nginx:1.21
        ports:
        - containerPort: 80
        resources:
          requests:
            memory: "64Mi"
            cpu: "250m"
          limits:
            memory: "128Mi"
            cpu: "500m"`,
  },
  {
    name: 'StatefulSet',
    description: 'A StatefulSet with persistent storage',
    yaml: `apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: example-statefulset
  namespace: default
spec:
  serviceName: "example-service"
  replicas: 3
  selector:
    matchLabels:
      app: example
  template:
    metadata:
      labels:
        app: example
    spec:
      containers:
      - name: nginx
        image: nginx:1.21
        ports:
        - containerPort: 80
        volumeMounts:
        - name: www
          mountPath: /usr/share/nginx/html
        resources:
          requests:
            memory: "64Mi"
            cpu: "250m"
          limits:
            memory: "128Mi"
            cpu: "500m"
  volumeClaimTemplates:
  - metadata:
      name: www
    spec:
      accessModes: [ "ReadWriteOnce" ]
      resources:
        requests:
          storage: 1Gi`,
  },
  {
    name: 'Job',
    description: 'A Job that runs a task to completion',
    yaml: `apiVersion: batch/v1
kind: Job
metadata:
  name: example-job
  namespace: default
spec:
  template:
    spec:
      containers:
      - name: busybox
        image: busybox:1.35
        command: ['sh', '-c']
        args:
        - |
          echo "Starting job..."
          sleep 30
          echo "Job completed successfully!"
        resources:
          requests:
            memory: "32Mi"
            cpu: "100m"
          limits:
            memory: "64Mi"
            cpu: "200m"
      restartPolicy: Never
  backoffLimit: 4`,
  },
  {
    name: 'CronJob',
    description: 'A CronJob that runs on a schedule',
    yaml: `apiVersion: batch/v1
kind: CronJob
metadata:
  name: example-cronjob
  namespace: default
spec:
  schedule: "0 2 * * *"  # Run daily at 2 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: busybox
            image: busybox:1.35
            command: ['sh', '-c']
            args:
            - |
              echo "Running scheduled task..."
              date
              echo "Task completed!"
            resources:
              requests:
                memory: "32Mi"
                cpu: "100m"
              limits:
                memory: "64Mi"
                cpu: "200m"
          restartPolicy: OnFailure`,
  },
  {
    name: 'Service',
    description: 'A Service to expose applications',
    yaml: `apiVersion: v1
kind: Service
metadata:
  name: example-service
  namespace: default
  labels:
    app: example
spec:
  selector:
    app: example
  ports:
  - name: http
    port: 80
    targetPort: 80
    protocol: TCP
  type: ClusterIP`,
  },
  {
    name: 'ConfigMap',
    description: 'A ConfigMap to store configuration data',
    yaml: `apiVersion: v1
kind: ConfigMap
metadata:
  name: example-configmap
  namespace: default
data:
  database_url: "postgresql://localhost:5432/mydb"
  debug: "true"
  max_connections: "100"
  config.yaml: |
    server:
      port: 8080
      host: 0.0.0.0
    logging:
      level: info`,
  },
  {
    name: 'Secret',
    description: 'A Secret to store sensitive data',
    yaml: `apiVersion: v1
kind: Secret
metadata:
  name: example-secret
  namespace: default
type: Opaque
data:
  username: YWRtaW4=  # base64 encoded "admin"
  password: MWYyZDFlMmU2N2Rm  # base64 encoded "1f2d1e2e67df"
stringData:
  database-url: "postgresql://user:pass@localhost:5432/mydb"`,
  },
]

export const getTemplateByName = (
  name: string
): ResourceTemplate | undefined => {
  return resourceTemplates.find((template) => template.name === name)
}

export const getTemplateNames = (): string[] => {
  return resourceTemplates.map((template) => template.name)
}

// Common CRD templates
export const CRD_TEMPLATES: Record<string, CRTemplate[]> = {
  // Argo Rollouts
  'rollouts.argoproj.io': [
    {
      name: 'Basic Rollout',
      description: 'A basic Argo Rollout with blue-green deployment',
      crdKind: 'Rollout',
      apiVersion: 'argoproj.io/v1alpha1',
      template: {
        apiVersion: 'argoproj.io/v1alpha1',
        kind: 'Rollout',
        metadata: {
          name: '{{name}}',
          namespace: '{{namespace}}',
        },
        spec: {
          replicas: '{{replicas}}',
          strategy: {
            blueGreen: {
              activeService: '{{activeService}}',
              previewService: '{{previewService}}',
              autoPromotionEnabled: '{{autoPromotion}}',
              scaleDownDelaySeconds: 30,
            },
          },
          selector: {
            matchLabels: {
              app: '{{name}}',
            },
          },
          template: {
            metadata: {
              labels: {
                app: '{{name}}',
              },
            },
            spec: {
              containers: [
                {
                  name: '{{name}}',
                  image: '{{image}}',
                  ports: [
                    {
                      containerPort: '{{port}}',
                    },
                  ],
                },
              ],
            },
          },
        },
      },
      fields: [
        { key: 'name', label: 'Name', type: 'string', required: true, placeholder: 'my-rollout' },
        { key: 'namespace', label: 'Namespace', type: 'string', required: true, default: 'default' },
        { key: 'replicas', label: 'Replicas', type: 'number', required: true, default: 3 },
        { key: 'image', label: 'Container Image', type: 'string', required: true, placeholder: 'nginx:1.20' },
        { key: 'port', label: 'Container Port', type: 'number', required: true, default: 80 },
        { key: 'activeService', label: 'Active Service', type: 'string', required: true, placeholder: 'my-rollout-active' },
        { key: 'previewService', label: 'Preview Service', type: 'string', required: true, placeholder: 'my-rollout-preview' },
        { key: 'autoPromotion', label: 'Auto Promotion', type: 'boolean', required: false, default: false },
      ],
    },
  ],

  // Istio VirtualService
  'virtualservices.networking.istio.io': [
    {
      name: 'Basic VirtualService',
      description: 'A basic Istio VirtualService for HTTP routing',
      crdKind: 'VirtualService',
      apiVersion: 'networking.istio.io/v1beta1',
      template: {
        apiVersion: 'networking.istio.io/v1beta1',
        kind: 'VirtualService',
        metadata: {
          name: '{{name}}',
          namespace: '{{namespace}}',
        },
        spec: {
          hosts: ['{{host}}'],
          gateways: ['{{gateway}}'],
          http: [
            {
              match: [
                {
                  uri: {
                    prefix: '{{pathPrefix}}',
                  },
                },
              ],
              route: [
                {
                  destination: {
                    host: '{{destinationHost}}',
                    port: {
                      number: '{{destinationPort}}',
                    },
                  },
                },
              ],
            },
          ],
        },
      },
      fields: [
        { key: 'name', label: 'Name', type: 'string', required: true, placeholder: 'my-virtualservice' },
        { key: 'namespace', label: 'Namespace', type: 'string', required: true, default: 'default' },
        { key: 'host', label: 'Host', type: 'string', required: true, placeholder: 'example.com' },
        { key: 'gateway', label: 'Gateway', type: 'string', required: true, placeholder: 'my-gateway' },
        { key: 'pathPrefix', label: 'Path Prefix', type: 'string', required: true, default: '/' },
        { key: 'destinationHost', label: 'Destination Host', type: 'string', required: true, placeholder: 'my-service' },
        { key: 'destinationPort', label: 'Destination Port', type: 'number', required: true, default: 80 },
      ],
    },
  ],

  // Prometheus ServiceMonitor
  'servicemonitors.monitoring.coreos.com': [
    {
      name: 'Basic ServiceMonitor',
      description: 'A basic Prometheus ServiceMonitor for metrics collection',
      crdKind: 'ServiceMonitor',
      apiVersion: 'monitoring.coreos.com/v1',
      template: {
        apiVersion: 'monitoring.coreos.com/v1',
        kind: 'ServiceMonitor',
        metadata: {
          name: '{{name}}',
          namespace: '{{namespace}}',
          labels: {
            app: '{{app}}',
          },
        },
        spec: {
          selector: {
            matchLabels: {
              app: '{{app}}',
            },
          },
          endpoints: [
            {
              port: '{{metricsPort}}',
              interval: '{{interval}}',
              path: '{{metricsPath}}',
            },
          ],
        },
      },
      fields: [
        { key: 'name', label: 'Name', type: 'string', required: true, placeholder: 'my-servicemonitor' },
        { key: 'namespace', label: 'Namespace', type: 'string', required: true, default: 'default' },
        { key: 'app', label: 'App Label', type: 'string', required: true, placeholder: 'my-app' },
        { key: 'metricsPort', label: 'Metrics Port', type: 'string', required: true, default: 'metrics' },
        { key: 'interval', label: 'Scrape Interval', type: 'string', required: true, default: '30s' },
        { key: 'metricsPath', label: 'Metrics Path', type: 'string', required: true, default: '/metrics' },
      ],
    },
  ],

  // Cert-Manager Certificate
  'certificates.cert-manager.io': [
    {
      name: 'Basic Certificate',
      description: 'A basic cert-manager Certificate for TLS',
      crdKind: 'Certificate',
      apiVersion: 'cert-manager.io/v1',
      template: {
        apiVersion: 'cert-manager.io/v1',
        kind: 'Certificate',
        metadata: {
          name: '{{name}}',
          namespace: '{{namespace}}',
        },
        spec: {
          secretName: '{{secretName}}',
          dnsNames: ['{{dnsName}}'],
          issuerRef: {
            name: '{{issuerName}}',
            kind: '{{issuerKind}}',
          },
        },
      },
      fields: [
        { key: 'name', label: 'Name', type: 'string', required: true, placeholder: 'my-certificate' },
        { key: 'namespace', label: 'Namespace', type: 'string', required: true, default: 'default' },
        { key: 'secretName', label: 'Secret Name', type: 'string', required: true, placeholder: 'my-tls-secret' },
        { key: 'dnsName', label: 'DNS Name', type: 'string', required: true, placeholder: 'example.com' },
        { key: 'issuerName', label: 'Issuer Name', type: 'string', required: true, placeholder: 'letsencrypt-prod' },
        { 
          key: 'issuerKind', 
          label: 'Issuer Kind', 
          type: 'select', 
          required: true, 
          default: 'ClusterIssuer',
          options: [
            { label: 'ClusterIssuer', value: 'ClusterIssuer' },
            { label: 'Issuer', value: 'Issuer' },
          ],
        },
      ],
    },
  ],

  // RAG Log Pilot (实际的CRD结构)
  'raglogpilots.log.aiops.com.aiops.com': [
    {
      name: 'RAG Log Pilot Sample',
      description: 'A sample RAG Log Pilot for AI log analysis',
      crdKind: 'RagLogPilot',
      apiVersion: 'log.aiops.com.aiops.com/v1',
      template: {
        apiVersion: 'log.aiops.com.aiops.com/v1',
        kind: 'RagLogPilot',
        metadata: {
          name: '{{name}}',
          namespace: '{{namespace}}',
          labels: {
            'app.kubernetes.io/managed-by': '{{managedBy}}',
            'app.kubernetes.io/name': '{{appName}}',
          },
        },
        spec: {
          workloadNameSpace: '{{workloadNameSpace}}',
          ragFlowEndpoint: '{{ragFlowEndpoint}}',
          ragFlowToken: '{{ragFlowToken}}',
          chatId: '{{chatId}}',
          chatName: '{{chatName}}',
          feishuWebhook: '{{feishuWebhook}}',
          alertInterval: '{{alertInterval}}',
        },
      },
      fields: [
        { key: 'name', label: '资源名称', type: 'string', required: true, default: 'raglogpilot-sample-2', placeholder: 'raglogpilot-sample-2' },
        { key: 'namespace', label: 'Namespace', type: 'namespace', required: false, default: 'default', description: 'Kubernetes namespace (可选，默认为default)' },
        { key: 'workloadNameSpace', label: '监控的工作负载命名空间', type: 'namespace', required: true, default: 'default', description: '需要监控Pod日志的命名空间' },
        { key: 'ragFlowEndpoint', label: 'RAG Flow API 端点', type: 'string', required: true, default: 'http://172.16.0.111/v1/api', placeholder: 'http://172.16.0.111/v1/api' },
        { key: 'ragFlowToken', label: 'RAG Flow Token', type: 'string', required: true, default: 'ragflow-IyNDQyMDYyNGI3YTExZjBhMzAzMDI0Mm', placeholder: 'ragflow-xxx' },
        { key: 'chatId', label: 'Chat ID', type: 'string', required: false, default: '', placeholder: '可选：指定具体的Chat ID', description: '指定具体的Chat ID（可选，如果不指定会使用第一个可用的chat）' },
        { key: 'chatName', label: 'Chat Name', type: 'string', required: false, default: '', placeholder: '可选：指定Chat名称', description: '指定Chat名称（可选，如果指定了Chat ID则忽略此字段）' },
        { key: 'feishuWebhook', label: '飞书Webhook URL', type: 'string', required: false, default: '', placeholder: '可选：https://open.feishu.cn/xxx', description: '飞书机器人Webhook URL（可选）' },
        { key: 'alertInterval', label: '告警间隔', type: 'string', required: false, default: '5m', placeholder: '5m', description: '告警间隔时间，如 5m, 10m, 30m' },
        { key: 'managedBy', label: 'Managed By', type: 'string', required: false, default: 'kite', description: '资源管理标签' },
        { key: 'appName', label: 'App Name', type: 'string', required: false, default: 'ragflow-ziji-zhishiku', description: '应用名称标签' },
      ],
    },
  ],

  // Generic template for unknown CRDs
  'default': [
    {
      name: '基础自定义资源',
      description: '通用的自定义资源模板，可以创建任何CRD实例',
      crdKind: 'CustomResource',
      apiVersion: 'example.com/v1',
      template: {
        apiVersion: '{{apiVersion}}',
        kind: '{{kind}}',
        metadata: {
          name: '{{name}}',
          namespace: '{{namespace}}',
          labels: {
            'app.kubernetes.io/managed-by': '{{managedBy}}',
            'app.kubernetes.io/name': '{{appName}}',
          },
        },
        spec: {
          replicas: '{{replicas}}',
        },
      },
      fields: [
        { key: 'name', label: '资源名称', type: 'string', required: true, placeholder: 'my-custom-resource' },
        { key: 'namespace', label: 'Namespace', type: 'namespace', required: false, default: 'default', description: 'Kubernetes namespace (可选，集群级别资源无需指定)' },
        { key: 'kind', label: 'Kind', type: 'string', required: true, placeholder: 'MyCustomResource', description: 'CRD的Kind名称' },
        { key: 'apiVersion', label: 'API Version', type: 'string', required: true, placeholder: 'example.com/v1', description: 'CRD的API版本' },
        { key: 'replicas', label: 'Replicas', type: 'number', required: false, default: 1, description: '副本数（如果CRD支持）' },
        { key: 'managedBy', label: 'Managed By', type: 'string', required: false, default: 'kite', description: '资源管理标签' },
        { key: 'appName', label: 'App Name', type: 'string', required: false, default: 'custom-app', description: '应用名称标签' },
      ],
    },
    {
      name: '自定义YAML模板',
      description: '使用自定义YAML创建任何CRD资源',
      crdKind: 'CustomYaml',
      apiVersion: 'custom/v1',
      template: {
        apiVersion: '{{apiVersion}}',
        kind: '{{kind}}',
        metadata: {
          name: '{{name}}',
          namespace: '{{namespace}}',
        },
        spec: {},
      },
      fields: [
        { key: 'name', label: '资源名称', type: 'string', required: true, placeholder: 'my-resource' },
        { key: 'namespace', label: 'Namespace', type: 'namespace', required: false, default: 'default', description: 'Kubernetes namespace (可选)' },
        { key: 'kind', label: 'Kind', type: 'string', required: true, placeholder: 'MyKind', description: 'CRD的Kind名称' },
        { key: 'apiVersion', label: 'API Version', type: 'string', required: true, placeholder: 'group.example.com/v1', description: 'CRD的完整API版本' },
      ],
    },
  ],
}

// Get templates for a specific CRD
export function getTemplatesForCRD(crdName: string): CRTemplate[] {
  return CRD_TEMPLATES[crdName] || CRD_TEMPLATES['default']
}

// Apply template values to generate final resource
export function applyTemplate(template: CRTemplate, values: Record<string, any>): Record<string, any> {
  const templateStr = JSON.stringify(template.template)
  let result = templateStr
  
  // Replace template variables
  template.fields.forEach(field => {
    const value = values[field.key] !== undefined ? values[field.key] : field.default
    const regex = new RegExp(`{{${field.key}}}`, 'g')
    result = result.replace(regex, String(value || ''))
  })
  
  try {
    const parsed = JSON.parse(result)
    
    // Clean up empty optional fields from spec
    if (parsed.spec) {
      const cleanedSpec: Record<string, any> = {}
      template.fields.forEach(field => {
        const value = values[field.key] !== undefined ? values[field.key] : field.default
        if (field.required || (value !== undefined && value !== null && value !== '')) {
          cleanedSpec[field.key] = value
        }
      })
      
      // Special handling for metadata fields
      const metadataFields = ['name', 'namespace', 'managedBy', 'appName']
      metadataFields.forEach(field => {
        if (cleanedSpec[field] !== undefined) {
          delete cleanedSpec[field]
        }
      })
      
      parsed.spec = cleanedSpec
    }
    
    return parsed
  } catch (error) {
    console.error('Failed to parse template result:', error)
    throw new Error('Template parsing failed')
  }
}

// Validate template field values
export function validateTemplateValues(template: CRTemplate, values: Record<string, any>): string[] {
  const errors: string[] = []
  
  template.fields.forEach(field => {
    const value = values[field.key]
    
    if (field.required && (value === undefined || value === null || value === '')) {
      errors.push(`${field.label} is required`)
    }
    
    if (value !== undefined && value !== null && value !== '') {
      switch (field.type) {
        case 'number':
          if (isNaN(Number(value))) {
            errors.push(`${field.label} must be a valid number`)
          }
          break
        case 'boolean':
          if (typeof value !== 'boolean') {
            errors.push(`${field.label} must be true or false`)
          }
          break
      }
    }
  })
  
  return errors
}
