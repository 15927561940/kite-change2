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

# Preview production build
pnpm preview
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

# Pre-commit checks (format + lint)
make pre-commit

# Install dependencies
make deps
```

## Key Technical Details

### API Structure
- REST API at `/api/` endpoints
- WebSocket endpoints for real-time features (logs, terminal)
- Authentication via JWT tokens or OAuth
- Resource operations follow Kubernetes API patterns

**Standard Resource Routes:**
```
/api/v1/{resource}                    # List all (cluster-scoped)
/api/v1/{resource}/_all               # List all (namespaced)
/api/v1/{resource}/_all/{name}        # Get cluster-scoped resource
/api/v1/{resource}/{namespace}        # List in namespace
/api/v1/{resource}/{namespace}/{name} # Get namespaced resource
```

**CRD Resource Routes:**
```
/api/v1/{crd}/{namespace}/{name}/related  # Get related resources
/api/v1/{crd}/{namespace}/{name}/events   # Get CR events
/api/v1/{crd}/{namespace}/{name}/restart  # Restart CR (adds annotation)
/api/v1/{crd}/{namespace}/{name}/scale    # Scale CR (updates replicas)
```

### State Management
- Frontend uses React Query for server state
- Context providers for auth (`contexts/auth-context.tsx`)
- Global search provider for resource search

### Resource Management
- **Generic Handler Pattern**: Uses Go generics (`GenericResourceHandler[T, V]`) for type-safe CRUD operations across all resource types
- **Dynamic CRD Support**: CRD handler uses `unstructured.Unstructured` to support any custom resource without code changes
- **Enhanced Custom Resource Definition (CRD) support**:
  - Full CRD detail pages with deployment-like functionality
  - Related resource discovery (pods, services) via label matching
  - Scale and restart operations for CRs with replicas
  - Events tracking for custom resources
  - Complete YAML editing, logs, terminal, and monitoring
- **Pluggable Search**: Resource-specific search functions registered via `RegisterSearchFunc()`
- YAML editing with validation via Monaco editor
- Real-time log streaming and web terminal access

### Environment Variables
Key environment variables for development:
- `PORT`: Server port (default: 8080)
- `KUBECONFIG`: Kubernetes config path
- `PROMETHEUS_URL`: Prometheus server URL for metrics
- `JWT_SECRET`: JWT signing secret
- `OAUTH_ENABLED`: Enable OAuth authentication
- `OAUTH_PROVIDERS`: Comma-separated list of enabled OAuth providers
- `OAUTH_ALLOW_USERS`: Whitelist of allowed users (supports wildcard `*` for all)
- `{PROVIDER}_CLIENT_ID`, `{PROVIDER}_CLIENT_SECRET`: OAuth provider credentials (e.g., GITHUB_CLIENT_ID)
- `{PROVIDER}_REDIRECT_URL`: OAuth callback URL
- `KITE_USERNAME`/`KITE_PASSWORD`: Basic auth credentials
- `ENABLE_ANALYTICS`: Enable anonymous usage analytics (default: false)
- `DISABLE_CACHE`: Disable controller-runtime cache for testing (default: false)
- `READONLY`: Enable read-only mode (blocks POST/PUT/DELETE) (default: false)
- `NODE_TERMINAL_IMAGE`: Image for node terminal pods (default: busybox:latest)

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

### Kubernetes Client Initialization
The application tries in-cluster config first (when running in a pod), then falls back to kubeconfig file. The client uses controller-runtime's cached client for better performance (can be disabled with `DISABLE_CACHE=true`).

### Adding New Resource Types
1. Create a new handler in `pkg/handlers/resources/` using `GenericResourceHandler[T, V]`
2. Register in `pkg/handlers/resources/register.go` using `RegisterResource()`
3. Optional: Implement custom routes via `registerCustomRoutes()` method
4. Optional: Add search support via `RegisterSearchFunc()`

### OAuth Provider Configuration
- Built-in support for GitHub OAuth
- Generic OAuth provider supports any OAuth2-compliant provider
- Set environment variables: `{PROVIDER}_CLIENT_ID`, `{PROVIDER}_CLIENT_SECRET`, `{PROVIDER}_AUTH_URL`, `{PROVIDER}_TOKEN_URL`, `{PROVIDER}_USER_INFO_URL`
- Add provider name to `OAUTH_PROVIDERS` comma-separated list

### Authentication Flow
1. Client requests `/api/auth/providers` to get available providers
2. Client initiates login with `/api/auth/login?provider=github`
3. Server returns `auth_url` (OAuth provider's authorization endpoint)
4. OAuth provider redirects to `/api/auth/callback?code=...`
5. Server exchanges code for token and generates JWT
6. JWT stored in HTTP-only cookie (falls back to Authorization header)

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

## Important Development Guidelines

### Code Quality & Testing
- Always run `make lint` and `make pre-commit` before committing changes
- Backend uses golangci-lint for Go code quality
- Frontend uses ESLint and Prettier for TypeScript/React code
- No dedicated test framework is currently configured - verify changes manually

### Authentication Flow
- JWT-based authentication with automatic token refresh
- API client in `ui/src/lib/api-client.ts` handles 401 responses automatically
- Auth context provides login/logout functionality across the app
- Supports both OAuth (GitHub) and username/password authentication

### WebSocket Connections
- Terminal functionality uses WebSocket connections (`/api/v1/terminal/:namespace/:podName/ws`)
- Node terminal access via `/api/v1/node-terminal/:nodeName/ws`
- Real-time log streaming through WebSocket endpoints

### Resource Handler Architecture
- Generic resource handlers in `pkg/handlers/resources/` support all Kubernetes types
- Custom resource (CR) handler provides dynamic support for any CRD
- Resource operations are standardized: List, Get, Create, Update, Delete
- Search functionality is pluggable via `RegisterSearchFunc`

### Static Asset Embedding
- Frontend build output is embedded in Go binary via `//go:embed static`
- Production builds serve everything from a single binary
- Development mode runs frontend and backend separately (backend on 8080, frontend on 5173)

## Deployment Architecture

### Docker Build
Multi-stage Dockerfile:
1. **Frontend builder**: Node 20 Alpine, installs pnpm, builds React app
2. **Backend builder**: Go 1.24 Alpine, builds Go binary with embedded static assets
3. **Runtime**: distroless/static:nonroot (minimal, secure base image)

### Kubernetes Deployment
- Deployed as single Deployment in `kube-system` namespace
- Requires ClusterRole binding for full cluster access (uses `cluster-admin` role)
- ServiceAccount: `kite` in `kube-system`
- Resource limits: 100m-1000m CPU, 128Mi-512Mi memory
- Access via `kubectl port-forward -n kube-system svc/kite 8080:80`

### In-Cluster vs External
- **In-cluster**: Uses ServiceAccount token automatically, no kubeconfig needed
- **External**: Reads from `~/.kube/config` or `KUBECONFIG` environment variable