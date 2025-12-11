package resources

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"sort"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/zxh326/kite/pkg/kube"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
)

// getNodeOperationImage returns the image to use for node operations
// It uses NODE_OPERATION_IMAGE env var if set, otherwise falls back to NODE_TERMINAL_IMAGE
func getNodeOperationImage() string {
	if image := os.Getenv("NODE_OPERATION_IMAGE"); image != "" {
		return image
	}
	if image := os.Getenv("NODE_TERMINAL_IMAGE"); image != "" {
		return image
	}
	// Default to alpine which has nsenter
	return "alpine:latest"
}

type NodeHandler struct {
	*GenericResourceHandler[*corev1.Node, *corev1.NodeList]
}

func NewNodeHandler(client *kube.K8sClient) *NodeHandler {
	return &NodeHandler{
		GenericResourceHandler: NewGenericResourceHandler[*corev1.Node, *corev1.NodeList](
			client,
			"nodes",
			true, // Nodes are cluster-scoped resources
			true,
		),
	}
}

// DrainNode drains a node by evicting all pods
func (h *NodeHandler) DrainNode(c *gin.Context) {
	nodeName := c.Param("name")
	ctx := c.Request.Context()

	// Parse the request body for drain options
	var drainRequest struct {
		Force            bool `json:"force" binding:"required"`
		GracePeriod      int  `json:"gracePeriod" binding:"min=0"`
		DeleteLocal      bool `json:"deleteLocalData"`
		IgnoreDaemonsets bool `json:"ignoreDaemonsets"`
	}

	if err := c.ShouldBindJSON(&drainRequest); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()})
		return
	}

	// Get the node first to ensure it exists
	var node corev1.Node
	if err := h.K8sClient.Client.Get(ctx, types.NamespacedName{Name: nodeName}, &node); err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Node not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// TODO: Implement actual drain logic
	// For now, we'll simulate the drain operation
	// In a real implementation, you would:
	// 1. Mark the node as unschedulable (cordon)
	// 2. Evict all pods from the node
	// 3. Handle daemonsets appropriately
	// 4. Wait for pods to be evicted or force delete them

	c.JSON(http.StatusOK, gin.H{
		"message": fmt.Sprintf("Node %s drain initiated", nodeName),
		"node":    node.Name,
		"options": drainRequest,
	})
}

func (h *NodeHandler) markNodeSchedulable(ctx context.Context, nodeName string, schedulable bool) error {
	// Get the current node
	var node corev1.Node
	if err := h.K8sClient.Client.Get(ctx, types.NamespacedName{Name: nodeName}, &node); err != nil {
		return err
	}
	node.Spec.Unschedulable = !schedulable
	if err := h.K8sClient.Client.Update(ctx, &node); err != nil {
		return err
	}
	return nil
}

// CordonNode marks a node as unschedulable
func (h *NodeHandler) CordonNode(c *gin.Context) {
	nodeName := c.Param("name")
	ctx := c.Request.Context()

	if err := h.markNodeSchedulable(ctx, nodeName, false); err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Node not found"})
			return
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message": fmt.Sprintf("Node %s cordoned successfully", nodeName),
	})
}

// UncordonNode marks a node as schedulable
func (h *NodeHandler) UncordonNode(c *gin.Context) {
	nodeName := c.Param("name")
	ctx := c.Request.Context()

	if err := h.markNodeSchedulable(ctx, nodeName, true); err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Node not found"})
			return
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"message": fmt.Sprintf("Node %s uncordoned successfully", nodeName),
	})
}

// TaintNode adds or updates taints on a node
func (h *NodeHandler) TaintNode(c *gin.Context) {
	nodeName := c.Param("name")
	ctx := c.Request.Context()

	// Parse the request body for taint information
	var taintRequest struct {
		Key    string `json:"key" binding:"required"`
		Value  string `json:"value"`
		Effect string `json:"effect" binding:"required,oneof=NoSchedule PreferNoSchedule NoExecute"`
	}

	if err := c.ShouldBindJSON(&taintRequest); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()})
		return
	}

	// Get the current node
	var node corev1.Node
	if err := h.K8sClient.Client.Get(ctx, types.NamespacedName{Name: nodeName}, &node); err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Node not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Create the new taint
	newTaint := corev1.Taint{
		Key:    taintRequest.Key,
		Value:  taintRequest.Value,
		Effect: corev1.TaintEffect(taintRequest.Effect),
	}

	// Check if taint with same key already exists and update it, otherwise add new taint
	found := false
	for i, taint := range node.Spec.Taints {
		if taint.Key == taintRequest.Key {
			node.Spec.Taints[i] = newTaint
			found = true
			break
		}
	}

	if !found {
		node.Spec.Taints = append(node.Spec.Taints, newTaint)
	}

	// Update the node
	if err := h.K8sClient.Client.Update(ctx, &node); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to taint node: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": fmt.Sprintf("Node %s tainted successfully", nodeName),
		"node":    node.Name,
		"taint":   newTaint,
	})
}

