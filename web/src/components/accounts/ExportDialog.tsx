import { useState, useEffect } from 'react';
import { X, Download, FileJson, FileSpreadsheet, Loader2, AlertCircle, Shield } from 'lucide-react';
import type { AccountInfo, AccountMeta, AccountGroup, AccountTag, AccountCredentialsExport } from '../../types';
import { getCredentials } from '../../api';

interface ExportDialogProps {
  accounts: AccountInfo[];
  metaByName: Record<string, AccountMeta>;
  groups: AccountGroup[];
  tags: AccountTag[];
  onClose: () => void;
}

type ExportFormat = 'json' | 'csv';
type ExportMode = 'basic' | 'full';

interface ExportOptions {
  format: ExportFormat;
  mode: ExportMode;
  includeMetadata: boolean;
  selectedFields: string[];
}

const basicFields = [
  { key: 'name', label: '名称' },
  { key: 'healthy', label: '状态' },
  { key: 'requestCount', label: '请求数' },
  { key: 'failureCount', label: '失败数' },
  { key: 'inPool', label: '在池中' },
  { key: 'provider', label: '提供商' },
  { key: 'authMethod', label: '认证方式' },
  { key: 'profileArn', label: 'Profile ARN' },
  { key: 'region', label: 'Region' },
];

const credentialFields = [
  { key: 'accessToken', label: 'Access Token' },
  { key: 'refreshToken', label: 'Refresh Token' },
  { key: 'csrfToken', label: 'CSRF Token' },
  { key: 'clientId', label: 'Client ID' },
  { key: 'clientSecret', label: 'Client Secret' },
  { key: 'expiresAt', label: '过期时间' },
];

