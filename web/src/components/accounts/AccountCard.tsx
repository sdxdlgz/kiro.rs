import { memo, useMemo, useState } from 'react'
import { Card, CardContent, Badge, Button, Progress } from '@/components/ui'
import { cn, toRgba, generateGlowStyle, formatTokenExpiry } from '@/lib/utils'
import type { AccountInfo, AccountMeta, AccountTag, AccountGroup, AccountActionState, CheckAccountResponse } from '@/types'
import {
  Check,
  RefreshCw,
  Trash2,
  Copy,
  AlertTriangle,
  Clock,
  Loader2,
  Info,
  FolderOpen,
  AlertCircle,
  KeyRound,
  Search,
  Zap
} from 'lucide-react'

interface AccountCardProps {
  account: AccountInfo
  meta?: AccountMeta
  groups: AccountGroup[]
  tags: AccountTag[]
  actionState: AccountActionState
  isSelected: boolean
  checkResult?: CheckAccountResponse
  onSelect: () => void
  onRefresh: () => void
  onRefreshToken: () => void
  onRemove: () => void
  onViewDetails: () => void
  onCopyCredentials?: () => void
  onCheck?: () => void
}

// 获取订阅类型颜色
const getSubscriptionColor = (provider?: string): string => {
  const text = (provider || '').toUpperCase()
  if (text.includes('PRO+') || text.includes('PRO_PLUS') || text.includes('PROPLUS')) return 'bg-purple-500'
  if (text.includes('POWER')) return 'bg-amber-500'
  if (text.includes('PRO')) return 'bg-blue-500'
  return 'bg-gray-500'
}

