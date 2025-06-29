package handlers

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/fields"
	"k8s.io/client-go/kubernetes"
	"k8s.io/klog/v2"
)

// PodHistoryHandler handles Pod history tracking
type PodHistoryHandler struct {
	client kubernetes.Interface
}

// NewPodHistoryHandler creates a new Pod history handler
func NewPodHistoryHandler(client kubernetes.Interface) *PodHistoryHandler {
	return &PodHistoryHandler{
		client: client,
	}
}

// PodNodeHistory represents the node history of a Pod
type PodNodeHistory struct {
	PodName        string              `json:"podName"`
	Namespace      string              `json:"namespace"`
	CurrentNode    string              `json:"currentNode"`
	NodeHistory    []NodeHistoryEntry  `json:"nodeHistory"`
	RestartHistory []RestartHistoryEntry `json:"restartHistory"`
	Events         []corev1.Event      `json:"events"`
	Status         PodStatusInfo       `json:"status"`
}

// NodeHistoryEntry represents a single node history entry
type NodeHistoryEntry struct {
	NodeName  string    `json:"nodeName"`
	StartTime time.Time `json:"startTime"`
	EndTime   *time.Time `json:"endTime,omitempty"`
	Reason    string    `json:"reason"`
	Phase     string    `json:"phase"`
}

// RestartHistoryEntry represents a single restart history entry
type RestartHistoryEntry struct {
	RestartCount   int32                      `json:"restartCount"`
	LastRestartTime *time.Time                `json:"lastRestartTime,omitempty"`
	Reason         string                     `json:"reason"`
	ExitCode       *int32                     `json:"exitCode,omitempty"`
	Message        string                     `json:"message"`
	ContainerStates []ContainerRestartInfo    `json:"containerStates"`
	Events         []corev1.Event            `json:"events"`
}

// ContainerRestartInfo represents container-specific restart information
type ContainerRestartInfo struct {
	ContainerName string     `json:"containerName"`
	RestartCount  int32      `json:"restartCount"`
	LastRestartTime *time.Time `json:"lastRestartTime,omitempty"`
	ExitCode      *int32     `json:"exitCode,omitempty"`
	Reason        string     `json:"reason"`
	Message       string     `json:"message"`
}

// PodStatusInfo represents enhanced Pod status information
type PodStatusInfo struct {
	Phase             string                 `json:"phase"`
	Conditions        []corev1.PodCondition  `json:"conditions"`
	ContainerStatuses []corev1.ContainerStatus `json:"containerStatuses"`
	IsReady           bool                   `json:"isReady"`
	HasErrors         bool                   `json:"hasErrors"`
	ErrorMessage      string                 `json:"errorMessage,omitempty"`
	QOSClass          string                 `json:"qosClass"`
	StartTime         *metav1.Time           `json:"startTime,omitempty"`
}

// GetPodHistory retrieves the complete history for a specific Pod
func (h *PodHistoryHandler) GetPodHistory(c *gin.Context) {
	namespace := c.Param("namespace")
	podName := c.Param("name")

	if namespace == "" || podName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "namespace and pod name are required"})
		return
	}

	history, err := h.buildPodHistory(c.Request.Context(), namespace, podName)
	if err != nil {
		klog.Errorf("Failed to build pod history for %s/%s: %v", namespace, podName, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to get pod history: %v", err)})
		return
	}

	c.JSON(http.StatusOK, history)
}

// GetPodsHistoryBatch retrieves history for multiple Pods in a namespace
func (h *PodHistoryHandler) GetPodsHistoryBatch(c *gin.Context) {
	namespace := c.Param("namespace")
	if namespace == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "namespace is required"})
		return
	}

	// Get query parameters
	labelSelector := c.Query("labelSelector")
	limitStr := c.Query("limit")
	limit := 50 // default limit
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	pods, err := h.client.CoreV1().Pods(namespace).List(c.Request.Context(), metav1.ListOptions{
		LabelSelector: labelSelector,
		Limit:         int64(limit),
	})
	if err != nil {
		klog.Errorf("Failed to list pods in namespace %s: %v", namespace, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to list pods: %v", err)})
		return
	}

	histories := make([]PodNodeHistory, 0, len(pods.Items))
	for _, pod := range pods.Items {
		history, err := h.buildPodHistory(c.Request.Context(), namespace, pod.Name)
		if err != nil {
			klog.Errorf("Failed to build history for pod %s/%s: %v", namespace, pod.Name, err)
			continue // Skip this pod but continue with others
		}
		histories = append(histories, *history)
	}

	c.JSON(http.StatusOK, gin.H{
		"histories": histories,
		"total":     len(histories),
	})
}

