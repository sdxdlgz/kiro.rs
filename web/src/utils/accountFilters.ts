import type { AccountInfo, AccountMeta, AccountStatus, AuthMethod, FilterOptions, IdpType } from '../types';

function normalizeProvider(provider: string | undefined): IdpType | undefined {
  if (!provider) return undefined;
  switch (provider.trim().toLowerCase()) {
    case 'google':
      return 'Google';
    case 'github':
      return 'Github';
    case 'builderid':
      return 'BuilderId';
    case 'awsidc':
      return 'AWSIdC';
    case 'internal':
      return 'Internal';
    default:
      return undefined;
  }
}

function normalizeAuthMethod(authMethod: string | undefined): AuthMethod | undefined {
  if (!authMethod) return undefined;
  switch (authMethod.trim().toLowerCase()) {
    case 'idc':
      return 'IdC';
    case 'social':
      return 'social';
    default:
      return undefined;
  }
}

export function getAccountStatus(account: AccountInfo): AccountStatus {
  return account.healthy ? 'healthy' : 'unhealthy';
}

function includesAll(haystack: string[], needles: string[]): boolean {
  if (needles.length === 0) return true;
  const set = new Set(haystack);
  return needles.every((needle) => set.has(needle));
}

export function filterAccounts(
  accounts: AccountInfo[],
  metaByName: Record<string, AccountMeta>,
  options: FilterOptions
): AccountInfo[] {
  const search = options.search?.trim().toLowerCase();

  const statusSet = options.status && options.status.length > 0 ? new Set(options.status) : undefined;
  const providerSet = options.providers && options.providers.length > 0 ? new Set<IdpType>(options.providers) : undefined;
  const authMethodSet =
    options.authMethods && options.authMethods.length > 0 ? new Set<AuthMethod>(options.authMethods) : undefined;
  const groupIdSet = options.groupIds && options.groupIds.length > 0 ? new Set(options.groupIds) : undefined;
  const tagIds = options.tagIds && options.tagIds.length > 0 ? options.tagIds : undefined;

  return accounts.filter((account) => {
    // 搜索过滤
    if (search && !account.name.toLowerCase().includes(search)) return false;

    // 是否在池中过滤
    if (options.inPool !== undefined && account.in_pool !== options.inPool) return false;

    // 状态过滤
    if (statusSet && !statusSet.has(getAccountStatus(account))) return false;

    // 提供商过滤
    if (providerSet) {
      const provider = normalizeProvider(account.provider);
      if (!provider || !providerSet.has(provider)) return false;
    }

    // 认证方式过滤
    if (authMethodSet) {
      const authMethod = normalizeAuthMethod(account.auth_method);
      if (!authMethod || !authMethodSet.has(authMethod)) return false;
    }

    const meta = metaByName[account.name];

    // 分组过滤
    if (groupIdSet) {
      if (!meta?.groupId) return false;
      if (!groupIdSet.has(meta.groupId)) return false;
    }

    // 标签过滤 (必须包含所有指定标签)
    if (tagIds) {
      const currentTagIds = meta?.tagIds ?? [];
      if (!includesAll(currentTagIds, tagIds)) return false;
    }

    return true;
  });
}

// 检查是否有任何过滤条件
export function hasActiveFilters(options: FilterOptions): boolean {
  return !!(
    options.search?.trim() ||
    (options.status && options.status.length > 0) ||
    (options.providers && options.providers.length > 0) ||
    (options.authMethods && options.authMethods.length > 0) ||
    (options.groupIds && options.groupIds.length > 0) ||
    (options.tagIds && options.tagIds.length > 0) ||
    options.inPool !== undefined
  );
}

// 创建空的过滤选项
export function createEmptyFilterOptions(): FilterOptions {
  return {};
}