export const AccountCard = memo(function AccountCard({
  account,
  meta,
  groups,
  tags,
  actionState,
  isSelected,
  checkResult,
  onSelect,
  onRefresh,
  onRefreshToken,
  onRemove,
  onViewDetails,
  onCopyCredentials,
  onCheck
}: AccountCardProps) {
  const [copied, setCopied] = useState(false)
  const loading = actionState !== 'idle'

  // 获取分组信息
  const group = meta?.groupId ? groups.find(g => g.id === meta.groupId) : undefined

  // 获取标签列表
  const accountTags = useMemo(() => {
    return (meta?.tagIds || [])
      .map(id => tags.find(t => t.id === id))
      .filter((t): t is AccountTag => t !== undefined)
  }, [meta?.tagIds, tags])

  // 生成光环样式
  const glowStyle = useMemo(() => {
    const tagColors = accountTags.map(t => t.color)
    return generateGlowStyle(tagColors)
  }, [accountTags])

  // 检查是否过期
  const expiresAt = account.expires_at ? new Date(account.expires_at).getTime() : undefined
  const isExpiringSoon = expiresAt && (expiresAt - Date.now()) < 5 * 60 * 1000

  // 复制凭证
  const handleCopyCredentials = () => {
    if (onCopyCredentials) {
      onCopyCredentials()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card
      className={cn(
        'relative transition-all duration-300 hover:shadow-lg cursor-pointer h-full flex flex-col overflow-hidden border',
        account.healthy
          ? 'border-transparent hover:border-primary/30'
          : 'border-red-400/50',
        isSelected && 'bg-primary/5 border-primary/50'
      )}
      style={glowStyle}
      onClick={onSelect}
    >
      <CardContent className="p-4 flex-1 flex flex-col gap-3 overflow-hidden">
        {/* Header: Checkbox, Name, Status */}
        <div className="flex gap-3 items-start">
          {/* Checkbox */}
          <div
            className={cn(
              'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 mt-0.5 cursor-pointer',
              isSelected
                ? 'bg-primary border-primary text-primary-foreground'
                : 'border-muted-foreground/30 hover:border-primary'
            )}
            onClick={(e) => {
              e.stopPropagation()
              onSelect()
            }}
          >
            {isSelected && <Check className="h-3.5 w-3.5" />}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-sm truncate text-foreground/90" title={account.email || account.name}>
                {account.email || account.name}
              </h3>
              {/* Status Badge */}
              <div className={cn(
                "text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0",
                account.healthy
                  ? "text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30"
                  : "text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30"
              )}>
                {actionState === 'refreshing' && <Loader2 className="h-3 w-3 animate-spin" />}
                {!account.healthy && <AlertCircle className="h-3 w-3" />}
                {account.healthy ? '正常' : '异常'}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1">
              {account.auth_method && (
                <span className="text-xs text-muted-foreground">{account.auth_method}</span>
              )}
              {group && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex items-center gap-1"
                  style={{ color: group.color, backgroundColor: group.color + '15' }}
                >
                  <FolderOpen className="w-3 h-3" /> {group.name}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Badges Row */}
        <div className="flex items-center gap-2 flex-wrap">
          {account.provider && (
            <Badge className={cn('text-white text-[10px] h-5 px-2 border-0', getSubscriptionColor(account.provider))}>
              {account.provider}
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px] h-5 px-2 text-muted-foreground font-normal border-muted-foreground/30 bg-muted/30">
            {account.in_pool ? '在池中' : '未入池'}
          </Badge>
        </div>

        {/* Usage Section - 使用量 + 请求统计 */}
        <div className="bg-muted/30 p-2.5 rounded-lg space-y-2 border border-border/50">
          {/* 使用量显示 (如果有检查结果) */}
          {checkResult && !checkResult.error && (
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground font-medium flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  使用量
                </span>
                <span className={cn(
                  "font-mono font-medium",
                  checkResult.usagePercent > 80 ? "text-red-500" : checkResult.usagePercent > 50 ? "text-amber-500" : "text-green-500"
                )}>
                  {checkResult.usagePercent.toFixed(0)}%
                </span>
              </div>
              <Progress
                value={checkResult.usagePercent}
                className="h-1.5"
                indicatorClassName={
                  checkResult.usagePercent > 80 ? "bg-red-500" : checkResult.usagePercent > 50 ? "bg-amber-500" : "bg-green-500"
                }
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{checkResult.currentUsage.toFixed(1)} / {checkResult.usageLimit.toFixed(1)}</span>
                {checkResult.nextResetDate && (
                  <span>重置: {new Date(
                    // 如果时间戳小于 1e12，说明是秒，需要转换为毫秒
                    checkResult.nextResetDate < 1e12 ? checkResult.nextResetDate * 1000 : checkResult.nextResetDate
                  ).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}</span>
                )}
              </div>
            </div>
          )}

          {/* 请求统计 (缩小版) */}
          <div className={cn("flex items-center justify-between text-[10px]", checkResult && !checkResult.error && "pt-1.5 border-t border-border/50")}>
            <span className="text-muted-foreground">请求: {account.request_count}</span>
            <span className={cn("font-mono", account.failure_count > 0 ? "text-red-500" : "text-muted-foreground")}>
              失败: {account.failure_count}
            </span>
          </div>
        </div>

        {/* Tags */}
        {accountTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-auto pt-2">
            {accountTags.slice(0, 4).map((tag) => (
              <span
                key={tag.id}
                className="px-1.5 py-0.5 text-[10px] rounded-sm text-white font-medium shadow-sm"
                style={{ backgroundColor: toRgba(tag.color) }}
              >
                {tag.name}
              </span>
            ))}
            {accountTags.length > 4 && (
              <span className="px-1.5 py-0.5 text-[10px] text-muted-foreground bg-muted rounded-sm">
                +{accountTags.length - 4}
              </span>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="pt-3 border-t flex items-center justify-between mt-auto gap-2 shrink-0">
          {/* Left: Token expiry info */}
          <div className="text-[10px] text-muted-foreground flex flex-col leading-tight gap-0.5">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{account.region || 'us-east-1'}</span>
            </div>
            {expiresAt && (
              <div className="flex items-center gap-1" title={new Date(expiresAt).toLocaleString('zh-CN')}>
                <KeyRound className="h-3 w-3" />
                <span className={isExpiringSoon ? "text-red-500 font-medium" : ""}>
                  Token: {formatTokenExpiry(expiresAt)}
                </span>
              </div>
            )}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-0.5">
            {onCheck && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={(e) => { e.stopPropagation(); onCheck() }}
                disabled={loading}
                title="检查账号（获取用量、订阅信息）"
              >
                {actionState === 'checking' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Search className="h-3.5 w-3.5" />
                )}
              </Button>
            )}

            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); onRefresh() }}
              disabled={loading}
              title="刷新账号信息"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", actionState === 'refreshing' && "animate-spin")} />
            </Button>

            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); onRefreshToken() }}
              disabled={loading}
              title="刷新 Token"
            >
              <KeyRound className={cn("h-3.5 w-3.5", loading && "animate-pulse")} />
            </Button>

            <Button
              size="icon"
              variant="ghost"
              className={cn("h-7 w-7 text-muted-foreground hover:text-foreground", copied && "text-green-500")}
              onClick={(e) => { e.stopPropagation(); handleCopyCredentials() }}
              title="复制凭证"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>

            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); onViewDetails() }}
              title="详情"
            >
              <Info className="h-3.5 w-3.5" />
            </Button>

            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-destructive transition-colors"
              onClick={(e) => { e.stopPropagation(); onRemove() }}
              disabled={loading}
              title="删除"
            >
              {actionState === 'deleting' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>

        {/* Error Message */}
        {!account.healthy && account.failure_count > 0 && (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-[10px] p-1.5 rounded flex items-center gap-1.5 truncate mt-1">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span className="truncate">账号状态异常，失败次数: {account.failure_count}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
})
