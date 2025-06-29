package resources

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/zxh326/kite/pkg/kube"
	apiextensionsv1 "k8s.io/apiextensions-apiserver/pkg/apis/apiextensions/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/labels"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
)

// CRHandler handles API operations for Custom Resources based on CRD name
type CRHandler struct {
	K8sClient *kube.K8sClient
}

// NewCRHandler creates a new CRHandler
func NewCRHandler(client *kube.K8sClient) *CRHandler {
	return &CRHandler{K8sClient: client}
}

// getCRDByName retrieves the CRD definition by name
func (h *CRHandler) getCRDByName(ctx context.Context, crdName string) (*apiextensionsv1.CustomResourceDefinition, error) {
	var crd apiextensionsv1.CustomResourceDefinition
	if err := h.K8sClient.Client.Get(ctx, types.NamespacedName{Name: crdName}, &crd); err != nil {
		return nil, err
	}
	return &crd, nil
}

// getGVRFromCRD extracts GroupVersionResource from CRD
func (h *CRHandler) getGVRFromCRD(crd *apiextensionsv1.CustomResourceDefinition) schema.GroupVersionResource {
	// Use the first served version as default
	var version string
	for _, v := range crd.Spec.Versions {
		if v.Served {
			version = v.Name
			break
		}
	}

	return schema.GroupVersionResource{
		Group:    crd.Spec.Group,
		Version:  version,
		Resource: crd.Spec.Names.Plural,
	}
}

func (h *CRHandler) List(c *gin.Context) {
	crdName := c.Param("crd")
	if crdName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "CRD name is required"})
		return
	}

	ctx := c.Request.Context()

	// Get the CRD definition
	crd, err := h.getCRDByName(ctx, crdName)
	if err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "CustomResourceDefinition not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Create GVR from CRD
	gvr := h.getGVRFromCRD(crd)

	// Create unstructured list object
	crList := &unstructured.UnstructuredList{}
	crList.SetGroupVersionKind(schema.GroupVersionKind{
		Group:   gvr.Group,
		Version: gvr.Version,
		Kind:    crd.Spec.Names.ListKind,
	})

	opts := &client.ListOptions{}

	// Handle namespace parameter for namespaced resources
	if crd.Spec.Scope == apiextensionsv1.NamespaceScoped {
		namespace := c.Param("namespace")
		if namespace != "" && namespace != "_all" {
			opts.Namespace = namespace
		}
	}

	if err := h.K8sClient.Client.List(ctx, crList, opts); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, crList)
}

func (h *CRHandler) Get(c *gin.Context) {
	crdName := c.Param("crd")
	name := c.Param("name")

	if crdName == "" || name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "CRD name and resource name are required"})
		return
	}

	ctx := c.Request.Context()

	// Get the CRD definition
	crd, err := h.getCRDByName(ctx, crdName)
	if err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "CustomResourceDefinition not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Create GVR from CRD
	gvr := h.getGVRFromCRD(crd)

	// Create unstructured object
	cr := &unstructured.Unstructured{}
	cr.SetGroupVersionKind(schema.GroupVersionKind{
		Group:   gvr.Group,
		Version: gvr.Version,
		Kind:    crd.Spec.Names.Kind,
	})

	var namespacedName types.NamespacedName
	if crd.Spec.Scope == apiextensionsv1.NamespaceScoped {
		namespace := c.Param("namespace")
		// Handle both regular namespace and _all routing
		if namespace == "_all" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "This custom resource is namespace-scoped, use /:crd/:namespace/:name endpoint"})
			return
		}
		if namespace == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "namespace is required for namespaced custom resources"})
			return
		}
		namespacedName = types.NamespacedName{Namespace: namespace, Name: name}
	} else {
		// For cluster-scoped resources, ignore namespace parameter
		namespacedName = types.NamespacedName{Name: name}
	}

	if err := h.K8sClient.Client.Get(ctx, namespacedName, cr); err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Custom resource not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, cr)
}

