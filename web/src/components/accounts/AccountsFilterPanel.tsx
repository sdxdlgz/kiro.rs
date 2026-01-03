import { X } from 'lucide-react';
import type { FilterOptions, AccountStatus, IdpType, AuthMethod, AccountGroup, AccountTag } from '../../types';

interface AccountsFilterPanelProps {
  filterOptions: FilterOptions;
  onFilterChange: (options: FilterOptions) => void;
  onClose: () => void;
  groups: AccountGroup[];
  tags: AccountTag[];
}

const statusOptions: { value: AccountStatus; label: string; color: string }[] = [
  { value: 'healthy', label: '健康', color: 'bg-green-500' },
  { value: 'unhealthy', label: '异常', color: 'bg-red-500' },
];

const providerOptions: { value: IdpType; label: string }[] = [
  { value: 'Google', label: 'Google' },
  { value: 'Github', label: 'Github' },
  { value: 'BuilderId', label: 'BuilderId' },
  { value: 'AWSIdC', label: 'AWS IdC' },
  { value: 'Internal', label: 'Internal' },
];

const authMethodOptions: { value: AuthMethod; label: string }[] = [
  { value: 'social', label: 'Social' },
  { value: 'IdC', label: 'IdC' },
];

export function AccountsFilterPanel({
  filterOptions,
  onFilterChange,
  onClose,
  groups,
  tags,
}: AccountsFilterPanelProps) {
  const toggleStatus = (status: AccountStatus) => {
    const current = filterOptions.status ?? [];
    const next = current.includes(status)
      ? current.filter(s => s !== status)
      : [...current, status];
    onFilterChange({ ...filterOptions, status: next.length > 0 ? next : undefined });
  };

  const toggleProvider = (provider: IdpType) => {
    const current = filterOptions.providers ?? [];
    const next = current.includes(provider)
      ? current.filter(p => p !== provider)
      : [...current, provider];
    onFilterChange({ ...filterOptions, providers: next.length > 0 ? next : undefined });
  };

  const toggleAuthMethod = (method: AuthMethod) => {
    const current = filterOptions.authMethods ?? [];
    const next = current.includes(method)
      ? current.filter(m => m !== method)
      : [...current, method];
    onFilterChange({ ...filterOptions, authMethods: next.length > 0 ? next : undefined });
  };

  const toggleGroup = (groupId: string) => {
    const current = filterOptions.groupIds ?? [];
    const next = current.includes(groupId)
      ? current.filter(g => g !== groupId)
      : [...current, groupId];
    onFilterChange({ ...filterOptions, groupIds: next.length > 0 ? next : undefined });
  };

  const toggleTag = (tagId: string) => {
    const current = filterOptions.tagIds ?? [];
    const next = current.includes(tagId)
      ? current.filter(t => t !== tagId)
      : [...current, tagId];
    onFilterChange({ ...filterOptions, tagIds: next.length > 0 ? next : undefined });
  };

  const setInPool = (value: boolean | undefined) => {
    onFilterChange({ ...filterOptions, inPool: value });
  };

  const clearAll = () => {
    onFilterChange({});
  };

  const hasFilters = !!(
    (filterOptions.status && filterOptions.status.length > 0) ||
    (filterOptions.providers && filterOptions.providers.length > 0) ||
    (filterOptions.authMethods && filterOptions.authMethods.length > 0) ||
    filterOptions.inPool !== undefined ||
    (filterOptions.groupIds && filterOptions.groupIds.length > 0) ||
    (filterOptions.tagIds && filterOptions.tagIds.length > 0)
  );

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white">筛选条件</h3>
        <div className="flex items-center gap-2">
          {hasFilters && (
            <button
              onClick={clearAll}
              className="text-xs text-slate-400 hover:text-white transition-colors"
            >
              清除全部
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-700/50 rounded-lg transition-colors text-slate-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 状态筛选 */}
      <div>
        <label className="text-xs text-slate-400 mb-2 block">状态</label>
        <div className="flex flex-wrap gap-2">
          {statusOptions.map(({ value, label, color }) => (
            <button
              key={value}
              onClick={() => toggleStatus(value)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all ${
                filterOptions.status?.includes(value)
                  ? 'bg-blue-500/20 border-blue-500/30 text-blue-400 border'
                  : 'bg-slate-700/50 text-slate-400 hover:text-white border border-transparent'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${color}`} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 提供商筛选 */}
      <div>
        <label className="text-xs text-slate-400 mb-2 block">提供商</label>
        <div className="flex flex-wrap gap-2">
          {providerOptions.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => toggleProvider(value)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                filterOptions.providers?.includes(value)
                  ? 'bg-blue-500/20 border-blue-500/30 text-blue-400 border'
                  : 'bg-slate-700/50 text-slate-400 hover:text-white border border-transparent'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 认证方式筛选 */}
      <div>
        <label className="text-xs text-slate-400 mb-2 block">认证方式</label>
        <div className="flex flex-wrap gap-2">
          {authMethodOptions.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => toggleAuthMethod(value)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                filterOptions.authMethods?.includes(value)
                  ? 'bg-blue-500/20 border-blue-500/30 text-blue-400 border'
                  : 'bg-slate-700/50 text-slate-400 hover:text-white border border-transparent'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 轮换池筛选 */}
      <div>
        <label className="text-xs text-slate-400 mb-2 block">轮换池</label>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setInPool(filterOptions.inPool === true ? undefined : true)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
              filterOptions.inPool === true
                ? 'bg-blue-500/20 border-blue-500/30 text-blue-400 border'
                : 'bg-slate-700/50 text-slate-400 hover:text-white border border-transparent'
            }`}
          >
            在池中
          </button>
          <button
            onClick={() => setInPool(filterOptions.inPool === false ? undefined : false)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
              filterOptions.inPool === false
                ? 'bg-blue-500/20 border-blue-500/30 text-blue-400 border'
                : 'bg-slate-700/50 text-slate-400 hover:text-white border border-transparent'
            }`}
          >
            不在池中
          </button>
        </div>
      </div>

      {/* 分组筛选 */}
      {groups.length > 0 && (
        <div>
          <label className="text-xs text-slate-400 mb-2 block">分组</label>
          <div className="flex flex-wrap gap-2">
            {groups.map((group) => (
              <button
                key={group.id}
                onClick={() => toggleGroup(group.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all ${
                  filterOptions.groupIds?.includes(group.id)
                    ? 'bg-blue-500/20 border-blue-500/30 text-blue-400 border'
                    : 'bg-slate-700/50 text-slate-400 hover:text-white border border-transparent'
                }`}
              >
                {group.color && (
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: group.color }}
                  />
                )}
                {group.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 标签筛选 */}
      {tags.length > 0 && (
        <div>
          <label className="text-xs text-slate-400 mb-2 block">标签</label>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => toggleTag(tag.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all ${
                  filterOptions.tagIds?.includes(tag.id)
                    ? 'bg-blue-500/20 border-blue-500/30 text-blue-400 border'
                    : 'bg-slate-700/50 text-slate-400 hover:text-white border border-transparent'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                {tag.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
