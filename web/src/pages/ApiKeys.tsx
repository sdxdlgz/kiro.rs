import { useState, useEffect, useCallback } from 'react'
import { Key, Plus, Trash2, Copy, Check, Power, PowerOff, RefreshCw, User, Clock, Zap, AlertCircle, CheckCircle } from 'lucide-react'
import { listApiKeys, createApiKey, updateApiKey, deleteApiKey } from '@/api'
import type { ApiKeyListItem, CreateApiKeyRequest } from '@/types'

export function ApiKeys() {
  const [apiKeys, setApiKeys] = useState<ApiKeyListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyExpires, setNewKeyExpires] = useState('')
  const [newKeyRateLimit, setNewKeyRateLimit] = useState('')
  const [creating, setCreating] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const loadApiKeys = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await listApiKeys()
    if (result.success && result.data) {
      setApiKeys(result.data)
    } else {
      setError(result.error || '加载 API Key 列表失败')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadApiKeys()
  }, [loadApiKeys])

  const handleCreate = async () => {
    if (!newKeyName.trim()) {
      setError('请输入 Key 名称')
      return
    }

    setCreating(true)
    setError(null)

    const data: CreateApiKeyRequest = {
      name: newKeyName.trim(),
    }
    if (newKeyExpires) {
      data.expiresAt = new Date(newKeyExpires).toISOString()
    }
    if (newKeyRateLimit) {
      data.rateLimit = parseInt(newKeyRateLimit, 10)
    }

    const result = await createApiKey(data)
    if (result.success && result.data) {
      setCreatedKey(result.data.key)
      setNewKeyName('')
      setNewKeyExpires('')
      setNewKeyRateLimit('')
      loadApiKeys()
    } else {
      setError(result.error || '创建 API Key 失败')
    }
    setCreating(false)
  }

  const handleCopyKey = async () => {
    if (createdKey) {
      await navigator.clipboard.writeText(createdKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleToggleEnabled = async (key: ApiKeyListItem) => {
    const result = await updateApiKey(key.id, { enabled: !key.enabled })
    if (result.success) {
      loadApiKeys()
    } else {
      setError(result.error || '更新 API Key 失败')
    }
  }

  const handleDelete = async (key: ApiKeyListItem) => {
    if (!confirm(`确定要删除 API Key "${key.name}" 吗？\n\n注意：删除后该 Key 将无法使用，但其用量记录会保留以便查询和导出。`)) {
      return
    }

    const result = await deleteApiKey(key.id)
    if (result.success) {
      loadApiKeys()
    } else {
      setError(result.error || '删除 API Key 失败')
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('zh-CN')
  }

  const enabledCount = apiKeys.filter(k => k.enabled).length

  return (
    <div className="space-y-6">
      {/* 页面头部 */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary/20 via-purple-600/20 to-primary/20 p-6 border border-primary/20">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-primary/20 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-purple-500/20 to-transparent rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-primary/20 border border-primary/30">
              <Key className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">API Key 管理</h1>
              <p className="text-muted-foreground mt-1">创建和管理对外分发的 API Key</p>
            </div>
          </div>
          <button
            onClick={loadApiKeys}
            className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
        </div>

        {/* 快速统计 */}
        <div className="relative mt-6 grid grid-cols-3 gap-4">
          <div className="bg-card/50 rounded-xl p-4 border border-border">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Key className="h-4 w-4" />
              <span>总 Key 数</span>
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">{apiKeys.length}</p>
          </div>
          <div className="bg-card/50 rounded-xl p-4 border border-border">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span>已启用</span>
            </div>
            <p className="text-2xl font-bold text-green-500 mt-1">{enabledCount}</p>
          </div>
          <div className="bg-card/50 rounded-xl p-4 border border-border">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <PowerOff className="h-4 w-4 text-muted-foreground" />
              <span>已禁用</span>
            </div>
            <p className="text-2xl font-bold text-muted-foreground mt-1">{apiKeys.length - enabledCount}</p>
          </div>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-destructive flex items-center gap-3">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <div>
            <p className="font-medium">操作失败</p>
            <p className="text-sm opacity-80">{error}</p>
          </div>
        </div>
      )}

      {/* 新创建的 Key 提示 */}
      {createdKey && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 text-green-500 mb-3">
            <CheckCircle className="h-5 w-5" />
            <span className="font-medium">API Key 创建成功</span>
          </div>
          <p className="text-sm text-muted-foreground mb-3">请立即复制保存，此 Key 只显示一次。</p>
          <div className="flex items-center gap-3">
            <code className="flex-1 bg-muted/50 p-3 rounded-xl text-sm font-mono break-all border border-border">
              {createdKey}
            </code>
            <button
              onClick={handleCopyKey}
              className="flex items-center gap-2 px-4 py-3 bg-green-500/20 hover:bg-green-500/30 text-green-500 rounded-xl transition-colors font-medium shrink-0"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? '已复制' : '复制'}
            </button>
          </div>
        </div>
      )}

      {/* 创建新 Key */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-gradient-to-r from-primary/5 via-transparent to-primary/5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/20">
              <Plus className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">创建新 API Key</h2>
              <p className="text-xs text-muted-foreground mt-0.5">创建一个新的 API Key 用于对外分发</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="grid gap-4 md:grid-cols-4">
            {/* 名称 */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                <User className="h-4 w-4 text-muted-foreground" />
                名称
                <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="例如：用户A"
                className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all"
              />
            </div>

            {/* 过期时间 */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                过期时间
                <span className="text-muted-foreground text-xs">（可选）</span>
              </label>
              <input
                type="datetime-local"
                value={newKeyExpires}
                onChange={(e) => setNewKeyExpires(e.target.value)}
                className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all"
              />
            </div>

            {/* 速率限制 */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                <Zap className="h-4 w-4 text-muted-foreground" />
                速率限制
                <span className="text-muted-foreground text-xs">（可选）</span>
              </label>
              <input
                type="number"
                value={newKeyRateLimit}
                onChange={(e) => setNewKeyRateLimit(e.target.value)}
                placeholder="每分钟请求数"
                className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all"
              />
            </div>

            {/* 创建按钮 */}
            <div className="flex items-end">
              <button
                onClick={handleCreate}
                disabled={creating || !newKeyName.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 text-primary-foreground rounded-xl transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/25"
              >
                {creating ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>创建中...</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    <span>创建 Key</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Key 列表 */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/20">
              <Key className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">API Key 列表</h2>
              <p className="text-xs text-muted-foreground">共 {apiKeys.length} 个 API Key</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : apiKeys.length === 0 ? (
            <div className="text-center py-12">
              <div className="inline-flex p-4 rounded-2xl bg-muted mb-4">
                <Key className="h-12 w-12 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">暂无 API Key</h3>
              <p className="text-muted-foreground">使用上方表单创建第一个 API Key</p>
            </div>
          ) : (
            <div className="space-y-3">
              {apiKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{key.name}</span>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                        key.enabled
                          ? 'bg-green-500/20 text-green-600 dark:text-green-400 border border-green-500/30'
                          : 'bg-muted text-muted-foreground border border-border'
                      }`}>
                        {key.enabled ? (
                          <CheckCircle className="h-3 w-3" />
                        ) : (
                          <PowerOff className="h-3 w-3" />
                        )}
                        {key.enabled ? '启用' : '禁用'}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground font-mono">
                      {key.keyPrefix}...
                    </div>
                    <div className="text-xs text-muted-foreground">
                      创建于 {formatDate(key.createdAt)}
                      {key.expiresAt && ` · 过期于 ${formatDate(key.expiresAt)}`}
                      {key.rateLimit && ` · 限速 ${key.rateLimit}/分钟`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleEnabled(key)}
                      className={`p-2 rounded-lg transition-colors ${
                        key.enabled
                          ? 'hover:bg-orange-500/20 text-orange-500'
                          : 'hover:bg-green-500/20 text-green-500'
                      }`}
                      title={key.enabled ? '禁用' : '启用'}
                    >
                      {key.enabled ? (
                        <PowerOff className="h-4 w-4" />
                      ) : (
                        <Power className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(key)}
                      className="p-2 hover:bg-destructive/20 text-destructive rounded-lg transition-colors"
                      title="删除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