func (h *CRHandler) Create(c *gin.Context) {
	crdName := c.Param("crd")
	if crdName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "CRD name is required"})
		return
	}

	ctx := c.Request.Context()

	// Get the CRD definition
	crd, err := h.getCRDByName(ctx, crdName)
	if err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "CustomResourceDefinition not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Create GVR from CRD
	gvr := h.getGVRFromCRD(crd)

	// Parse the request body into unstructured object
	var cr unstructured.Unstructured
	if err := c.ShouldBindJSON(&cr); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Set correct GVK
	cr.SetGroupVersionKind(schema.GroupVersionKind{
		Group:   gvr.Group,
		Version: gvr.Version,
		Kind:    crd.Spec.Names.Kind,
	})

	// Set namespace for namespaced resources
	if crd.Spec.Scope == apiextensionsv1.NamespaceScoped {
		namespace := c.Param("namespace")
		if namespace == "_all" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "This custom resource is namespace-scoped, use /:crd/:namespace endpoint"})
			return
		}
		if namespace == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "namespace is required for namespaced custom resources"})
			return
		}
		cr.SetNamespace(namespace)
	}

	if err := h.K8sClient.Client.Create(ctx, &cr); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, cr)
}

func (h *CRHandler) Update(c *gin.Context) {
	crdName := c.Param("crd")
	name := c.Param("name")

	if crdName == "" || name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "CRD name and resource name are required"})
		return
	}

	ctx := c.Request.Context()

	// Get the CRD definition
	crd, err := h.getCRDByName(ctx, crdName)
	if err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "CustomResourceDefinition not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Create GVR from CRD
	gvr := h.getGVRFromCRD(crd)

	// First get the existing custom resource
	existingCR := &unstructured.Unstructured{}
	existingCR.SetGroupVersionKind(schema.GroupVersionKind{
		Group:   gvr.Group,
		Version: gvr.Version,
		Kind:    crd.Spec.Names.Kind,
	})

	var namespacedName types.NamespacedName
	if crd.Spec.Scope == apiextensionsv1.NamespaceScoped {
		namespace := c.Param("namespace")
		if namespace == "_all" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "This custom resource is namespace-scoped, use /:crd/:namespace/:name endpoint"})
			return
		}
		if namespace == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "namespace is required for namespaced custom resources"})
			return
		}
		namespacedName = types.NamespacedName{Namespace: namespace, Name: name}
	} else {
		namespacedName = types.NamespacedName{Name: name}
	}

	if err := h.K8sClient.Client.Get(ctx, namespacedName, existingCR); err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Custom resource not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Parse the request body into unstructured object
	var updatedCR unstructured.Unstructured
	if err := c.ShouldBindJSON(&updatedCR); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Preserve important metadata
	updatedCR.SetGroupVersionKind(existingCR.GroupVersionKind())
	updatedCR.SetName(name)
	updatedCR.SetResourceVersion(existingCR.GetResourceVersion())
	updatedCR.SetUID(existingCR.GetUID())

	if crd.Spec.Scope == apiextensionsv1.NamespaceScoped {
		updatedCR.SetNamespace(existingCR.GetNamespace())
	}

	if err := h.K8sClient.Client.Update(ctx, &updatedCR); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, updatedCR)
}

