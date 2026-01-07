import { useState, useEffect } from 'react'
import { ThemeProvider } from './hooks/useTheme'
import { Sidebar } from './components/Sidebar'
import { Dashboard } from './pages/Dashboard'
import { Accounts } from './pages/Accounts'
import { ApiKeys } from './pages/ApiKeys'
import { Usage } from './pages/Usage'
import { ErrorLogs } from './pages/ErrorLogs'
import { Login } from './pages/Login'
import { hasAdminApiKey, clearAdminApiKey, getPoolStatus } from './api'

function AppContent() {
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)

  // 检查是否已有有效的 API Key
  useEffect(() => {
    const checkAuth = async () => {
      if (hasAdminApiKey()) {
        // 验证 API Key 是否有效
        const result = await getPoolStatus()
        if (result.success) {
          setIsAuthenticated(true)
        } else {
          // Key 无效，清除
          clearAdminApiKey()
        }
      }
      setCheckingAuth(false)
    }
    checkAuth()
  }, [])

  const handleLogin = () => {
    setIsAuthenticated(true)
  }

  const handleLogout = () => {
    clearAdminApiKey()
    setIsAuthenticated(false)
  }

  // 检查认证状态中
  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  // 未认证，显示登录页
  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />
      case 'accounts':
        return <Accounts />
      case 'api-keys':
        return <ApiKeys />
      case 'usage':
        return <Usage />
      case 'error-logs':
        return <ErrorLogs />
      default:
        return <Dashboard />
    }
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* 全局背景装饰 */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-br from-primary/5 to-primary/5 rounded-full blur-3xl" />
      </div>

      {/* 侧边栏 */}
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} onLogout={handleLogout} />

      {/* 主内容区 */}
      <main className="relative flex-1 overflow-auto">
        {/* 内容区背景网格 */}
        <div className="absolute inset-0 bg-[linear-gradient(var(--color-border)_1px,transparent_1px),linear-gradient(90deg,var(--color-border)_1px,transparent_1px)] bg-[size:32px_32px] opacity-30 pointer-events-none" />

        {/* 页面内容 */}
        <div className="relative p-6 min-h-full">
          {renderPage()}
        </div>
      </main>
    </div>
  )
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  )
}

export default App
