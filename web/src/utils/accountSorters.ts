import type { AccountInfo, AccountStatus, SortOptions } from '../types';

function getAccountStatus(account: AccountInfo): AccountStatus {
  return account.healthy ? 'healthy' : 'unhealthy';
}

const STATUS_WEIGHT: Record<AccountStatus, number> = {
  healthy: 0,
  refreshing: 1,
  unhealthy: 2,
  unknown: 3,
};

function compareNumber(a: number, b: number): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function compareString(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

export function sortAccounts(accounts: AccountInfo[], options: SortOptions): AccountInfo[] {
  const orderFactor = options.order === 'asc' ? 1 : -1;

  // 使用装饰器模式保持稳定排序
  const decorated = accounts.map((account, index) => ({ account, index }));

  decorated.sort((left, right) => {
    let cmp = 0;

    switch (options.field) {
      case 'name':
        cmp = compareString(left.account.name, right.account.name);
        break;
      case 'request_count':
        cmp = compareNumber(left.account.request_count, right.account.request_count);
        break;
      case 'failure_count':
        cmp = compareNumber(left.account.failure_count, right.account.failure_count);
        break;
      case 'provider': {
        const a = left.account.provider ?? '';
        const b = right.account.provider ?? '';
        cmp = compareString(a, b);
        break;
      }
      case 'status': {
        const a = STATUS_WEIGHT[getAccountStatus(left.account)];
        const b = STATUS_WEIGHT[getAccountStatus(right.account)];
        cmp = compareNumber(a, b);
        break;
      }
      default: {
        // 类型安全的穷尽检查
        const _exhaustiveCheck: never = options.field;
        return _exhaustiveCheck;
      }
    }

    if (cmp !== 0) return cmp * orderFactor;
    // 保持原始顺序作为次要排序
    return left.index - right.index;
  });

  return decorated.map(({ account }) => account);
}

// 创建默认排序选项
export function createDefaultSortOptions(): SortOptions {
  return {
    field: 'name',
    order: 'asc',
  };
}
