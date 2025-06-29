package resources

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/zxh326/kite/pkg/kube"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/klog/v2"
	"sigs.k8s.io/controller-runtime/pkg/client"
)

type DeploymentHandler struct {
	*GenericResourceHandler[*appsv1.Deployment, *appsv1.DeploymentList]
}

func NewDeploymentHandler(client *kube.K8sClient) *DeploymentHandler {
	return &DeploymentHandler{
		GenericResourceHandler: NewGenericResourceHandler[*appsv1.Deployment, *appsv1.DeploymentList](
			client,
			"deployments",
			false, // Deployments are namespaced resources
			true,
		),
	}
}

func (h *DeploymentHandler) Restart(ctx context.Context, namespace, name string) error {
	var deployment appsv1.Deployment
	if err := h.K8sClient.Client.Get(ctx, types.NamespacedName{Namespace: namespace, Name: name}, &deployment); err != nil {
		return err
	}
	if deployment.Spec.Template.Annotations == nil {
		deployment.Spec.Template.Annotations = make(map[string]string)
	}
	deployment.Spec.Template.Annotations["kite.kubernetes.io/restartedAt"] = time.Now().Format(time.RFC3339)
	return h.K8sClient.Client.Update(ctx, &deployment)
}

func (h *DeploymentHandler) RestartDeployment(c *gin.Context) {
	namespace := c.Param("namespace")
	name := c.Param("name")
	ctx := c.Request.Context()

	if err := h.Restart(ctx, namespace, name); err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Deployment not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to restart deployment: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Deployment restarted successfully",
	})
}

// ListDeploymentRelatedResources lists resources related to a deployment
// such as pods, services, etc..
func (h *DeploymentHandler) ListDeploymentRelatedResources(c *gin.Context) {
	namespace := c.Param("namespace")
	name := c.Param("name")
	ctx := c.Request.Context()

	// First, get the deployment to access its labels
	var deployment appsv1.Deployment
	if err := h.K8sClient.Client.Get(ctx, types.NamespacedName{Namespace: namespace, Name: name}, &deployment); err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Deployment not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Get deployment selector labels to find related resources
	selector := deployment.Spec.Selector
	if selector == nil || selector.MatchLabels == nil {
		c.JSON(http.StatusOK, gin.H{
			"services": []corev1.Service{},
		})
		return
	}

	// Find related services (services that may select this deployment's pods)
	var serviceList corev1.ServiceList
	serviceListOpts := &client.ListOptions{
		Namespace: namespace,
	}
	if err := h.K8sClient.Client.List(ctx, &serviceList, serviceListOpts); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list services: " + err.Error()})
		return
	}

	// Filter services that select the deployment's pods
	var relatedServices []corev1.Service
	for _, service := range serviceList.Items {
		if service.Spec.Selector != nil {
			serviceSelector := labels.SelectorFromSet(service.Spec.Selector)
			// Check if the service selector matches any of the deployment's pod labels
			if serviceSelector.Matches(labels.Set(selector.MatchLabels)) {
				relatedServices = append(relatedServices, service)
			}
		}
	}

	// Return all related resources
	response := gin.H{
		"services": relatedServices,
	}

	c.JSON(http.StatusOK, response)
}

// ScaleDeployment scales a deployment to the specified number of replicas
func (h *DeploymentHandler) ScaleDeployment(c *gin.Context) {
	namespace := c.Param("namespace")
	name := c.Param("name")
	ctx := c.Request.Context()

	// Parse the request body to get the desired replica count
	var scaleRequest struct {
		Replicas *int32 `json:"replicas" binding:"required,min=0"`
	}

	if err := c.ShouldBindJSON(&scaleRequest); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()})
		return
	}

	if scaleRequest.Replicas == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "replicas field is required"})
		return
	}

	// Get the current deployment
	var deployment appsv1.Deployment
	if err := h.K8sClient.Client.Get(ctx, types.NamespacedName{Namespace: namespace, Name: name}, &deployment); err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Deployment not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Update the replica count
	deployment.Spec.Replicas = scaleRequest.Replicas

	// Update the deployment
	if err := h.K8sClient.Client.Update(ctx, &deployment); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to scale deployment: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":    "Deployment scaled successfully",
		"deployment": deployment,
		"replicas":   *scaleRequest.Replicas,
	})
}

