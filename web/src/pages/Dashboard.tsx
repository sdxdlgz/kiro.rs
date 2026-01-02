import { useEffect, useState } from 'react';
import { getPoolStatus } from '../api';
import type { PoolStatus } from '../types';

export function Dashboard() {
  const [status, setStatus] = useState<PoolStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    const res = await getPoolStatus();
    if (res.success && res.data) {
      setStatus(res.data);
      setError(null);
    } else {
      setError(res.error || '获取状态失败');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000); // 每5秒刷新
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
        {error}
      </div>
    );
  }

  if (!status) return null;

  const healthyPercent = status.total_accounts > 0
    ? Math.round((status.healthy_accounts / status.total_accounts) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="总账号数"
          value={status.total_accounts}
          icon="👥"
          color="blue"
        />
        <StatCard
          title="健康账号"
          value={status.healthy_accounts}
          icon="✅"
          color="green"
        />
        <StatCard
          title="健康率"
          value={`${healthyPercent}%`}
          icon="📊"
          color={healthyPercent >= 80 ? 'green' : healthyPercent >= 50 ? 'yellow' : 'red'}
        />
        <StatCard
          title="总请求数"
          value={status.total_requests}
          icon="📈"
          color="purple"
        />
      </div>

      {/* 账号列表 */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700/50">
          <h2 className="text-lg font-semibold text-white">轮换池账号</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800/80">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">账号</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">状态</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">请求次数</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">失败次数</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">认证方式</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {status.accounts.map((account) => (
                <tr key={account.name} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${account.healthy ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      <span className="text-white font-medium">{account.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      account.healthy
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}>
                      {account.healthy ? '健康' : '异常'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-slate-300">
                    {account.request_count.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={account.failure_count > 0 ? 'text-red-400' : 'text-slate-300'}>
                      {account.failure_count}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-slate-400 text-sm">
                    {account.auth_method || '-'} {account.provider ? `(${account.provider})` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: string;
  color: 'blue' | 'green' | 'yellow' | 'red' | 'purple';
}

function StatCard({ title, value, icon, color }: StatCardProps) {
  const colorClasses = {
    blue: 'from-blue-500/20 to-blue-600/10 border-blue-500/30',
    green: 'from-green-500/20 to-green-600/10 border-green-500/30',
    yellow: 'from-yellow-500/20 to-yellow-600/10 border-yellow-500/30',
    red: 'from-red-500/20 to-red-600/10 border-red-500/30',
    purple: 'from-purple-500/20 to-purple-600/10 border-purple-500/30',
  };

  return (
    <div className={`bg-gradient-to-br ${colorClasses[color]} rounded-xl border p-6`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-slate-400 text-sm">{title}</p>
          <p className="text-2xl font-bold text-white mt-1">{value}</p>
        </div>
        <span className="text-3xl">{icon}</span>
      </div>
    </div>
  );
}