// buildPodHistory constructs the complete history for a Pod
func (h *PodHistoryHandler) buildPodHistory(ctx context.Context, namespace, podName string) (*PodNodeHistory, error) {
	// Get current Pod
	pod, err := h.client.CoreV1().Pods(namespace).Get(ctx, podName, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get pod: %w", err)
	}

	// Get events for this Pod
	events, err := h.getPodEvents(ctx, namespace, podName)
	if err != nil {
		klog.Warningf("Failed to get events for pod %s/%s: %v", namespace, podName, err)
		events = []corev1.Event{} // Continue without events
	}

	// Build node history from events
	nodeHistory := h.buildNodeHistoryFromEvents(events, pod)

	// Build restart history
	restartHistory := h.buildRestartHistory(pod, events)

	// Build status info
	status := h.buildPodStatusInfo(pod)

	history := &PodNodeHistory{
		PodName:        podName,
		Namespace:      namespace,
		CurrentNode:    pod.Spec.NodeName,
		NodeHistory:    nodeHistory,
		RestartHistory: restartHistory,
		Events:         events,
		Status:         status,
	}

	return history, nil
}

// getPodEvents retrieves all events related to a specific Pod
func (h *PodHistoryHandler) getPodEvents(ctx context.Context, namespace, podName string) ([]corev1.Event, error) {
	events, err := h.client.CoreV1().Events(namespace).List(ctx, metav1.ListOptions{
		FieldSelector: fields.OneTermEqualSelector("involvedObject.name", podName).String(),
	})
	if err != nil {
		return nil, err
	}

	// Sort events by time (newest first)
	sort.Slice(events.Items, func(i, j int) bool {
		return events.Items[i].CreationTimestamp.After(events.Items[j].CreationTimestamp.Time)
	})

	return events.Items, nil
}

// buildNodeHistoryFromEvents constructs node history from events
func (h *PodHistoryHandler) buildNodeHistoryFromEvents(events []corev1.Event, pod *corev1.Pod) []NodeHistoryEntry {
	var nodeHistory []NodeHistoryEntry
	nodeMap := make(map[string]*NodeHistoryEntry)

	// Add current node if available
	if pod.Spec.NodeName != "" {
		current := &NodeHistoryEntry{
			NodeName:  pod.Spec.NodeName,
			StartTime: pod.CreationTimestamp.Time,
			Reason:    "Scheduled",
			Phase:     string(pod.Status.Phase),
		}
		nodeHistory = append(nodeHistory, *current)
		nodeMap[pod.Spec.NodeName] = current
	}

	// Process events to build node history
	for _, event := range events {
		switch event.Reason {
		case "Scheduled":
			if event.Message != "" {
				// Extract node name from message like "Successfully assigned namespace/pod to node"
				node := h.extractNodeFromScheduledMessage(event.Message)
				if node != "" && nodeMap[node] == nil {
					entry := NodeHistoryEntry{
						NodeName:  node,
						StartTime: event.CreationTimestamp.Time,
						Reason:    event.Reason,
						Phase:     "Pending",
					}
					nodeHistory = append(nodeHistory, entry)
					nodeMap[node] = &entry
				}
			}
		case "FailedScheduling":
			entry := NodeHistoryEntry{
				NodeName:  "none",
				StartTime: event.CreationTimestamp.Time,
				Reason:    event.Reason,
				Phase:     "Pending",
			}
			nodeHistory = append(nodeHistory, entry)
		}
	}

	// Sort by start time (newest first) and limit to last 5
	sort.Slice(nodeHistory, func(i, j int) bool {
		return nodeHistory[i].StartTime.After(nodeHistory[j].StartTime)
	})

	if len(nodeHistory) > 5 {
		nodeHistory = nodeHistory[:5]
	}

	return nodeHistory
}

// buildRestartHistory constructs restart history from Pod status and events
func (h *PodHistoryHandler) buildRestartHistory(pod *corev1.Pod, events []corev1.Event) []RestartHistoryEntry {
	var restartHistory []RestartHistoryEntry

	// Get container restart information
	containerRestarts := make([]ContainerRestartInfo, 0, len(pod.Status.ContainerStatuses))
	totalRestarts := int32(0)

	for _, containerStatus := range pod.Status.ContainerStatuses {
		restartInfo := ContainerRestartInfo{
			ContainerName: containerStatus.Name,
			RestartCount:  containerStatus.RestartCount,
		}

		if containerStatus.LastTerminationState.Terminated != nil {
			restartInfo.LastRestartTime = &containerStatus.LastTerminationState.Terminated.FinishedAt.Time
			restartInfo.ExitCode = &containerStatus.LastTerminationState.Terminated.ExitCode
			restartInfo.Reason = containerStatus.LastTerminationState.Terminated.Reason
			restartInfo.Message = containerStatus.LastTerminationState.Terminated.Message
		}

		containerRestarts = append(containerRestarts, restartInfo)
		totalRestarts += containerStatus.RestartCount
	}

	// Create restart history entries
	if totalRestarts > 0 {
		// Get related restart events
		restartEvents := h.getRestartEvents(events)

		entry := RestartHistoryEntry{
			RestartCount:    totalRestarts,
			ContainerStates: containerRestarts,
			Events:          restartEvents,
		}

		// Find most recent restart time
		var latestRestart *time.Time
		for _, container := range containerRestarts {
			if container.LastRestartTime != nil {
				if latestRestart == nil || container.LastRestartTime.After(*latestRestart) {
					latestRestart = container.LastRestartTime
					entry.Reason = container.Reason
					entry.Message = container.Message
					entry.ExitCode = container.ExitCode
				}
			}
		}
		entry.LastRestartTime = latestRestart

		restartHistory = append(restartHistory, entry)
	}

	return restartHistory
}