// UntaintNode removes a taint from a node
func (h *NodeHandler) UntaintNode(c *gin.Context) {
	nodeName := c.Param("name")
	ctx := c.Request.Context()

	// Parse the request body for taint key to remove
	var untaintRequest struct {
		Key string `json:"key" binding:"required"`
	}

	if err := c.ShouldBindJSON(&untaintRequest); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()})
		return
	}

	// Get the current node
	var node corev1.Node
	if err := h.K8sClient.Client.Get(ctx, types.NamespacedName{Name: nodeName}, &node); err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Node not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Find and remove the taint with the specified key
	originalLength := len(node.Spec.Taints)
	var newTaints []corev1.Taint
	for _, taint := range node.Spec.Taints {
		if taint.Key != untaintRequest.Key {
			newTaints = append(newTaints, taint)
		}
	}
	node.Spec.Taints = newTaints

	if len(newTaints) == originalLength {
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("Taint with key '%s' not found on node", untaintRequest.Key)})
		return
	}

	// Update the node
	if err := h.K8sClient.Client.Update(ctx, &node); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to untaint node: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":         fmt.Sprintf("Taint with key '%s' removed from node %s successfully", untaintRequest.Key, nodeName),
		"node":            node.Name,
		"removedTaintKey": untaintRequest.Key,
	})
}

// GetNodeEvents retrieves events related to a specific node
func (h *NodeHandler) GetNodeEvents(c *gin.Context) {
	nodeName := c.Param("name")
	ctx := c.Request.Context()

	// Get all events and filter by node name
	eventList := &corev1.EventList{}
	err := h.K8sClient.Client.List(ctx, eventList)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch events: " + err.Error()})
		return
	}

	// Filter events related to this node
	var nodeEvents []corev1.Event
	for _, event := range eventList.Items {
		if event.InvolvedObject.Kind == "Node" && event.InvolvedObject.Name == nodeName {
			nodeEvents = append(nodeEvents, event)
		}
	}

	// Sort events by last timestamp (most recent first)
	sort.Slice(nodeEvents, func(i, j int) bool {
		return nodeEvents[i].LastTimestamp.After(nodeEvents[j].LastTimestamp.Time)
	})

	c.JSON(http.StatusOK, nodeEvents)
}

// RestartKubelet restarts the kubelet service on a node
func (h *NodeHandler) RestartKubelet(c *gin.Context) {
	nodeName := c.Param("name")
	ctx := c.Request.Context()

	// Verify node exists
	var node corev1.Node
	if err := h.K8sClient.Client.Get(ctx, types.NamespacedName{Name: nodeName}, &node); err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Node not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Create a pod to restart kubelet on the node
	restartPod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("restart-kubelet-%s-%d", nodeName, time.Now().Unix()),
			Namespace: "kube-system",
			Labels: map[string]string{
				"app":  "kite-node-restart",
				"type": "kubelet",
				"node": nodeName,
			},
		},
		Spec: corev1.PodSpec{
			NodeName:      nodeName,
			HostPID:       true,
			HostNetwork:   true,
			RestartPolicy: corev1.RestartPolicyNever,
			Containers: []corev1.Container{
				{
					Name:  "restart-kubelet",
					Image: getNodeOperationImage(),
					Command: []string{
						"nsenter",
						"--target", "1",
						"--mount",
						"--uts",
						"--ipc",
						"--net",
						"--pid",
						"--",
						"sh", "-c",
						"systemctl stop kubelet && sleep 3 && systemctl start kubelet",
					},
					SecurityContext: &corev1.SecurityContext{
						Privileged: func() *bool { b := true; return &b }(),
					},
				},
			},
			Tolerations: []corev1.Toleration{
				{
					Operator: corev1.TolerationOpExists,
				},
			},
		},
	}

	if err := h.K8sClient.Client.Create(ctx, restartPod); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create restart pod: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": fmt.Sprintf("Kubelet restart initiated on node %s", nodeName),
		"pod":     restartPod.Name,
	})
}

// RestartKubeProxy restarts the kube-proxy on a node
func (h *NodeHandler) RestartKubeProxy(c *gin.Context) {
	nodeName := c.Param("name")
	ctx := c.Request.Context()

	// Verify node exists
	var node corev1.Node
	if err := h.K8sClient.Client.Get(ctx, types.NamespacedName{Name: nodeName}, &node); err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Node not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Find and delete the kube-proxy pod on this node
	podList := &corev1.PodList{}
	err := h.K8sClient.Client.List(ctx, podList, client.InNamespace("kube-system"))

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list kube-proxy pods: " + err.Error()})
		return
	}

	// Find the kube-proxy pod on this specific node
	var targetPod *corev1.Pod
	for i := range podList.Items {
		pod := &podList.Items[i]
		// Check if it's a kube-proxy pod on this node
		if pod.Spec.NodeName == nodeName {
			// Check labels to identify kube-proxy
			if labels := pod.Labels; labels != nil {
				if labels["k8s-app"] == "kube-proxy" || labels["component"] == "kube-proxy" {
					targetPod = pod
					break
				}
			}
		}
	}

	if targetPod == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("kube-proxy pod not found on node %s", nodeName)})
		return
	}

	// Delete the pod to trigger restart
	if err := h.K8sClient.Client.Delete(ctx, targetPod); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete kube-proxy pod: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": fmt.Sprintf("kube-proxy restart initiated on node %s", nodeName),
		"pod":     targetPod.Name,
	})
}