func (h *CRHandler) Delete(c *gin.Context) {
	crdName := c.Param("crd")
	name := c.Param("name")

	if crdName == "" || name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "CRD name and resource name are required"})
		return
	}

	ctx := c.Request.Context()

	// Get the CRD definition
	crd, err := h.getCRDByName(ctx, crdName)
	if err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "CustomResourceDefinition not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Create GVR from CRD
	gvr := h.getGVRFromCRD(crd)

	// Create unstructured object to delete
	cr := &unstructured.Unstructured{}
	cr.SetGroupVersionKind(schema.GroupVersionKind{
		Group:   gvr.Group,
		Version: gvr.Version,
		Kind:    crd.Spec.Names.Kind,
	})

	var namespacedName types.NamespacedName
	if crd.Spec.Scope == apiextensionsv1.NamespaceScoped {
		namespace := c.Param("namespace")
		if namespace == "_all" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "This custom resource is namespace-scoped, use /:crd/:namespace/:name endpoint"})
			return
		}
		if namespace == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "namespace is required for namespaced custom resources"})
			return
		}
		namespacedName = types.NamespacedName{Namespace: namespace, Name: name}
		cr.SetNamespace(namespace)
	} else {
		namespacedName = types.NamespacedName{Name: name}
	}
	cr.SetName(name)

	// First check if the resource exists
	if err := h.K8sClient.Client.Get(ctx, namespacedName, cr); err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Custom resource not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Delete the custom resource
	if err := h.K8sClient.Client.Delete(ctx, cr, &client.DeleteOptions{
		PropagationPolicy: &[]metav1.DeletionPropagation{metav1.DeletePropagationForeground}[0],
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Custom resource deleted successfully"})
}

// GetCRRelatedResources lists resources related to a custom resource
// such as pods, services, etc.
func (h *CRHandler) GetCRRelatedResources(c *gin.Context) {
	crdName := c.Param("crd")
	name := c.Param("name")
	namespace := c.Param("namespace")
	ctx := c.Request.Context()

	if crdName == "" || name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "CRD name and resource name are required"})
		return
	}

	// Get the CRD definition
	crd, err := h.getCRDByName(ctx, crdName)
	if err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "CustomResourceDefinition not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Get the custom resource to access its labels
	cr := &unstructured.Unstructured{}
	gvr := h.getGVRFromCRD(crd)
	cr.SetGroupVersionKind(schema.GroupVersionKind{
		Group:   gvr.Group,
		Version: gvr.Version,
		Kind:    crd.Spec.Names.Kind,
	})

	var namespacedName types.NamespacedName
	if crd.Spec.Scope == apiextensionsv1.NamespaceScoped {
		if namespace == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "namespace is required for namespaced custom resources"})
			return
		}
		namespacedName = types.NamespacedName{Namespace: namespace, Name: name}
	} else {
		namespacedName = types.NamespacedName{Name: name}
	}

	if err := h.K8sClient.Client.Get(ctx, namespacedName, cr); err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Custom resource not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	relatedResources := gin.H{}

	// Try to find related pods based on labels
	if labels := cr.GetLabels(); labels != nil {
		var relatedPods []corev1.Pod
		podList := &corev1.PodList{}
		podListOpts := &client.ListOptions{}
		
		if crd.Spec.Scope == apiextensionsv1.NamespaceScoped {
			podListOpts.Namespace = namespace
		}

		if err := h.K8sClient.Client.List(ctx, podList, podListOpts); err == nil {
			for _, pod := range podList.Items {
				if podLabels := pod.GetLabels(); podLabels != nil {
					// Check if pod labels match CR labels (basic matching)
					hasMatch := false
					for crKey, crValue := range labels {
						if podValue, exists := podLabels[crKey]; exists && podValue == crValue {
							hasMatch = true
							break
						}
					}
					// Also check for common patterns like app, component, etc
					if !hasMatch {
						commonLabels := []string{"app", "component", "name", "instance"}
						for _, commonLabel := range commonLabels {
							if crValue, crExists := labels[commonLabel]; crExists {
								if podValue, podExists := podLabels[commonLabel]; podExists && podValue == crValue {
									hasMatch = true
									break
								}
							}
						}
					}
					if hasMatch {
						relatedPods = append(relatedPods, pod)
					}
				}
			}
		}
		relatedResources["pods"] = relatedPods
	}

	// Try to find related services
	if crd.Spec.Scope == apiextensionsv1.NamespaceScoped {
		var relatedServices []corev1.Service
		serviceList := &corev1.ServiceList{}
		serviceListOpts := &client.ListOptions{
			Namespace: namespace,
		}

		if err := h.K8sClient.Client.List(ctx, serviceList, serviceListOpts); err == nil {
			crLabels := cr.GetLabels()
			for _, service := range serviceList.Items {
				if service.Spec.Selector != nil && crLabels != nil {
					serviceSelector := labels.SelectorFromSet(service.Spec.Selector)
					if serviceSelector.Matches(labels.Set(crLabels)) {
						relatedServices = append(relatedServices, service)
					}
				}
			}
		}
		relatedResources["services"] = relatedServices
	}

	c.JSON(http.StatusOK, relatedResources)
}

