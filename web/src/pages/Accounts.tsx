import { useEffect, useState } from 'react';
import { getAccounts, addAccount, removeAccount, refreshToken, resetAccount } from '../api';
import type { AccountInfo, AddAccountRequest } from '../types';

export function Accounts() {
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchAccounts = async () => {
    const res = await getAccounts();
    if (res.success && res.data) {
      setAccounts(res.data);
      setError(null);
    } else {
      setError(res.error || '获取账号列表失败');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleRefresh = async (name: string) => {
    setActionLoading(name);
    const res = await refreshToken(name);
    if (!res.success) {
      alert(res.error || '刷新失败');
    }
    await fetchAccounts();
    setActionLoading(null);
  };

  const handleReset = async (name: string) => {
    setActionLoading(name);
    const res = await resetAccount(name);
    if (!res.success) {
      alert(res.error || '重置失败');
    }
    await fetchAccounts();
    setActionLoading(null);
  };

  const handleRemove = async (name: string) => {
    if (!confirm(`确定要删除账号 ${name} 吗？`)) return;

    setActionLoading(name);
    const res = await removeAccount(name, true);
    if (!res.success) {
      alert(res.error || '删除失败');
    }
    await fetchAccounts();
    setActionLoading(null);
  };

  const handleAddAccount = async (data: AddAccountRequest) => {
    const res = await addAccount(data);
    if (res.success) {
      setShowAddDialog(false);
      await fetchAccounts();
    } else {
      alert(res.error || '添加失败');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">账号管理</h1>
        <button
          onClick={() => setShowAddDialog(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
        >
          <span>+</span>
          <span>导入账号</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}

      {/* 账号卡片网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.map((account) => (
          <AccountCard
            key={account.name}
            account={account}
            loading={actionLoading === account.name}
            onRefresh={() => handleRefresh(account.name)}
            onReset={() => handleReset(account.name)}
            onRemove={() => handleRemove(account.name)}
          />
        ))}
      </div>

      {accounts.length === 0 && !error && (
        <div className="text-center py-12 text-slate-400">
          <p className="text-lg">暂无账号</p>
          <p className="text-sm mt-2">点击"导入账号"添加第一个账号</p>
        </div>
      )}

      {/* 添加账号对话框 */}
      {showAddDialog && (
        <AddAccountDialog
          onClose={() => setShowAddDialog(false)}
          onSubmit={handleAddAccount}
        />
      )}
    </div>
  );
}

interface AccountCardProps {
  account: AccountInfo;
  loading: boolean;
  onRefresh: () => void;
  onReset: () => void;
  onRemove: () => void;
}

function AccountCard({ account, loading, onRefresh, onReset, onRemove }: AccountCardProps) {
  return (
    <div className={`bg-slate-800/50 rounded-xl border ${
      account.healthy ? 'border-slate-700/50' : 'border-red-500/30'
    } p-5 space-y-4`}>
      {/* 头部 */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${account.healthy ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <div>
            <h3 className="font-semibold text-white">{account.name}</h3>
            <p className="text-xs text-slate-400">
              {account.auth_method || 'social'} {account.provider ? `· ${account.provider}` : ''}
            </p>
          </div>
        </div>
        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
          account.healthy
            ? 'bg-green-500/20 text-green-400'
            : 'bg-red-500/20 text-red-400'
        }`}>
          {account.healthy ? '健康' : '异常'}
        </span>
      </div>

      {/* 统计 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-900/50 rounded-lg p-3">
          <p className="text-xs text-slate-400">请求次数</p>
          <p className="text-lg font-semibold text-white">{account.request_count.toLocaleString()}</p>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-3">
          <p className="text-xs text-slate-400">失败次数</p>
          <p className={`text-lg font-semibold ${account.failure_count > 0 ? 'text-red-400' : 'text-white'}`}>
            {account.failure_count}
          </p>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex-1 px-3 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          {loading ? '处理中...' : '刷新 Token'}
        </button>
        {!account.healthy && (
          <button
            onClick={onReset}
            disabled={loading}
            className="px-3 py-2 bg-green-600/20 hover:bg-green-600/30 text-green-400 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            重置
          </button>
        )}
        <button
          onClick={onRemove}
          disabled={loading}
          className="px-3 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          删除
        </button>
      </div>
    </div>
  );
}

interface AddAccountDialogProps {
  onClose: () => void;
  onSubmit: (data: AddAccountRequest) => void;
}

function AddAccountDialog({ onClose, onSubmit }: AddAccountDialogProps) {
  const [name, setName] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [profileArn, setProfileArn] = useState('');
  const [authMethod, setAuthMethod] = useState('social');
  const [provider, setProvider] = useState('Google');
  const [addToPool, setAddToPool] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !refreshToken) {
      alert('请填写账号名称和 Refresh Token');
      return;
    }
    setLoading(true);
    await onSubmit({
      name,
      accessToken,
      refreshToken,
      profileArn: profileArn || undefined,
      authMethod,
      provider,
      addToPool,
    });
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">导入 SSO Token</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">账号名称 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如: my-account"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Access Token</label>
            <textarea
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="可选，留空会自动刷新"
              rows={2}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Refresh Token *</label>
            <textarea
              value={refreshToken}
              onChange={(e) => setRefreshToken(e.target.value)}
              placeholder="从 Kiro IDE 获取的 refreshToken"
              rows={3}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Profile ARN</label>
            <input
              type="text"
              value={profileArn}
              onChange={(e) => setProfileArn(e.target.value)}
              placeholder="可选"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">认证方式</label>
              <select
                value={authMethod}
                onChange={(e) => setAuthMethod(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              >
                <option value="social">Social</option>
                <option value="IdC">IdC</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">登录提供商</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              >
                <option value="Google">Google</option>
                <option value="Github">Github</option>
                <option value="BuilderId">BuilderId</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="addToPool"
              checked={addToPool}
              onChange={(e) => setAddToPool(e.target.checked)}
              className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="addToPool" className="text-sm text-slate-300">
              添加到轮换池
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? '导入中...' : '导入'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
