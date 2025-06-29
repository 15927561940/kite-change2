# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kite is a modern Kubernetes dashboard built with Go backend and React/TypeScript frontend. It provides comprehensive cluster management, resource monitoring, and an intuitive web interface for Kubernetes operations.

### Architecture

- **Backend**: Go with Gin framework (`main.go`, `pkg/` directory)
  - API handlers in `pkg/handlers/` (resource management, logs, terminal, auth)  
  - Kubernetes client wrapper in `pkg/kube/`
  - Authentication providers in `pkg/auth/`
  - Prometheus integration in `pkg/prometheus/`
  - Middleware for CORS, logging, readonly mode in `pkg/middleware/`

- **Frontend**: React 19 + TypeScript with Vite (`ui/` directory)
  - Component library using Radix UI primitives (`ui/src/components/ui/`)
  - Custom components for Kubernetes resources (`ui/src/components/`)
  - React Query for API state management (`ui/src/lib/api-client.ts`)
  - Monaco editor for YAML editing
  - xterm.js for web terminal functionality

## Development Commands

### Build & Run
```bash
# Install all dependencies
make deps

# Build both frontend and backend
make build

# Run production build
make run

# Development mode (starts backend + frontend dev server)
make dev
```

### Frontend Commands (in ui/ directory)
```bash
# Development server
pnpm dev

# Build for production  
pnpm build

# Type checking
pnpm type-check

# Linting
pnpm lint

# Code formatting
pnpm format
```

### Backend Commands
```bash
# Build Go binary
make backend

# Run linting (requires golangci-lint)
make lint

# Format Go code
go fmt ./...
```

### Testing & Quality
```bash
# Run all linting (Go + frontend)
make lint

# Format all code
make format

# Pre-commit checks
make pre-commit
```

## Key Technical Details

### API Structure
- REST API at `/api/` endpoints
- WebSocket endpoints for real-time features (logs, terminal)
- Authentication via JWT tokens or OAuth
- Resource operations follow Kubernetes API patterns

### State Management
- Frontend uses React Query for server state
- Context providers for auth (`contexts/auth-context.tsx`)
- Global search provider for resource search

### Resource Management
- Generic resource handlers support all Kubernetes resource types
- **Enhanced Custom Resource Definition (CRD) support**:
  - Full CRD detail pages with deployment-like functionality
  - Related resource discovery (pods, services)
  - Scale and restart operations for CRs with replicas
  - Events tracking for custom resources
  - Complete YAML editing, logs, terminal, and monitoring
- YAML editing with validation via Monaco editor
- Real-time log streaming and web terminal access

### Environment Variables
Key environment variables for development:
- `PORT`: Server port (default: 8080)
- `KUBECONFIG`: Kubernetes config path
- `PROMETHEUS_URL`: Prometheus server URL for metrics
- `JWT_SECRET`: JWT signing secret
- `OAUTH_ENABLED`: Enable OAuth authentication
- `KITE_USERNAME`/`KITE_PASSWORD`: Basic auth credentials

### Dependencies
- Backend: Gin, Kubernetes client-go, Prometheus client
- Frontend: React 19, Radix UI, TanStack Query, Monaco Editor, xterm.js
- Package manager: pnpm for frontend, Go modules for backend

## Development Notes

- Frontend dev server runs on Vite default port (5173)
- Backend serves at port 8080 by default
- Static files are embedded in Go binary via `//go:embed static`
- Uses structured logging with klog
- Supports both in-cluster and external kubeconfig authentication

## CRD Enhancement Details

### Backend Implementation
- Extended `CRHandler` with new methods in `pkg/handlers/resources/cr_handler.go`:
  - `GetCRRelatedResources`: Discovers related pods/services via label matching
  - `RestartCR`: Adds restart annotation to trigger updates
  - `ScaleCR`: Updates replicas field if supported by the CR
  - `GetCREvents`: Filters events related to the custom resource
- New API endpoints:
  - `GET /:crd/:namespace/:name/related` - Get related resources
  - `GET /:crd/:namespace/:name/events` - Get CR events
  - `POST /:crd/:namespace/:name/restart` - Restart CR
  - `POST /:crd/:namespace/:name/scale` - Scale CR

### Frontend Implementation
- New `CRDetail` page (`ui/src/pages/cr-detail.tsx`) with full feature parity to deployment details
- Enhanced API client with CRD-specific methods (`ui/src/lib/api.ts`):
  - `fetchCRRelated`, `useCRRelated` - Related resources
  - `fetchCREvents`, `useCREvents` - Events
  - `scaleCR`, `restartCR` - Operations
- Intelligent feature detection:
  - Scaling UI only appears if CR has `spec.replicas`
  - Status parsing attempts common patterns (phase, conditions, ready)
  - Related pods discovered via label matching
- Complete integration with existing components (Terminal, LogViewer, PodMonitoring, etc.)

### CRD Creation and Management
- **Template System** (`ui/src/lib/templates.ts`):
  - Pre-defined templates for common CRDs (Argo Rollouts, Istio, Prometheus, Cert-Manager, RAGLogPilot)
  - Dynamic form generation based on template fields
  - Field validation with custom rules
  - Template variable substitution
- **Create Dialog** (`ui/src/components/cr-create-dialog.tsx`):
  - Multi-template selection with descriptions
  - Dynamic form fields (string, number, boolean, select)
  - Real-time validation with error display
  - Support for both namespaced and cluster-scoped resources
- **Enhanced Delete Confirmation**:
  - Red-themed warning dialog for dangerous operations
  - Resource name confirmation required
  - Compact design as requested
- **Integrated UI**:
  - Create buttons in CRD list pages
  - Template-based resource creation
  - Automatic refresh after operations