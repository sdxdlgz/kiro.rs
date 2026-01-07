import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, RefreshCw, Trash2, AlertCircle, Clock, User, Zap, FileWarning } from 'lucide-react'
import { getErrorLogs, clearErrorLogs } from '@/api'
import type { ApiErrorLogEntry } from '@/types'

export function ErrorLogs() {
  const [logs, setLogs] = useState<ApiErrorLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadLogs = useCallback(async () => {
    setLoading(true)
    setError(null)

    const result = await getErrorLogs()
    if (result.success && result.data) {
      setLogs(result.data)
    } else {
      setError(result.error || '加载错误日志失败')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  const handleClear = async () => {
    if (!confirm('确定要清空所有错误日志吗？此操作不可恢复。')) {
      return
    }

    setClearing(true)
    const result = await clearErrorLogs()
    if (result.success) {
      setLogs([])
    } else {
      setError(result.error || '清空日志失败')
    }
    setClearing(false)
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const getErrorTypeLabel = (errorType: string) => {
    switch (errorType) {
      case '400':
        return { label: '400 Bad Request', color: 'text-red-500 bg-red-500/10 border-red-500/30' }
      case '429':
        return { label: '429 Rate Limited', color: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30' }
      default:
        return { label: `${errorType} Error`, color: 'text-orange-500 bg-orange-500/10 border-orange-500/30' }
    }
  }

  const getStatusCodeColor = (statusCode: number) => {
    if (statusCode === 400) return 'text-red-500'
    if (statusCode === 429) return 'text-yellow-500'
    if (statusCode >= 500) return 'text-orange-500'
    return 'text-muted-foreground'
  }

  return (
    <div className="space-y-6">
      {/* 页面头部 */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-red-600/20 via-orange-500/20 to-yellow-500/20 p-6 border border-red-500/20">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-red-500/20 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-orange-500/20 to-transparent rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/30">
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">错误日志</h1>
              <p className="text-muted-foreground mt-1">查看 API 请求错误记录（400/429 等）</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {logs.length > 0 && (
              <button
                onClick={handleClear}
                disabled={clearing}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-500 rounded-lg transition-colors font-medium disabled:opacity-50"
              >
                {clearing ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {clearing ? '清空中...' : '清空日志'}
              </button>
            )}
            <button
              onClick={loadLogs}
              className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* 快速统计 */}
        <div className="relative mt-6 grid grid-cols-4 gap-4">
          <div className="bg-card/50 rounded-xl p-4 border border-border">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <FileWarning className="h-4 w-4 text-red-500" />
              <span>总错误数</span>
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">{logs.length}</p>
          </div>
          <div className="bg-card/50 rounded-xl p-4 border border-border">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <span>400 错误</span>
            </div>
            <p className="text-2xl font-bold text-red-500 mt-1">
              {logs.filter(l => l.status_code === 400).length}
            </p>
          </div>
          <div className="bg-card/50 rounded-xl p-4 border border-border">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Zap className="h-4 w-4 text-yellow-500" />
              <span>429 限流</span>
            </div>
            <p className="text-2xl font-bold text-yellow-500 mt-1">
              {logs.filter(l => l.status_code === 429).length}
            </p>
          </div>
          <div className="bg-card/50 rounded-xl p-4 border border-border">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <span>其他错误</span>
            </div>
            <p className="text-2xl font-bold text-orange-500 mt-1">
              {logs.filter(l => l.status_code !== 400 && l.status_code !== 429).length}
            </p>
          </div>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-destructive flex items-center gap-3">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <div>
            <p className="font-medium">加载失败</p>
            <p className="text-sm opacity-80">{error}</p>
          </div>
        </div>
      )}

      {/* 错误日志列表 */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/20">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">错误记录</h2>
              <p className="text-xs text-muted-foreground">最近 500 条 API 请求错误</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12">
              <div className="inline-flex p-4 rounded-2xl bg-muted mb-4">
                <AlertTriangle className="h-12 w-12 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">暂无错误日志</h3>
              <p className="text-muted-foreground">API 请求错误将记录在这里</p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log, index) => {
                const errorType = getErrorTypeLabel(log.error_type)
                return (
                  <div
                    key={index}
                    className="bg-muted/30 rounded-xl p-4 border border-border hover:border-border/80 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`px-2 py-1 text-xs font-medium rounded-md border ${errorType.color}`}>
                            {errorType.label}
                          </span>
                          <span className={`text-sm font-mono ${getStatusCodeColor(log.status_code)}`}>
                            HTTP {log.status_code}
                          </span>
                          {log.is_stream && (
                            <span className="px-2 py-1 text-xs font-medium rounded-md bg-blue-500/10 text-blue-500 border border-blue-500/30">
                              流式
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-foreground font-mono break-all line-clamp-3">
                          {log.message || '无错误消息'}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground flex-shrink-0">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>{formatTimestamp(log.timestamp)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          <span>{log.account_name}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
