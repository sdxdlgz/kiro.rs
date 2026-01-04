import { useEffect, useState } from 'react';
import { getPoolStatus, batchCheckAccounts } from '../api';
import type { PoolStatus, AccountInfo } from '../types';
import { useCheckResultsStorage } from '../hooks/useCheckResultsStorage';
import {
  Users,
  CheckCircle,
  AlertTriangle,
  Activity,
  RefreshCw,
  Zap,
  Server,
  TrendingUp,
  Clock,
  Shield,
  BarChart3
} from 'lucide-react';

export function Dashboard() {
  const [status, setStatus] = useState<PoolStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // 使用持久化的检查结果
  const { totalUsage, totalLimit, checkedCount, updateCheckResults } = useCheckResultsStorage();
  const [checkingUsage, setCheckingUsage] = useState(false);

  const fetchStatus = async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    const res = await getPoolStatus();
    if (res.success && res.data) {
      setStatus(res.data);
      setError(null);
      setLastUpdate(new Date());
    } else {
      setError(res.error || '获取状态失败');
    }
    setLoading(false);
    setRefreshing(false);
  };

  // 检查所有账号的额度
  const fetchUsageStats = async (accounts: AccountInfo[]) => {
    if (accounts.length === 0) return;

    setCheckingUsage(true);
    const names = accounts.map(a => a.name);
    const res = await batchCheckAccounts(names);

    if (res.success && res.data) {
      // 更新持久化存储
      updateCheckResults(res.data.results);
    }
    setCheckingUsage(false);
  };

  const handleRefresh = async () => {
    await fetchStatus(true);
    // 同时刷新额度统计
    if (status?.accounts) {
      await fetchUsageStats(status.accounts);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(() => fetchStatus(), 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-6 text-destructive flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 flex-shrink-0" />
        <div>
          <p className="font-medium">连接失败</p>
          <p className="text-sm opacity-80">{error}</p>
        </div>
      </div>
    );
  }

  if (!status) return null;

  const healthyPercent = status.total_accounts > 0
    ? Math.round((status.healthy_accounts / status.total_accounts) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* 欢迎横幅 */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary/20 via-purple-600/20 to-primary/20 p-6 border border-primary/20">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-primary/20 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-purple-500/20 to-transparent rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-primary/20 border border-primary/30">
              <Server className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">小王养鸡场</h1>
              <p className="text-muted-foreground mt-1">多账号轮换池状态监控与管理</p>
            </div>
          </div>
          {lastUpdate && (
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              最后更新: {lastUpdate.toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="总账号数"
          value={status.total_accounts}
          icon={Users}
          color="blue"
          description="轮换池中的账号总数"
        />
        <StatCard
          title="健康账号"
          value={status.healthy_accounts}
          icon={CheckCircle}
          color="green"
          description="当前可用的账号数量"
        />
        <StatCard
          title="健康率"
          value={`${healthyPercent}%`}
          icon={Activity}
          color={healthyPercent >= 80 ? 'green' : healthyPercent >= 50 ? 'yellow' : 'red'}
          description="账号池整体健康状况"
          showProgress
          progress={healthyPercent}
        />
        <StatCard
          title="总请求数"
          value={status.total_requests.toLocaleString()}
          icon={TrendingUp}
          color="purple"
          description="所有账号累计请求次数"
        />
      </div>

      {/* 额度统计 */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <BarChart3 className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">额度统计</h2>
              <p className="text-xs text-muted-foreground">所有账号的额度使用情况汇总</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {checkedCount > 0 && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                已检查 {checkedCount}/{status.total_accounts} 个账号
              </span>
            )}
            {checkedCount === 0 && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                点击刷新获取额度信息
              </span>
            )}
            <button
              onClick={() => fetchUsageStats(status.accounts)}
              disabled={checkingUsage}
              className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
              title="刷新额度统计"
            >
              <RefreshCw className={`h-4 w-4 ${checkingUsage ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-4 bg-muted/50 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                <span className="text-xs text-muted-foreground">总额度</span>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {checkedCount > 0 ? totalLimit.toFixed(1) : '--'}
              </p>
            </div>
            <div className="p-4 bg-muted/50 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-4 w-4 text-orange-500" />
                <span className="text-xs text-muted-foreground">已使用</span>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {checkedCount > 0 ? totalUsage.toFixed(1) : '--'}
              </p>
            </div>
            <div className="p-4 bg-muted/50 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4 text-green-500" />
                <span className="text-xs text-muted-foreground">剩余额度</span>
              </div>
              <p className="text-2xl font-bold text-green-500">
                {checkedCount > 0 ? (totalLimit - totalUsage).toFixed(1) : '--'}
              </p>
            </div>
            <div className="p-4 bg-muted/50 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="h-4 w-4 text-purple-500" />
                <span className="text-xs text-muted-foreground">使用率</span>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {checkedCount > 0 && totalLimit > 0
                  ? `${((totalUsage / totalLimit) * 100).toFixed(1)}%`
                  : '--%'}
              </p>
            </div>
          </div>

          {/* 进度条 */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>总体使用进度</span>
              <span>
                {checkedCount > 0
                  ? `${totalUsage.toFixed(1)} / ${totalLimit.toFixed(1)}`
                  : '-- / --'}
              </span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{
                  width: checkedCount > 0 && totalLimit > 0
                    ? `${Math.min(100, (totalUsage / totalLimit) * 100)}%`
                    : '0%'
                }}
              />
            </div>
          </div>

          {checkedCount === 0 && (
            <p className="text-xs text-muted-foreground mt-4 text-center">
              提示：点击上方刷新按钮获取所有账号的额度信息，或前往「账号管理」页面单独检查
            </p>
          )}
        </div>
      </div>

      {/* 轮换池状态 */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/20">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">轮换池账号</h2>
              <p className="text-xs text-muted-foreground">实时监控账号状态和请求分布</p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {status.accounts.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
            <p className="text-muted-foreground">暂无账号</p>
            <p className="text-sm text-muted-foreground/70 mt-1">前往账号管理页面添加账号</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">账号</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">状态</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">请求次数</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">失败次数</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">认证方式</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">负载占比</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {status.accounts.map((account) => (
                  <AccountRow
                    key={account.name}
                    account={account}
                    totalRequests={status.total_requests}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 快速提示 */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-amber-500/20">
            <Shield className="h-5 w-5 text-amber-500" />
          </div>
          <h3 className="font-semibold text-foreground">快速提示</h3>
        </div>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">•</span>
            <span>系统使用<strong className="text-foreground">最少使用策略</strong>自动选择请求次数最少的账号，实现负载均衡</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">•</span>
            <span>账号请求失败时会自动标记为不健康，<strong className="text-foreground">冷却期后自动恢复</strong></span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">•</span>
            <span>Token 刷新后会<strong className="text-foreground">自动保存</strong>到对应的凭证文件</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">•</span>
            <span>前往「账号管理」页面可以<strong className="text-foreground">导入新账号</strong>或管理现有账号</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: 'blue' | 'green' | 'yellow' | 'red' | 'purple';
  description?: string;
  showProgress?: boolean;
  progress?: number;
}

function StatCard({ title, value, icon: Icon, color, description, showProgress, progress }: StatCardProps) {
  const colorClasses = {
    blue: {
      bg: 'from-blue-500/20 to-blue-600/10',
      border: 'border-blue-500/30',
      icon: 'bg-blue-500/20 text-blue-500',
      progress: 'bg-blue-500',
    },
    green: {
      bg: 'from-green-500/20 to-green-600/10',
      border: 'border-green-500/30',
      icon: 'bg-green-500/20 text-green-500',
      progress: 'bg-green-500',
    },
    yellow: {
      bg: 'from-yellow-500/20 to-yellow-600/10',
      border: 'border-yellow-500/30',
      icon: 'bg-yellow-500/20 text-yellow-500',
      progress: 'bg-yellow-500',
    },
    red: {
      bg: 'from-red-500/20 to-red-600/10',
      border: 'border-red-500/30',
      icon: 'bg-red-500/20 text-red-500',
      progress: 'bg-red-500',
    },
    purple: {
      bg: 'from-purple-500/20 to-purple-600/10',
      border: 'border-purple-500/30',
      icon: 'bg-purple-500/20 text-purple-500',
      progress: 'bg-purple-500',
    },
  };

  const classes = colorClasses[color];

  return (
    <div className={`bg-gradient-to-br ${classes.bg} rounded-xl border ${classes.border} p-5`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-muted-foreground text-sm">{title}</p>
          <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
          {description && (
            <p className="text-xs text-muted-foreground/70 mt-2">{description}</p>
          )}
        </div>
        <div className={`p-2.5 rounded-xl ${classes.icon}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {showProgress && progress !== undefined && (
        <div className="mt-3">
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full ${classes.progress} rounded-full transition-all duration-500`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface AccountRowProps {
  account: AccountInfo;
  totalRequests: number;
}

function AccountRow({ account, totalRequests }: AccountRowProps) {
  const loadPercent = totalRequests > 0
    ? Math.round((account.request_count / totalRequests) * 100)
    : 0;

  return (
    <tr className="hover:bg-muted/50 transition-colors">
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${account.healthy ? 'bg-green-500' : 'bg-red-500'} ${account.healthy ? 'animate-pulse' : ''}`} />
          <div>
            <span className="text-foreground font-medium">{account.name}</span>
            {account.provider && (
              <span className="text-xs text-muted-foreground ml-2">({account.provider})</span>
            )}
          </div>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
          account.healthy
            ? 'bg-green-500/20 text-green-600 dark:text-green-400 border border-green-500/30'
            : 'bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30'
        }`}>
          {account.healthy ? (
            <CheckCircle className="h-3 w-3" />
          ) : (
            <AlertTriangle className="h-3 w-3" />
          )}
          {account.healthy ? '健康' : '异常'}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span className="text-foreground font-mono">{account.request_count.toLocaleString()}</span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span className={`font-mono ${account.failure_count > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
          {account.failure_count}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span className="text-muted-foreground text-sm">
          {account.auth_method || 'social'}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full"
              style={{ width: `${loadPercent}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground w-8">{loadPercent}%</span>
        </div>
      </td>
    </tr>
  );
}
