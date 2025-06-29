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

type DeploymentRestartHandler struct {
	client kubernetes.Interface
}

func NewDeploymentRestartHandler(client kubernetes.Interface) *DeploymentRestartHandler {
	return &DeploymentRestartHandler{
		client: client,
	}
}

// RegisterRoutes registers the routes for deployment restart operations
func (h *DeploymentRestartHandler) RegisterRoutes(r *gin.RouterGroup) {
	r.POST("/deployments/:namespace/:name/restart", h.RestartDeployment)
}

// RestartDeployment performs a rolling restart of a deployment
func (h *DeploymentRestartHandler) RestartDeployment(c *gin.Context) {
	namespace := c.Param("namespace")
	deploymentName := c.Param("name")

	if namespace == "" || deploymentName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "namespace and deployment name are required"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	klog.Infof("Rolling restart deployment %s in namespace %s", deploymentName, namespace)

	// Get the current deployment
	deployment, err := h.client.AppsV1().Deployments(namespace).Get(ctx, deploymentName, metav1.GetOptions{})
	if err != nil {
		klog.Errorf("Failed to get deployment %s/%s: %v", namespace, deploymentName, err)
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("Deployment not found: %v", err)})
		return
	}

	// Add or update the restart annotation to trigger a rolling update
	if deployment.Spec.Template.Annotations == nil {
		deployment.Spec.Template.Annotations = make(map[string]string)
	}
	
	// Use the standard kubectl annotation for restarts
	deployment.Spec.Template.Annotations["kubectl.kubernetes.io/restartedAt"] = time.Now().Format(time.RFC3339)

	// Update the deployment
	_, err = h.client.AppsV1().Deployments(namespace).Update(ctx, deployment, metav1.UpdateOptions{})
	if err != nil {
		klog.Errorf("Failed to update deployment %s/%s for rolling restart: %v", namespace, deploymentName, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to restart deployment: %v", err)})
		return
	}

	klog.Infof("Successfully triggered rolling restart for deployment %s/%s", namespace, deploymentName)
	c.JSON(http.StatusOK, gin.H{
		"message": fmt.Sprintf("Deployment %s rolling restart triggered successfully", deploymentName),
		"deployment": deploymentName,
		"namespace": namespace,
		"timestamp": time.Now().Format(time.RFC3339),
		"annotation": "kubectl.kubernetes.io/restartedAt",
	})
}