package handlers

import (
	"context"
	"fmt"
	"net/http"
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