func (h *DeploymentHandler) registerCustomRoutes(group *gin.RouterGroup) {
	group.GET("/:namespace/:name/related", h.ListDeploymentRelatedResources)
	group.POST("/:namespace/:name/scale", h.ScaleDeployment)
	group.POST("/:namespace/:name/restart", h.RestartDeployment)
	group.POST("/batch/restart", h.RestartDeploymentsBatch)
	group.POST("/batch/scale-restart", h.ScaleRestartDeploymentsBatch)
}

// BatchDeploymentRestartRequest represents the request body for batch deployment restart
type BatchDeploymentRestartRequest struct {
	Deployments []DeploymentIdentifier `json:"deployments" binding:"required"`
}

// DeploymentIdentifier represents a deployment to be restarted
type DeploymentIdentifier struct {
	Namespace string `json:"namespace" binding:"required"`
	Name      string `json:"name" binding:"required"`
}

// ScaleRestartRequest represents the request body for scale-restart operation
type ScaleRestartRequest struct {
	Deployments []DeploymentIdentifier `json:"deployments" binding:"required"`
	FinalReplicas *int32 `json:"finalReplicas,omitempty"`
}

// DeploymentRestartResult represents the result of restarting a single deployment
type DeploymentRestartResult struct {
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
	Success   bool   `json:"success"`
	Error     string `json:"error,omitempty"`
}

// RestartDeploymentsBatch restarts multiple deployments concurrently
func (h *DeploymentHandler) RestartDeploymentsBatch(c *gin.Context) {
	var req BatchDeploymentRestartRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Invalid request body: %v", err)})
		return
	}

	if len(req.Deployments) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No deployments specified for restart"})
		return
	}

	klog.Infof("Starting batch restart for %d deployments", len(req.Deployments))

	// Use a context with timeout for all operations
	ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Minute)
	defer cancel()

	// Channel to collect results
	resultChan := make(chan DeploymentRestartResult, len(req.Deployments))
	var wg sync.WaitGroup

	// Process each deployment restart concurrently
	for _, deployment := range req.Deployments {
		wg.Add(1)
		go func(deployment DeploymentIdentifier) {
			defer wg.Done()
			result := h.restartSingleDeployment(ctx, deployment.Namespace, deployment.Name)
			resultChan <- result
		}(deployment)
	}

	// Wait for all goroutines to complete
	go func() {
		wg.Wait()
		close(resultChan)
	}()

	// Collect results
	var results []DeploymentRestartResult
	var successCount, failureCount int

	for result := range resultChan {
		results = append(results, result)
		if result.Success {
			successCount++
		} else {
			failureCount++
		}
	}

	klog.Infof("Batch deployment restart completed: %d successful, %d failed", successCount, failureCount)

	// Return response
	response := gin.H{
		"message":      fmt.Sprintf("Batch deployment restart completed: %d successful, %d failed", successCount, failureCount),
		"total":        len(req.Deployments),
		"successful":   successCount,
		"failed":       failureCount,
		"results":      results,
		"timestamp":    time.Now().Format(time.RFC3339),
	}

	if failureCount > 0 {
		c.JSON(http.StatusPartialContent, response)
	} else {
		c.JSON(http.StatusOK, response)
	}
}

// restartSingleDeployment restarts a single deployment and returns the result
func (h *DeploymentHandler) restartSingleDeployment(ctx context.Context, namespace, name string) DeploymentRestartResult {
	result := DeploymentRestartResult{
		Namespace: namespace,
		Name:      name,
		Success:   false,
	}

	// Restart the deployment using existing Restart method
	if err := h.Restart(ctx, namespace, name); err != nil {
		if errors.IsNotFound(err) {
			result.Error = "Deployment not found"
		} else {
			result.Error = fmt.Sprintf("Failed to restart deployment: %v", err)
		}
		klog.Errorf("Failed to restart deployment %s/%s: %v", namespace, name, err)
		return result
	}

	result.Success = true
	klog.Infof("Successfully triggered restart for deployment %s/%s", namespace, name)
	return result
}

