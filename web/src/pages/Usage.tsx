import { useState, useEffect, useCallback } from 'react'
import { BarChart3, DollarSign, Zap, TrendingUp, RefreshCw, Key, Cpu, Clock, Calendar, AlertCircle, Download } from 'lucide-react'
import { queryUsage, listApiKeys, exportUsage } from '@/api'
import type { UsageResponse, UsageQueryParams, ApiKeyListItem } from '@/types'
import { CustomSelect } from '@/components/ui/CustomSelect'

export function Usage() {
  const [usage, setUsage] = useState<UsageResponse | null>(null)
  const [apiKeys, setApiKeys] = useState<ApiKeyListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 筛选条件
  const [selectedKeyId, setSelectedKeyId] = useState<string>('')
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [groupBy, setGroupBy] = useState<'none' | 'model' | 'day' | 'hour'>('model')
  const [startTime, setStartTime] = useState<string>('')
  const [endTime, setEndTime] = useState<string>('')

  const loadApiKeys = useCallback(async () => {
    const result = await listApiKeys()
    if (result.success && result.data) {
      setApiKeys(result.data)
    }
  }, [])

  const loadUsage = useCallback(async () => {
    setLoading(true)
    setError(null)

    const params: UsageQueryParams = {
      groupBy,
    }
    if (selectedKeyId) params.apiKeyId = parseInt(selectedKeyId, 10)
    if (selectedModel) params.model = selectedModel
    if (startTime) params.startTime = new Date(startTime).toISOString()
    if (endTime) params.endTime = new Date(endTime).toISOString()

    const result = await queryUsage(params)
    if (result.success && result.data) {
      setUsage(result.data)
    } else {
      setError(result.error || '加载用量数据失败')
    }
    setLoading(false)
  }, [selectedKeyId, selectedModel, groupBy, startTime, endTime])

  useEffect(() => {
    loadApiKeys()
  }, [loadApiKeys])

  useEffect(() => {
    loadUsage()
  }, [loadUsage])

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(2) + 'M'
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(2) + 'K'
    }
    return num.toString()
  }

  const formatCost = (cost: number) => {
    if (cost === 0) return '$0.00'
    if (cost < 0.000001) return '<$0.000001'
    // 使用6位小数，然后智能截断尾部零（最低保留2位）
    const formatted = cost.toFixed(6)
    // 移除尾部多余的零，但至少保留2位小数
    const trimmed = formatted.replace(/(\.\d{2,}?)0+$/, '$1')
    return '$' + trimmed
  }

  const handleExport = async () => {
    setExporting(true)
    setError(null)

    try {
      const params: UsageQueryParams = {}
      if (selectedKeyId) params.apiKeyId = parseInt(selectedKeyId, 10)
      if (selectedModel) params.model = selectedModel
      if (startTime) params.startTime = new Date(startTime).toISOString()
      if (endTime) params.endTime = new Date(endTime).toISOString()

      const blob = await exportUsage(params)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `usage-${new Date().toISOString().split('T')[0]}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      setError('导出失败，请重试')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 页面头部 */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-600/20 via-primary/20 to-purple-600/20 p-6 border border-purple-500/20">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-purple-500/20 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-primary/20 to-transparent rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-purple-500/20 border border-purple-500/30">
              <BarChart3 className="h-8 w-8 text-purple-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">用量统计</h1>
              <p className="text-muted-foreground mt-1">查看 API Key 的 Token 用量和费用统计</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-2 px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-500 rounded-lg transition-colors font-medium disabled:opacity-50"
            >
              {exporting ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {exporting ? '导出中...' : '导出 XLSX'}
            </button>
            <button
              onClick={loadUsage}
              className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* 快速统计 */}
        {usage && (
          <div className="relative mt-6 grid grid-cols-5 gap-4">
            <div className="bg-card/50 rounded-xl p-4 border border-border">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                <span>总请求</span>
              </div>
              <p className="text-2xl font-bold text-foreground mt-1">{usage.summary.totalRequests.toLocaleString()}</p>
            </div>
            <div className="bg-card/50 rounded-xl p-4 border border-border">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Zap className="h-4 w-4 text-green-500" />
                <span>输入 Token</span>
              </div>
              <p className="text-2xl font-bold text-green-500 mt-1">{formatNumber(usage.summary.totalInputTokens)}</p>
            </div>
            <div className="bg-card/50 rounded-xl p-4 border border-border">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Zap className="h-4 w-4 text-purple-500" />
                <span>输出 Token</span>
              </div>
              <p className="text-2xl font-bold text-purple-500 mt-1">{formatNumber(usage.summary.totalOutputTokens)}</p>
            </div>
            <div className="bg-card/50 rounded-xl p-4 border border-border">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <BarChart3 className="h-4 w-4 text-yellow-500" />
                <span>总 Token</span>
              </div>
              <p className="text-2xl font-bold text-foreground mt-1">{formatNumber(usage.summary.totalTokens)}</p>
            </div>
            <div className="bg-card/50 rounded-xl p-4 border border-border">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <DollarSign className="h-4 w-4 text-red-500" />
                <span>总费用</span>
              </div>
              <p className="text-2xl font-bold text-red-500 mt-1">{formatCost(usage.summary.totalCost)}</p>
            </div>
          </div>
        )}
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

      {/* 筛选条件 */}
      <div className="bg-card rounded-2xl border border-border">
        <div className="px-6 py-4 border-b border-border bg-gradient-to-r from-primary/5 via-transparent to-primary/5 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/20">
              <Key className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">筛选条件</h2>
              <p className="text-xs text-muted-foreground mt-0.5">按 API Key、模型、时间范围筛选用量数据</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="grid gap-4 md:grid-cols-5">
            {/* API Key */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                <Key className="h-4 w-4 text-muted-foreground" />
                API Key
              </label>
              <CustomSelect
                value={selectedKeyId}
                onChange={setSelectedKeyId}
                options={[
                  { value: '', label: '全部' },
                  { value: '0', label: 'admin' },
                  ...apiKeys.filter(key => key.id !== 0).map((key) => ({ value: key.id.toString(), label: key.name }))
                ]}
                placeholder="选择 API Key"
              />
            </div>

            {/* 模型 */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                <Cpu className="h-4 w-4 text-muted-foreground" />
                模型
              </label>
              <CustomSelect
                value={selectedModel}
                onChange={setSelectedModel}
                options={[
                  { value: '', label: '全部' },
                  { value: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5' },
                  { value: 'claude-opus-4.5', label: 'Claude Opus 4.5' },
                  { value: 'claude-haiku-4.5', label: 'Claude Haiku 4.5' },
                  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
                  { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
                  { value: 'claude-opus-4-5-20251101', label: 'Claude Opus 4.5 (Full)' },
                  { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5 (Full)' },
                  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (Full)' },
                ]}
                placeholder="选择模型"
              />
            </div>

            {/* 分组方式 */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                分组方式
              </label>
              <CustomSelect
                value={groupBy}
                onChange={(value) => setGroupBy(value as 'none' | 'model' | 'day' | 'hour')}
                options={[
                  { value: 'none', label: '不分组' },
                  { value: 'model', label: '按模型' },
                  { value: 'day', label: '按天' },
                  { value: 'hour', label: '按小时' },
                ]}
                placeholder="选择分组方式"
              />
            </div>

            {/* 开始时间 */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                开始时间
              </label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all"
              />
            </div>

            {/* 结束时间 */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                结束时间
              </label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 用量详情 */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <Calendar className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">用量详情</h2>
              <p className="text-xs text-muted-foreground">
                {groupBy === 'none' ? '所有用量记录' : `按${groupBy === 'model' ? '模型' : groupBy === 'day' ? '天' : '小时'}分组的用量统计`}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !usage || usage.groups.length === 0 ? (
            <div className="text-center py-12">
              <div className="inline-flex p-4 rounded-2xl bg-muted mb-4">
                <BarChart3 className="h-12 w-12 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">暂无用量数据</h3>
              <p className="text-muted-foreground">使用 API Key 发送请求后，用量数据将显示在这里</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {groupBy === 'model' ? '模型' : groupBy === 'day' ? '日期' : groupBy === 'hour' ? '时间' : '分组'}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">请求数</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">输入 Token</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">输出 Token</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">总 Token</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">费用</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {usage.groups.map((group, index) => (
                    <tr key={index} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-medium text-foreground">
                          {formatGroupKey(group.key, groupBy)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap font-mono">
                        {group.requests.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap font-mono text-green-600 dark:text-green-400">
                        {formatNumber(group.inputTokens)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap font-mono text-purple-600 dark:text-purple-400">
                        {formatNumber(group.outputTokens)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap font-mono">
                        {formatNumber(group.totalTokens)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap font-mono text-red-600 dark:text-red-400">
                        {formatCost(group.cost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30 font-medium">
                  <tr>
                    <td className="px-4 py-3 whitespace-nowrap">合计</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap font-mono">
                      {usage.summary.totalRequests.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap font-mono text-green-600 dark:text-green-400">
                      {formatNumber(usage.summary.totalInputTokens)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap font-mono text-purple-600 dark:text-purple-400">
                      {formatNumber(usage.summary.totalOutputTokens)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap font-mono">
                      {formatNumber(usage.summary.totalTokens)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap font-mono text-red-600 dark:text-red-400">
                      {formatCost(usage.summary.totalCost)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function formatGroupKey(key: string, groupBy: string): string {
  if (groupBy === 'model') {
    // 简化模型名称显示
    if (key === 'claude-sonnet-4.5') return 'Claude Sonnet 4.5'
    if (key === 'claude-opus-4.5') return 'Claude Opus 4.5'
    if (key === 'claude-haiku-4.5') return 'Claude Haiku 4.5'
    if (key === 'claude-sonnet-4-20250514') return 'Claude Sonnet 4'
    if (key === 'claude-opus-4-20250514') return 'Claude Opus 4'
    if (key.includes('opus-4-5')) return 'Claude Opus 4.5'
    if (key.includes('sonnet-4-5')) return 'Claude Sonnet 4.5'
    if (key.includes('haiku-4-5')) return 'Claude Haiku 4.5'
    if (key.includes('opus')) return 'Claude Opus'
    if (key.includes('sonnet')) return 'Claude Sonnet'
    if (key.includes('haiku')) return 'Claude Haiku'
    return key
  }
  return key
}