export function ExportDialog({
  accounts,
  metaByName,
  groups,
  tags,
  onClose,
}: ExportDialogProps) {
  const [options, setOptions] = useState<ExportOptions>({
    format: 'json',
    mode: 'full',
    includeMetadata: true,
    selectedFields: [...basicFields.map(f => f.key), ...credentialFields.map(f => f.key)],
  });
  const [credentials, setCredentials] = useState<AccountCredentialsExport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 获取完整凭证
  useEffect(() => {
    if (options.mode === 'full') {
      setLoading(true);
      setError(null);
      getCredentials(accounts.map(a => a.name))
        .then(res => {
          if (res.success && res.data) {
            setCredentials(res.data);
          } else {
            setError(res.error || '获取凭证失败');
          }
        })
        .catch(e => setError(e.message))
        .finally(() => setLoading(false));
    }
  }, [options.mode, accounts]);

  const availableFields = options.mode === 'full'
    ? [...basicFields, ...credentialFields]
    : basicFields;

  const toggleField = (field: string) => {
    setOptions(prev => ({
      ...prev,
      selectedFields: prev.selectedFields.includes(field)
        ? prev.selectedFields.filter(f => f !== field)
        : [...prev.selectedFields, field],
    }));
  };

  const handleModeChange = (mode: ExportMode) => {
    if (mode === 'full') {
      setOptions(prev => ({
        ...prev,
        mode,
        selectedFields: [...basicFields.map(f => f.key), ...credentialFields.map(f => f.key)],
      }));
    } else {
      setOptions(prev => ({
        ...prev,
        mode,
        selectedFields: basicFields.map(f => f.key),
      }));
    }
  };

  const handleExport = () => {
    const dataSource = options.mode === 'full' ? credentials : accounts;

    const exportData = dataSource.map(account => {
      const data: Record<string, unknown> = {};

      for (const field of options.selectedFields) {
        data[field] = (account as unknown as Record<string, unknown>)[field];
      }

      if (options.includeMetadata) {
        const meta = metaByName[account.name];
        if (meta) {
          const group = meta.groupId ? groups.find(g => g.id === meta.groupId) : undefined;
          const accountTags = meta.tagIds?.map(id => tags.find(t => t.id === id)).filter(Boolean) ?? [];

          data._meta = {
            group: group?.name,
            tags: accountTags.map(t => t?.name),
            notes: meta.notes,
          };
        }
      }

      return data;
    });

    let content: string;
    let filename: string;
    let mimeType: string;

    if (options.format === 'json') {
      content = JSON.stringify(exportData, null, 2);
      filename = `kiro-accounts-${options.mode === 'full' ? 'full' : 'basic'}-${new Date().toISOString().split('T')[0]}.json`;
      mimeType = 'application/json';
    } else {
      // CSV 格式
      const headers = [...options.selectedFields];
      if (options.includeMetadata) {
        headers.push('group', 'tags', 'notes');
      }

      const rows = exportData.map(item => {
        const row: string[] = [];
        for (const field of options.selectedFields) {
          const value = item[field];
          row.push(value === undefined || value === null ? '' : String(value));
        }
        if (options.includeMetadata && item._meta) {
          const meta = item._meta as { group?: string; tags?: string[]; notes?: string };
          row.push(meta.group || '');
          row.push((meta.tags || []).join(';'));
          row.push(meta.notes || '');
        }
        return row;
      });

      content = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')),
      ].join('\n');
      filename = `kiro-accounts-${options.mode === 'full' ? 'full' : 'basic'}-${new Date().toISOString().split('T')[0]}.csv`;
      mimeType = 'text/csv';
    }

    // 下载文件
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-md shadow-2xl">
        {/* 头部 */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-green-500/20 border border-green-500/30">
              <Download className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">导出账号</h2>
              <p className="text-xs text-muted-foreground">共 {accounts.length} 个账号</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* 导出模式选择 */}
          <div>
            <label className="text-sm font-medium text-foreground mb-3 block">导出模式</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleModeChange('full')}
                className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${
                  options.mode === 'full'
                    ? 'bg-primary/20 border-primary/30 text-primary'
                    : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <Shield className="h-5 w-5" />
                <div className="text-left">
                  <p className="font-medium">完整凭证</p>
                  <p className="text-xs opacity-70">含敏感信息</p>
                </div>
              </button>
              <button
                onClick={() => handleModeChange('basic')}
                className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${
                  options.mode === 'basic'
                    ? 'bg-primary/20 border-primary/30 text-primary'
                    : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <FileJson className="h-5 w-5" />
                <div className="text-left">
                  <p className="font-medium">基本信息</p>
                  <p className="text-xs opacity-70">不含凭证</p>
                </div>
              </button>
            </div>
          </div>

          {/* 格式选择 */}
          <div>
            <label className="text-sm font-medium text-foreground mb-3 block">导出格式</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setOptions(prev => ({ ...prev, format: 'json' }))}
                className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${
                  options.format === 'json'
                    ? 'bg-blue-500/20 border-blue-500/30 text-blue-500'
                    : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <FileJson className="h-5 w-5" />
                <div className="text-left">
                  <p className="font-medium">JSON</p>
                  <p className="text-xs opacity-70">结构化数据</p>
                </div>
              </button>
              <button
                onClick={() => setOptions(prev => ({ ...prev, format: 'csv' }))}
                className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${
                  options.format === 'csv'
                    ? 'bg-blue-500/20 border-blue-500/30 text-blue-500'
                    : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <FileSpreadsheet className="h-5 w-5" />
                <div className="text-left">
                  <p className="font-medium">CSV</p>
                  <p className="text-xs opacity-70">表格数据</p>
                </div>
              </button>
            </div>
          </div>

          {/* 加载状态 */}
          {loading && (
            <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>正在获取凭证数据...</span>
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 字段选择 */}
          {!loading && !error && (
            <div>
              <label className="text-sm font-medium text-foreground mb-3 block">导出字段</label>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {availableFields.map(({ key, label }) => (
                  <label
                    key={key}
                    className={`flex items-center gap-2 p-2.5 rounded-lg cursor-pointer transition-all ${
                      options.selectedFields.includes(key)
                        ? 'bg-muted text-foreground'
                        : 'bg-muted/30 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={options.selectedFields.includes(key)}
                      onChange={() => toggleField(key)}
                      className="w-4 h-4 rounded border-border bg-background text-primary focus:ring-primary focus:ring-offset-0"
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* 包含元数据 */}
          <label className="flex items-center gap-3 p-4 bg-muted/30 rounded-xl border border-border cursor-pointer hover:border-primary/30 transition-colors">
            <input
              type="checkbox"
              checked={options.includeMetadata}
              onChange={(e) => setOptions(prev => ({ ...prev, includeMetadata: e.target.checked }))}
              className="w-5 h-5 rounded-lg border-border bg-background text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer"
            />
            <div>
              <p className="text-sm font-medium text-foreground">包含分组和标签</p>
              <p className="text-xs text-muted-foreground mt-0.5">导出本地存储的分组、标签和备注信息</p>
            </div>
          </label>

          {/* 安全提示 */}
          {options.mode === 'full' && (
            <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-600 dark:text-amber-400 text-xs">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>导出文件包含敏感凭证信息，请妥善保管，避免泄露。</span>
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="px-6 py-4 border-t border-border flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-muted hover:bg-muted/80 text-foreground rounded-xl transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleExport}
            disabled={options.selectedFields.length === 0 || loading || !!error}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="h-4 w-4" />
            导出
          </button>
        </div>
      </div>
    </div>
  );
}