// RestartCR restarts a custom resource by updating its restart annotation
func (h *CRHandler) RestartCR(c *gin.Context) {
	crdName := c.Param("crd")
	name := c.Param("name")
	namespace := c.Param("namespace")
	ctx := c.Request.Context()

	if crdName == "" || name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "CRD name and resource name are required"})
		return
	}

	// Get the CRD definition
	crd, err := h.getCRDByName(ctx, crdName)
	if err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "CustomResourceDefinition not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Get the custom resource
	cr := &unstructured.Unstructured{}
	gvr := h.getGVRFromCRD(crd)
	cr.SetGroupVersionKind(schema.GroupVersionKind{
		Group:   gvr.Group,
		Version: gvr.Version,
		Kind:    crd.Spec.Names.Kind,
	})

	var namespacedName types.NamespacedName
	if crd.Spec.Scope == apiextensionsv1.NamespaceScoped {
		if namespace == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "namespace is required for namespaced custom resources"})
			return
		}
		namespacedName = types.NamespacedName{Namespace: namespace, Name: name}
	} else {
		namespacedName = types.NamespacedName{Name: name}
	}

	if err := h.K8sClient.Client.Get(ctx, namespacedName, cr); err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Custom resource not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Add restart annotation
	annotations := cr.GetAnnotations()
	if annotations == nil {
		annotations = make(map[string]string)
	}
	annotations["kite.kubernetes.io/restartedAt"] = time.Now().Format(time.RFC3339)
	cr.SetAnnotations(annotations)

	if err := h.K8sClient.Client.Update(ctx, cr); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to restart custom resource: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Custom resource restarted successfully",
	})
}

// ScaleCR scales a custom resource if it supports replicas
func (h *CRHandler) ScaleCR(c *gin.Context) {
	crdName := c.Param("crd")
	name := c.Param("name")
	namespace := c.Param("namespace")
	ctx := c.Request.Context()

	if crdName == "" || name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "CRD name and resource name are required"})
		return
	}

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

	// Get the CRD definition
	crd, err := h.getCRDByName(ctx, crdName)
	if err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "CustomResourceDefinition not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Get the custom resource
	cr := &unstructured.Unstructured{}
	gvr := h.getGVRFromCRD(crd)
	cr.SetGroupVersionKind(schema.GroupVersionKind{
		Group:   gvr.Group,
		Version: gvr.Version,
		Kind:    crd.Spec.Names.Kind,
	})

	var namespacedName types.NamespacedName
	if crd.Spec.Scope == apiextensionsv1.NamespaceScoped {
		if namespace == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "namespace is required for namespaced custom resources"})
			return
		}
		namespacedName = types.NamespacedName{Namespace: namespace, Name: name}
	} else {
		namespacedName = types.NamespacedName{Name: name}
	}

	if err := h.K8sClient.Client.Get(ctx, namespacedName, cr); err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Custom resource not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Try to update replicas field - check common paths
	spec, found, err := unstructured.NestedMap(cr.Object, "spec")
	if err != nil || !found {
		c.JSON(http.StatusBadRequest, gin.H{"error": "This custom resource doesn't support scaling (no spec field)"})
		return
	}

	// Check if replicas field exists
	if _, exists := spec["replicas"]; !exists {
		c.JSON(http.StatusBadRequest, gin.H{"error": "This custom resource doesn't support scaling (no replicas field)"})
		return
	}

	// Update the replica count
	if err := unstructured.SetNestedField(cr.Object, int64(*scaleRequest.Replicas), "spec", "replicas"); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update replicas field: " + err.Error()})
		return
	}

	// Update the custom resource
	if err := h.K8sClient.Client.Update(ctx, cr); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to scale custom resource: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Custom resource scaled successfully",
		"resource": cr,
		"replicas": *scaleRequest.Replicas,
	})
}

// GetCREvents gets events related to a custom resource
func (h *CRHandler) GetCREvents(c *gin.Context) {
	crdName := c.Param("crd")
	name := c.Param("name")
	namespace := c.Param("namespace")
	ctx := c.Request.Context()

	if crdName == "" || name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "CRD name and resource name are required"})
		return
	}

	// Get events related to this custom resource
	eventList := &corev1.EventList{}
	eventListOpts := &client.ListOptions{}
	
	if namespace != "" {
		eventListOpts.Namespace = namespace
	}

	if err := h.K8sClient.Client.List(ctx, eventList, eventListOpts); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list events: " + err.Error()})
		return
	}

	// Filter events that are related to this custom resource
	var relatedEvents []corev1.Event
	for _, event := range eventList.Items {
		if event.InvolvedObject.Name == name &&
			(namespace == "" || event.InvolvedObject.Namespace == namespace) &&
			strings.Contains(event.InvolvedObject.Kind, crdName) {
			relatedEvents = append(relatedEvents, event)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"events": relatedEvents,
	})
}
