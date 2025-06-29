import { createBrowserRouter, useParams } from 'react-router-dom'

import App from './App'
import { ProtectedRoute } from './components/protected-route'
import { CRDetail } from './pages/cr-detail'
import { CRListPage } from './pages/cr-list-page'
import { LoginPage } from './pages/login'
import { Overview } from './pages/overview'
import { ResourceDetail } from './pages/resource-detail'
import { ResourceList } from './pages/resource-list'

// Wrapper component to handle route parameters for CRDetail
function CRDetailWrapper() {
  const { crd, namespace, name } = useParams<{
    crd: string
    namespace?: string
    name: string
  }>()
  
  if (!crd || !name) {
    return <div>Invalid route parameters</div>
  }
  
  return <CRDetail crd={crd} namespace={namespace} name={name} />
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <App />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <Overview />,
      },
      {
        path: 'dashboard',
        element: <Overview />,
      },
      {
        path: 'crds/:crd',
        element: <CRListPage />,
      },
      // for namespaced CRD resources
      {
        path: 'crds/:crd/:namespace/:name',
        element: <CRDetailWrapper />,
      },
      // for cluster-scoped CRD resources
      {
        path: 'crds/:crd/:name',
        element: <CRDetailWrapper />,
      },
      {
        path: ':resource/:name',
        element: <ResourceDetail />,
      },
      {
        path: ':resource',
        element: <ResourceList />,
      },
      {
        path: ':resource/:namespace/:name',
        element: <ResourceDetail />,
      },
    ],
  },
])