// buildPodStatusInfo constructs enhanced status information
func (h *PodHistoryHandler) buildPodStatusInfo(pod *corev1.Pod) PodStatusInfo {
	status := PodStatusInfo{
		Phase:             string(pod.Status.Phase),
		Conditions:        pod.Status.Conditions,
		ContainerStatuses: pod.Status.ContainerStatuses,
		QOSClass:          string(pod.Status.QOSClass),
		StartTime:         pod.Status.StartTime,
	}

	// Check if Pod is ready
	status.IsReady = h.isPodReady(pod)

	// Check for errors and get error message
	status.HasErrors, status.ErrorMessage = h.getPodErrorInfo(pod)

	return status
}

// Helper functions
func (h *PodHistoryHandler) extractNodeFromScheduledMessage(message string) string {
	// Parse message like "Successfully assigned namespace/pod to node"
	// This is a simplified implementation - you might want to use regex for more robust parsing
	if len(message) > 0 {
		// Look for pattern "to <node_name>"
		if idx := len(message) - 1; idx > 0 {
			parts := []rune(message)
			for i := len(parts) - 1; i >= 0; i-- {
				if i >= 3 && string(parts[i-3:i+1]) == " to " && i+1 < len(parts) {
					return string(parts[i+1:])
				}
			}
		}
	}
	return ""
}

func (h *PodHistoryHandler) getRestartEvents(events []corev1.Event) []corev1.Event {
	var restartEvents []corev1.Event
	for _, event := range events {
		if event.Reason == "BackOff" || event.Reason == "Killing" || 
		   event.Reason == "Unhealthy" || event.Reason == "FailedPostStartHook" {
			restartEvents = append(restartEvents, event)
		}
	}
	return restartEvents
}

func (h *PodHistoryHandler) isPodReady(pod *corev1.Pod) bool {
	for _, condition := range pod.Status.Conditions {
		if condition.Type == corev1.PodReady {
			return condition.Status == corev1.ConditionTrue
		}
	}
	return false
}

func (h *PodHistoryHandler) getPodErrorInfo(pod *corev1.Pod) (bool, string) {
	// Check phase
	if pod.Status.Phase == corev1.PodFailed {
		return true, pod.Status.Message
	}

	// Check container statuses
	for _, containerStatus := range pod.Status.ContainerStatuses {
		if containerStatus.State.Waiting != nil {
			waiting := containerStatus.State.Waiting
			if waiting.Reason == "ImagePullBackOff" || waiting.Reason == "ErrImagePull" ||
			   waiting.Reason == "CrashLoopBackOff" || waiting.Reason == "CreateContainerConfigError" {
				return true, fmt.Sprintf("Container %s: %s - %s", containerStatus.Name, waiting.Reason, waiting.Message)
			}
		}
		if containerStatus.State.Terminated != nil {
			terminated := containerStatus.State.Terminated
			if terminated.ExitCode != 0 {
				return true, fmt.Sprintf("Container %s exited with code %d: %s", containerStatus.Name, terminated.ExitCode, terminated.Message)
			}
		}
	}

	// Check conditions
	for _, condition := range pod.Status.Conditions {
		if condition.Status == corev1.ConditionFalse {
			switch condition.Type {
			case corev1.PodScheduled:
				if condition.Reason == "Unschedulable" {
					return true, fmt.Sprintf("Scheduling failed: %s", condition.Message)
				}
			case corev1.PodInitialized:
				return true, fmt.Sprintf("Initialization failed: %s", condition.Message)
			case corev1.PodReady:
				return true, fmt.Sprintf("Pod not ready: %s", condition.Message)
			}
		}
	}

	return false, ""
}

// RegisterRoutes registers the Pod history routes
func (h *PodHistoryHandler) RegisterRoutes(router *gin.RouterGroup) {
	router.GET("/pods/:namespace/:name/history", h.GetPodHistory)
	router.GET("/pods/:namespace/history", h.GetPodsHistoryBatch)
}