package handlers

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/klog/v2"
)

type PodRestartHandler struct {
	client kubernetes.Interface
}

func NewPodRestartHandler(client kubernetes.Interface) *PodRestartHandler {
	return &PodRestartHandler{
		client: client,
	}
}

// RegisterRoutes registers the routes for pod restart operations
func (h *PodRestartHandler) RegisterRoutes(r *gin.RouterGroup) {
	r.POST("/pods/:namespace/:name/restart", h.RestartPod)
	r.POST("/pods/batch/restart", h.RestartPodsBatch)
}

// RestartPod deletes a pod to trigger restart by controller
func (h *PodRestartHandler) RestartPod(c *gin.Context) {
	namespace := c.Param("namespace")
	podName := c.Param("name")

	if namespace == "" || podName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "namespace and pod name are required"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	klog.Infof("Restarting pod %s in namespace %s", podName, namespace)

	// First, check if the pod exists
	pod, err := h.client.CoreV1().Pods(namespace).Get(ctx, podName, metav1.GetOptions{})
	if err != nil {
		klog.Errorf("Failed to get pod %s/%s: %v", namespace, podName, err)
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("Pod not found: %v", err)})
		return
	}

	// Check if pod is managed by a controller (has ownerReferences)
	if len(pod.OwnerReferences) == 0 {
		klog.Warningf("Pod %s/%s has no owner references, deleting directly", namespace, podName)
	}

	// Delete the pod to trigger restart
	deletePolicy := metav1.DeletePropagationForeground
	err = h.client.CoreV1().Pods(namespace).Delete(ctx, podName, metav1.DeleteOptions{
		PropagationPolicy: &deletePolicy,
	})

	if err != nil {
		klog.Errorf("Failed to delete pod %s/%s for restart: %v", namespace, podName, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to restart pod: %v", err)})
		return
	}

	klog.Infof("Successfully triggered restart for pod %s/%s", namespace, podName)
	c.JSON(http.StatusOK, gin.H{
		"message": fmt.Sprintf("Pod %s restart triggered successfully", podName),
		"pod":     podName,
		"namespace": namespace,
		"timestamp": time.Now().Format(time.RFC3339),
	})
}

// BatchRestartRequest represents the request body for batch pod restart
type BatchRestartRequest struct {
	Pods []PodIdentifier `json:"pods" binding:"required"`
}

// PodIdentifier represents a pod to be restarted
type PodIdentifier struct {
	Namespace string `json:"namespace" binding:"required"`
	Name      string `json:"name" binding:"required"`
}

// RestartResult represents the result of restarting a single pod
type RestartResult struct {
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
	Success   bool   `json:"success"`
	Error     string `json:"error,omitempty"`
}

// RestartPodsBatch restarts multiple pods concurrently
func (h *PodRestartHandler) RestartPodsBatch(c *gin.Context) {
	var req BatchRestartRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Invalid request body: %v", err)})
		return
	}

	if len(req.Pods) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No pods specified for restart"})
		return
	}

	klog.Infof("Starting batch restart for %d pods", len(req.Pods))

	// Use a context with timeout for all operations
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	// Channel to collect results
	resultChan := make(chan RestartResult, len(req.Pods))
	var wg sync.WaitGroup

	// Process each pod restart concurrently
	for _, pod := range req.Pods {
		wg.Add(1)
		go func(pod PodIdentifier) {
			defer wg.Done()
			result := h.restartSinglePod(ctx, pod.Namespace, pod.Name)
			resultChan <- result
		}(pod)
	}

	// Wait for all goroutines to complete
	go func() {
		wg.Wait()
		close(resultChan)
	}()

	// Collect results
	var results []RestartResult
	var successCount, failureCount int

	for result := range resultChan {
		results = append(results, result)
		if result.Success {
			successCount++
		} else {
			failureCount++
		}
	}

	klog.Infof("Batch restart completed: %d successful, %d failed", successCount, failureCount)

	// Return response
	response := gin.H{
		"message":      fmt.Sprintf("Batch restart completed: %d successful, %d failed", successCount, failureCount),
		"total":        len(req.Pods),
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

// restartSinglePod restarts a single pod and returns the result
func (h *PodRestartHandler) restartSinglePod(ctx context.Context, namespace, podName string) RestartResult {
	result := RestartResult{
		Namespace: namespace,
		Name:      podName,
		Success:   false,
	}

	// Check if the pod exists
	pod, err := h.client.CoreV1().Pods(namespace).Get(ctx, podName, metav1.GetOptions{})
	if err != nil {
		result.Error = fmt.Sprintf("Pod not found: %v", err)
		klog.Errorf("Failed to get pod %s/%s: %v", namespace, podName, err)
		return result
	}

	// Check if pod is managed by a controller
	if len(pod.OwnerReferences) == 0 {
		klog.Warningf("Pod %s/%s has no owner references, deleting directly", namespace, podName)
	}

	// Delete the pod to trigger restart
	deletePolicy := metav1.DeletePropagationForeground
	err = h.client.CoreV1().Pods(namespace).Delete(ctx, podName, metav1.DeleteOptions{
		PropagationPolicy: &deletePolicy,
	})

	if err != nil {
		result.Error = fmt.Sprintf("Failed to restart pod: %v", err)
		klog.Errorf("Failed to delete pod %s/%s for restart: %v", namespace, podName, err)
		return result
	}

	result.Success = true
	klog.Infof("Successfully triggered restart for pod %s/%s", namespace, podName)
	return result
}