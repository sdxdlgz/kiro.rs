import {
  CheckCircle,
  XCircle,
  RefreshCw,
  Trash2,
  MoreHorizontal,
  Eye,
  Loader2,
  Search,
} from 'lucide-react';
import type { AccountInfo, AccountMeta, AccountTag, AccountGroup, AccountActionState } from '@/types';

interface AccountCompactListProps {
  accounts: AccountInfo[];
  metaByName: Record<string, AccountMeta>;
  groups: AccountGroup[];
  tags: AccountTag[];
  actionStates: Record<string, AccountActionState>;
  selectedNames: Set<string>;
  onToggleSelection: (name: string) => void;
  onRefresh: (name: string) => void;
  onReset: (name: string) => void;
  onRemove: (name: string) => void;
  onViewDetails: (name: string) => void;
  onCheck?: (name: string) => void;
}

export function AccountCompactList({
  accounts,
  metaByName,
  groups,
  tags,
  actionStates,
  selectedNames,
  onToggleSelection,
  onRefresh,
  onReset,
  onRemove,
  onViewDetails,
  onCheck,
}: AccountCompactListProps) {
  return (
    <div className="space-y-2">
      {accounts.map((account) => {
        const meta = metaByName[account.name];
        const group = meta?.groupId ? groups.find(g => g.id === meta.groupId) : null;
        const accountTags = meta?.tagIds?.map(id => tags.find(t => t.id === id)).filter(Boolean) as AccountTag[] || [];
        const actionState = actionStates[account.name] || 'idle';
        const isSelected = selectedNames.has(account.name);
        const isLoading = actionState === 'refreshing' || actionState === 'deleting' || actionState === 'checking';

        return (
          <div
            key={account.name}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
              isSelected
                ? 'bg-primary/10 border-primary/30'
                : 'bg-card/50 border-border hover:bg-card/80'
            }`}
          >
            {/* 选择框 */}
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelection(account.name)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/50"
            />

            {/* 状态指示器 */}
            <div className="flex-shrink-0">
              {account.healthy ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
            </div>

            {/* 账号名称 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground truncate">{account.name}</span>
                {group && (
                  <span
                    className="px-2 py-0.5 text-xs rounded-full"
                    style={{
                      backgroundColor: `${group.color}20`,
                      color: group.color,
                    }}
                  >
                    {group.name}
                  </span>
                )}
                {accountTags.slice(0, 2).map(tag => (
                  <span
                    key={tag.id}
                    className="px-2 py-0.5 text-xs rounded-full"
                    style={{
                      backgroundColor: `${tag.color}20`,
                      color: tag.color,
                    }}
                  >
                    {tag.name}
                  </span>
                ))}
                {accountTags.length > 2 && (
                  <span className="text-xs text-muted-foreground">+{accountTags.length - 2}</span>
                )}
              </div>
            </div>

            {/* 认证方式 */}
            <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground w-24">
              <span className="truncate">{account.auth_method || '-'}</span>
            </div>

            {/* 提供商 */}
            <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground w-20">
              <span className="truncate">{account.provider || '-'}</span>
            </div>

            {/* 请求次数 */}
            <div className="hidden lg:flex items-center gap-1 text-sm w-20 justify-end">
              <span className="text-foreground font-medium">{account.request_count}</span>
              <span className="text-muted-foreground">次</span>
            </div>

            {/* 失败次数 */}
            <div className="hidden lg:flex items-center gap-1 text-sm w-20 justify-end">
              <span className={account.failure_count > 0 ? 'text-red-400 font-medium' : 'text-muted-foreground'}>
                {account.failure_count}
              </span>
              <span className="text-muted-foreground">失败</span>
            </div>

            {/* 操作按钮 */}
            <div className="flex items-center gap-1">
              {onCheck && (
                <button
                  onClick={() => onCheck(account.name)}
                  disabled={isLoading}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                  title="检查账号（获取用量、订阅信息）"
                >
                  {actionState === 'checking' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </button>
              )}
              <button
                onClick={() => onRefresh(account.name)}
                disabled={isLoading}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                title="刷新 Token"
              >
                {actionState === 'refreshing' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </button>
              <button
                onClick={() => onViewDetails(account.name)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="查看详情"
              >
                <Eye className="h-4 w-4" />
              </button>
              <button
                onClick={() => onReset(account.name)}
                disabled={isLoading}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                title="重置状态"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              <button
                onClick={() => onRemove(account.name)}
                disabled={isLoading}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                title="删除账号"
              >
                {actionState === 'deleting' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