// GetContainerdConfig retrieves the containerd configuration from a node
func (h *NodeHandler) GetContainerdConfig(c *gin.Context) {
	nodeName := c.Param("name")
	ctx := c.Request.Context()

	// Verify node exists
	var node corev1.Node
	if err := h.K8sClient.Client.Get(ctx, types.NamespacedName{Name: nodeName}, &node); err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Node not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Create a pod to read containerd config
	configPod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("read-containerd-config-%s-%d", nodeName, time.Now().Unix()),
			Namespace: "kube-system",
			Labels: map[string]string{
				"app":  "kite-node-config",
				"type": "containerd",
				"node": nodeName,
			},
		},
		Spec: corev1.PodSpec{
			NodeName:      nodeName,
			HostPID:       true,
			RestartPolicy: corev1.RestartPolicyNever,
			Containers: []corev1.Container{
				{
					Name:  "read-config",
					Image: getNodeOperationImage(),
					Command: []string{
						"cat",
						"/host/etc/containerd/config.toml",
					},
					VolumeMounts: []corev1.VolumeMount{
						{
							Name:      "host-etc",
							MountPath: "/host/etc",
							ReadOnly:  true,
						},
					},
				},
			},
			Volumes: []corev1.Volume{
				{
					Name: "host-etc",
					VolumeSource: corev1.VolumeSource{
						HostPath: &corev1.HostPathVolumeSource{
							Path: "/etc",
						},
					},
				},
			},
			Tolerations: []corev1.Toleration{
				{
					Operator: corev1.TolerationOpExists,
				},
			},
		},
	}

	if err := h.K8sClient.Client.Create(ctx, configPod); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create config reader pod: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Containerd config retrieval initiated",
		"pod":     configPod.Name,
		"note":    "Use pod logs to view the configuration",
	})
}

// GetCNIConfig retrieves the CNI configuration from a node
func (h *NodeHandler) GetCNIConfig(c *gin.Context) {
	nodeName := c.Param("name")
	ctx := c.Request.Context()

	// Verify node exists
	var node corev1.Node
	if err := h.K8sClient.Client.Get(ctx, types.NamespacedName{Name: nodeName}, &node); err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Node not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Create a pod to read CNI config
	configPod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("read-cni-config-%s-%d", nodeName, time.Now().Unix()),
			Namespace: "kube-system",
			Labels: map[string]string{
				"app":  "kite-node-config",
				"type": "cni",
				"node": nodeName,
			},
		},
		Spec: corev1.PodSpec{
			NodeName:      nodeName,
			HostPID:       true,
			RestartPolicy: corev1.RestartPolicyNever,
			Containers: []corev1.Container{
				{
					Name:  "read-config",
					Image: getNodeOperationImage(),
					Command: []string{
						"sh",
						"-c",
						"ls -la /host/etc/cni/net.d/ && cat /host/etc/cni/net.d/*.conf* 2>/dev/null || echo 'No CNI config found'",
					},
					VolumeMounts: []corev1.VolumeMount{
						{
							Name:      "host-cni",
							MountPath: "/host/etc/cni",
							ReadOnly:  true,
						},
					},
				},
			},
			Volumes: []corev1.Volume{
				{
					Name: "host-cni",
					VolumeSource: corev1.VolumeSource{
						HostPath: &corev1.HostPathVolumeSource{
							Path: "/etc/cni",
						},
					},
				},
			},
			Tolerations: []corev1.Toleration{
				{
					Operator: corev1.TolerationOpExists,
				},
			},
		},
	}

	if err := h.K8sClient.Client.Create(ctx, configPod); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create config reader pod: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "CNI config retrieval initiated",
		"pod":     configPod.Name,
		"note":    "Use pod logs to view the configuration",
	})
}

func (h *NodeHandler) registerCustomRoutes(group *gin.RouterGroup) {
	group.POST("/_all/:name/drain", h.DrainNode)
	group.POST("/_all/:name/cordon", h.CordonNode)
	group.POST("/_all/:name/uncordon", h.UncordonNode)
	group.POST("/_all/:name/taint", h.TaintNode)
	group.POST("/_all/:name/untaint", h.UntaintNode)
	group.GET("/_all/:name/events", h.GetNodeEvents)
	group.POST("/_all/:name/restart-kubelet", h.RestartKubelet)
	group.POST("/_all/:name/restart-kubeproxy", h.RestartKubeProxy)
	group.GET("/_all/:name/containerd-config", h.GetContainerdConfig)
	group.GET("/_all/:name/cni-config", h.GetCNIConfig)
}
