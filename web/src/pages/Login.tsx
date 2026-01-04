import { useState } from 'react'
import { Key, LogIn, AlertCircle } from 'lucide-react'
import { setAdminApiKey, getPoolStatus } from '@/api'

interface LoginProps {
  onLogin: () => void
}

export function Login({ onLogin }: LoginProps) {
  const [apiKey, setApiKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!apiKey.trim()) {
      setError('请输入 API Key')
      return
    }

    setLoading(true)
    setError(null)

    // 先保存 API Key
    setAdminApiKey(apiKey.trim())

    // 尝试调用 API 验证
    const result = await getPoolStatus()

    if (result.success) {
      onLogin()
    } else {
      setError(result.error || '认证失败，请检查 API Key 是否正确')
      // 清除无效的 key
      localStorage.removeItem('adminApiKey')
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* 背景装饰 */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="bg-card rounded-2xl border border-border shadow-xl overflow-hidden">
          {/* 头部 */}
          <div className="px-8 py-6 bg-gradient-to-r from-primary/10 via-transparent to-primary/10 border-b border-border">
            <div className="flex items-center justify-center gap-3">
              <div className="p-3 rounded-xl bg-primary/20">
                <Key className="h-8 w-8 text-primary" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-center mt-4 text-foreground">Kiro.rs 管理后台</h1>
            <p className="text-sm text-muted-foreground text-center mt-2">请输入管理员 API Key 登录</p>
          </div>

          {/* 表单 */}
          <form onSubmit={handleSubmit} className="p-8 space-y-6">
            {error && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-destructive flex items-center gap-3">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Admin API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="输入您的 API Key"
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-2">
                API Key 配置在 .env 文件的 ADMIN_API_KEY 中
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <>
                  <div className="h-5 w-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  验证中...
                </>
              ) : (
                <>
                  <LogIn className="h-5 w-5" />
                  登录
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