// ScaleRestartDeploymentsBatch scales deployments to 3 replicas, restarts them, then optionally scales back
func (h *DeploymentHandler) ScaleRestartDeploymentsBatch(c *gin.Context) {
	var req ScaleRestartRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Invalid request body: %v", err)})
		return
	}

	if len(req.Deployments) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No deployments specified for scale-restart"})
		return
	}

	klog.Infof("Starting scale-restart for %d deployments", len(req.Deployments))

	// Use a context with longer timeout for scale operations
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Minute)
	defer cancel()

	// Channel to collect results
	resultChan := make(chan DeploymentRestartResult, len(req.Deployments))
	var wg sync.WaitGroup

	// Process each deployment
	for _, deployment := range req.Deployments {
		wg.Add(1)
		go func(namespace, name string) {
			defer wg.Done()
			result := h.scaleRestartSingleDeployment(ctx, namespace, name, req.FinalReplicas)
			resultChan <- result
		}(deployment.Namespace, deployment.Name)
	}

	// Wait for all operations to complete
	wg.Wait()
	close(resultChan)

	// Collect results
	var results []DeploymentRestartResult
	successCount := 0
	failureCount := 0

	for result := range resultChan {
		results = append(results, result)
		if result.Success {
			successCount++
		} else {
			failureCount++
		}
	}

	klog.Infof("Scale-restart operation completed: %d successful, %d failed", successCount, failureCount)

	// Return response
	response := gin.H{
		"message":      fmt.Sprintf("Scale-restart operation completed: %d successful, %d failed", successCount, failureCount),
		"total":        len(req.Deployments),
		"successful":   successCount,
		"failed":       failureCount,
		"results":      results,
		"timestamp":    time.Now().Format(time.RFC3339),
	}

	if failureCount > 0 {
		c.JSON(http.StatusPartialContent, response)
	} else {
		c.JSON(http.StatusOK, response)
	}
}

// scaleRestartSingleDeployment handles scale-restart for a single deployment
func (h *DeploymentHandler) scaleRestartSingleDeployment(ctx context.Context, namespace, name string, finalReplicas *int32) DeploymentRestartResult {
	result := DeploymentRestartResult{
		Namespace: namespace,
		Name:      name,
		Success:   false,
	}

	// Get the current deployment
	var deployment appsv1.Deployment
	if err := h.K8sClient.Client.Get(ctx, types.NamespacedName{Namespace: namespace, Name: name}, &deployment); err != nil {
		if errors.IsNotFound(err) {
			result.Error = "Deployment not found"
		} else {
			result.Error = fmt.Sprintf("Failed to get deployment: %v", err)
		}
		return result
	}

	originalReplicas := deployment.Spec.Replicas
	if originalReplicas == nil {
		replicas := int32(1)
		originalReplicas = &replicas
	}

	// Step 1: Scale to 3 replicas if currently 1
	if *originalReplicas == 1 {
		klog.Infof("Scaling deployment %s/%s to 3 replicas", namespace, name)
		deployment.Spec.Replicas = &[]int32{3}[0]
		if err := h.K8sClient.Client.Update(ctx, &deployment); err != nil {
			result.Error = fmt.Sprintf("Failed to scale to 3 replicas: %v", err)
			return result
		}

		// Wait for scaling to take effect
		time.Sleep(3 * time.Second)
	}

	// Step 2: Restart the deployment
	klog.Infof("Restarting deployment %s/%s", namespace, name)
	if err := h.Restart(ctx, namespace, name); err != nil {
		result.Error = fmt.Sprintf("Failed to restart deployment: %v", err)
		return result
	}

	// Step 3: Scale back if requested
	if finalReplicas != nil && *originalReplicas == 1 && *finalReplicas == 1 {
		// Wait for restart to take effect
		time.Sleep(5 * time.Second)
		
		klog.Infof("Scaling deployment %s/%s back to 1 replica", namespace, name)
		
		// Get the deployment again to ensure we have the latest version
		if err := h.K8sClient.Client.Get(ctx, types.NamespacedName{Namespace: namespace, Name: name}, &deployment); err != nil {
			result.Error = fmt.Sprintf("Failed to get deployment for scale-back: %v", err)
			return result
		}
		
		deployment.Spec.Replicas = &[]int32{1}[0]
		if err := h.K8sClient.Client.Update(ctx, &deployment); err != nil {
			result.Error = fmt.Sprintf("Failed to scale back to 1 replica: %v", err)
			return result
		}
	}

	result.Success = true
	klog.Infof("Successfully completed scale-restart for deployment %s/%s", namespace, name)
	return result
}
