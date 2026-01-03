import {
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  RotateCcw,
  Trash2,
  Loader2,
  Eye,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import type { AccountInfo, AccountMeta, AccountTag, AccountGroup, AccountActionState, SortField, SortOrder } from '../../types';

interface AccountsTableProps {
  accounts: AccountInfo[];
  metaByName: Record<string, AccountMeta>;
  groups: AccountGroup[];
  tags: AccountTag[];
  actionStates: Record<string, AccountActionState>;
  selectedNames: Set<string>;
  sortField: SortField;
  sortOrder: SortOrder;
  onSort: (field: SortField) => void;
  onToggleSelection: (name: string) => void;
  onSelectAll: () => void;
  onRefresh: (name: string) => void;
  onReset: (name: string) => void;
  onRemove: (name: string) => void;
  onViewDetails: (name: string) => void;
}

export function AccountsTable({
  accounts,
  metaByName,
  groups,
  tags,
  actionStates,
  selectedNames,
  sortField,
  sortOrder,
  onSort,
  onToggleSelection,
  onSelectAll,
  onRefresh,
  onReset,
  onRemove,
  onViewDetails,
}: AccountsTableProps) {
  const allSelected = accounts.length > 0 && accounts.every(a => selectedNames.has(a.name));
  const someSelected = accounts.some(a => selectedNames.has(a.name)) && !allSelected;

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortOrder === 'asc' ? (
      <ChevronUp className="h-4 w-4" />
    ) : (
      <ChevronDown className="h-4 w-4" />
    );
  };

  const HeaderCell = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        <SortIcon field={field} />
      </div>
    </th>
  );

  return (
    <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-900/50 border-b border-slate-700/50">
            <tr>
              <th className="px-4 py-3 w-12">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={onSelectAll}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                />
              </th>
              <HeaderCell field="name">名称</HeaderCell>
              <HeaderCell field="status">状态</HeaderCell>
              <HeaderCell field="provider">提供商</HeaderCell>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                分组/标签
              </th>
              <HeaderCell field="request_count">请求数</HeaderCell>
              <HeaderCell field="failure_count">失败数</HeaderCell>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {accounts.map((account) => {
              const meta = metaByName[account.name];
              const group = meta?.groupId ? groups.find(g => g.id === meta.groupId) : undefined;
              const accountTags = meta?.tagIds?.map(id => tags.find(t => t.id === id)).filter(Boolean) as AccountTag[] ?? [];
              const actionState = actionStates[account.name] ?? 'idle';
              const loading = actionState !== 'idle';
              const isSelected = selectedNames.has(account.name);

              return (
                <tr
                  key={account.name}
                  className={`hover:bg-slate-700/20 transition-colors ${
                    isSelected ? 'bg-blue-500/5' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelection(account.name)}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{account.name}</div>
                    <div className="text-xs text-slate-500">{account.auth_method || 'social'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium ${
                        account.healthy
                          ? 'bg-green-500/10 text-green-400'
                          : 'bg-red-500/10 text-red-400'
                      }`}
                    >
                      {account.healthy ? (
                        <CheckCircle className="h-3 w-3" />
                      ) : (
                        <AlertTriangle className="h-3 w-3" />
                      )}
                      {account.healthy ? '健康' : '异常'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-300">
                    {account.provider || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {group && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-slate-700/50 text-slate-300"
                        >
                          {group.color && (
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: group.color }}
                            />
                          )}
                          {group.name}
                        </span>
                      )}
                      {accountTags.slice(0, 2).map((tag) => (
                        <span
                          key={tag.id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs"
                          style={{
                            backgroundColor: `${tag.color}20`,
                            color: tag.color,
                          }}
                        >
                          {tag.name}
                        </span>
                      ))}
                      {accountTags.length > 2 && (
                        <span className="text-xs text-slate-500">
                          +{accountTags.length - 2}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-white font-medium">
                    {account.request_count.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-medium ${account.failure_count > 0 ? 'text-red-400' : 'text-white'}`}>
                      {account.failure_count}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onViewDetails(account.name)}
                        className="p-1.5 hover:bg-slate-700/50 rounded-lg text-slate-400 hover:text-white transition-colors"
                        title="查看详情"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onRefresh(account.name)}
                        disabled={loading}
                        className="p-1.5 hover:bg-blue-500/20 rounded-lg text-blue-400 transition-colors disabled:opacity-50"
                        title="刷新 Token"
                      >
                        {actionState === 'refreshing' ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </button>
                      {!account.healthy && (
                        <button
                          onClick={() => onReset(account.name)}
                          disabled={loading}
                          className="p-1.5 hover:bg-green-500/20 rounded-lg text-green-400 transition-colors disabled:opacity-50"
                          title="重置状态"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => onRemove(account.name)}
                        disabled={loading}
                        className="p-1.5 hover:bg-red-500/20 rounded-lg text-red-400 transition-colors disabled:opacity-50"
                        title="删除"
                      >
                        {actionState === 'deleting' ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
