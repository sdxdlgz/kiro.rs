import { useState } from 'react';
import { X, Key, User, Shield, Sparkles, ChevronDown, Import, Loader2, FileJson, Globe, Cookie, CheckCircle, AlertCircle } from 'lucide-react';
import type { AddAccountRequest, ImportSsoTokenResponse } from '../../types';
import { importSsoToken } from '../../api';

interface ImportAccountsDialogProps {
  onClose: () => void;
  onSubmit: (data: AddAccountRequest) => Promise<boolean>;
}

type ImportMode = 'sso' | 'refresh' | 'json';

export function ImportAccountsDialog({ onClose, onSubmit }: ImportAccountsDialogProps) {
  const [name, setName] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [csrfToken, setCsrfToken] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [region, setRegion] = useState('us-east-1');
  const [profileArn, setProfileArn] = useState('');
  const [authMethod, setAuthMethod] = useState('social');
  const [provider, setProvider] = useState('Google');
  const [addToPool, setAddToPool] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [importMode, setImportMode] = useState<ImportMode>('sso');

  // SSO Token 导入
  const [ssoToken, setSsoToken] = useState('');
  const [ssoResult, setSsoResult] = useState<ImportSsoTokenResponse | null>(null);
  const [ssoError, setSsoError] = useState<string | null>(null);

  const parseJsonCredentials = () => {
    try {
      const data = JSON.parse(jsonInput);
      if (data.refreshToken) setRefreshToken(data.refreshToken);
      if (data.accessToken) setAccessToken(data.accessToken);
      if (data.csrfToken) setCsrfToken(data.csrfToken);
      if (data.clientId) setClientId(data.clientId);
      if (data.clientSecret) setClientSecret(data.clientSecret);
      if (data.region) setRegion(data.region);
      if (data.profileArn) setProfileArn(data.profileArn);
      if (data.authMethod) setAuthMethod(data.authMethod);
      if (data.provider) setProvider(data.provider);
      setImportMode('refresh');
      setShowAdvanced(true);
    } catch {
      alert('JSON 格式错误，请检查输入');
    }
  };

  const handleSsoImport = async () => {
    if (!name || !ssoToken) {
      alert('请填写账号名称和 SSO Token');
      return;
    }

    setLoading(true);
    setSsoError(null);
    setSsoResult(null);

    const result = await importSsoToken({
      name,
      ssoToken,
      region,
      addToPool,
    });

    setLoading(false);

    if (result.success && result.data) {
      setSsoResult(result.data);
      // 3秒后自动关闭
      setTimeout(() => {
        onClose();
      }, 3000);
    } else {
      setSsoError(result.error || '导入失败');
    }
  };

  const handleRefreshTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !refreshToken) {
      alert('请填写账号名称和 Refresh Token');
      return;
    }
    setLoading(true);
    const success = await onSubmit({
      name,
      accessToken: accessToken || undefined,
      refreshToken,
      csrfToken: csrfToken || undefined,
      clientId: clientId || undefined,
      clientSecret: clientSecret || undefined,
      region: region || undefined,
      profileArn: profileArn || undefined,
      authMethod,
      provider,
      addToPool,
    });
    setLoading(false);
    if (success) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-lg max-h-[90vh] overflow-hidden shadow-2xl">
        {/* 头部 */}
        <div className="relative px-6 py-5 border-b border-border bg-gradient-to-r from-primary/10 via-purple-600/10 to-primary/10">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/10 to-transparent rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/20 border border-primary/30">
                <Key className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">导入账号</h2>
                <p className="text-xs text-muted-foreground mt-0.5">从 Kiro IDE 获取凭证信息</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 导入模式切换 */}
        <div className="px-6 pt-4">
          <div className="flex gap-2 p-1 bg-muted/50 rounded-xl">
            <button
              type="button"
              onClick={() => setImportMode('sso')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm transition-all ${
                importMode === 'sso'
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Cookie className="h-4 w-4" />
              SSO Token
            </button>
            <button
              type="button"
              onClick={() => setImportMode('refresh')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm transition-all ${
                importMode === 'refresh'
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Key className="h-4 w-4" />
              Refresh Token
            </button>
            <button
              type="button"
              onClick={() => setImportMode('json')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm transition-all ${
                importMode === 'json'
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <FileJson className="h-4 w-4" />
              JSON
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto max-h-[calc(90vh-220px)]">
          {/* SSO Token 导入模式 */}
          {importMode === 'sso' && (
            <div className="space-y-4">
              {/* 成功结果 */}
              {ssoResult && (
                <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
                  <div className="flex items-center gap-2 text-green-500 mb-3">
                    <CheckCircle className="h-5 w-5" />
                    <span className="font-medium">导入成功</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    {ssoResult.email && (
                      <p className="text-muted-foreground">邮箱: <span className="text-foreground">{ssoResult.email}</span></p>
                    )}
                    {ssoResult.subscription && (
                      <p className="text-muted-foreground">订阅: <span className="text-foreground">{ssoResult.subscription}</span></p>
                    )}
                    <p className="text-muted-foreground">
                      额度: <span className="text-foreground">{ssoResult.currentUsage.toFixed(1)} / {ssoResult.usageLimit.toFixed(1)}</span>
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">窗口将在 3 秒后自动关闭...</p>
                </div>
              )}

              {/* 错误提示 */}
              {ssoError && (
                <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-xl">
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="h-5 w-5" />
                    <span className="font-medium">导入失败</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">{ssoError}</p>
                </div>
              )}

              {!ssoResult && (
                <>
                  {/* 使用说明 */}
                  <div className="p-4 bg-muted/50 rounded-xl border border-border">
                    <h4 className="text-sm font-medium text-foreground mb-2">如何获取 SSO Token</h4>
                    <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                      <li>打开 Kiro IDE 并登录</li>
                      <li>打开浏览器开发者工具 (F12)</li>
                      <li>切换到 Application → Cookies</li>
                      <li>找到并复制 <code className="px-1 py-0.5 bg-primary/10 text-primary rounded font-mono text-[10px]">x-amz-sso_authn</code> 的值</li>
                    </ol>
                  </div>

                  {/* 账号名称 */}
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      账号名称
                      <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="例如: my-kiro-account"
                      className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all"
                    />
                  </div>

                  {/* SSO Token */}
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                      <Cookie className="h-4 w-4 text-muted-foreground" />
                      x-amz-sso_authn
                      <span className="text-destructive">*</span>
                    </label>
                    <textarea
                      value={ssoToken}
                      onChange={(e) => setSsoToken(e.target.value)}
                      placeholder="粘贴 x-amz-sso_authn cookie 的值"
                      rows={4}
                      className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all font-mono text-sm resize-none"
                    />
                  </div>

                  {/* Region */}
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      Region
                    </label>
                    <div className="relative">
                      <select
                        value={region}
                        onChange={(e) => setRegion(e.target.value)}
                        className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl text-foreground focus:outline-none focus:border-primary appearance-none cursor-pointer"
                      >
                        <option value="us-east-1">us-east-1 (默认)</option>
                        <option value="us-west-2">us-west-2</option>
                        <option value="eu-west-1">eu-west-1</option>
                        <option value="ap-northeast-1">ap-northeast-1</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>

                  {/* 添加到轮换池 */}
                  <label className="flex items-center gap-3 p-4 bg-muted/30 rounded-xl border border-border cursor-pointer hover:border-primary/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={addToPool}
                      onChange={(e) => setAddToPool(e.target.checked)}
                      className="w-5 h-5 rounded-lg border-border bg-muted text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer"
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">添加到轮换池</p>
                      <p className="text-xs text-muted-foreground mt-0.5">启用后该账号将参与请求负载均衡</p>
                    </div>
                  </label>

                  {/* 按钮 */}
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-1 px-4 py-3 bg-muted hover:bg-muted/80 text-foreground rounded-xl transition-colors font-medium"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={handleSsoImport}
                      disabled={loading || !name || !ssoToken}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 text-primary-foreground rounded-xl transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/25"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>验证中...</span>
                        </>
                      ) : (
                        <>
                          <Import className="h-4 w-4" />
                          <span>导入账号</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* JSON 导入模式 */}
          {importMode === 'json' && (
            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                  <FileJson className="h-4 w-4 text-muted-foreground" />
                  粘贴 credentials.json 内容
                </label>
                <textarea
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  placeholder='{"refreshToken": "...", "accessToken": "...", ...}'
                  rows={8}
                  className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary font-mono text-sm resize-none"
                />
              </div>
              <button
                type="button"
                onClick={parseJsonCredentials}
                className="w-full px-4 py-3 bg-primary/20 hover:bg-primary/30 text-primary rounded-xl transition-colors font-medium"
              >
                解析并填充表单
              </button>
            </div>
          )}

          {/* Refresh Token 导入模式 */}
          {importMode === 'refresh' && (
            <form onSubmit={handleRefreshTokenSubmit} className="space-y-4">
              {/* 账号名称 */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  账号名称
                  <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如: my-kiro-account"
                  className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all"
                />
              </div>

              {/* Refresh Token */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                  <Key className="h-4 w-4 text-muted-foreground" />
                  Refresh Token
                  <span className="text-destructive">*</span>
                </label>
                <textarea
                  value={refreshToken}
                  onChange={(e) => setRefreshToken(e.target.value)}
                  placeholder="从 Kiro IDE 的 credentials.json 中获取"
                  rows={3}
                  className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all font-mono text-sm resize-none"
                />
              </div>

              {/* 认证设置 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    认证方式
                  </label>
                  <div className="relative">
                    <select
                      value={authMethod}
                      onChange={(e) => setAuthMethod(e.target.value)}
                      className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl text-foreground focus:outline-none focus:border-primary appearance-none cursor-pointer"
                    >
                      <option value="social">Social</option>
                      <option value="IdC">IdC</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                    <Sparkles className="h-4 w-4 text-muted-foreground" />
                    登录提供商
                  </label>
                  <div className="relative">
                    <select
                      value={provider}
                      onChange={(e) => setProvider(e.target.value)}
                      className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl text-foreground focus:outline-none focus:border-primary appearance-none cursor-pointer"
                    >
                      <option value="Google">Google</option>
                      <option value="Github">Github</option>
                      <option value="BuilderId">BuilderId</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* 高级选项 */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                  高级选项 (完整凭证字段)
                </button>

                {showAdvanced && (
                  <div className="mt-4 space-y-4 p-4 bg-muted/30 rounded-xl border border-border">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">Access Token</label>
                      <textarea
                        value={accessToken}
                        onChange={(e) => setAccessToken(e.target.value)}
                        placeholder="可选，留空会自动刷新获取"
                        rows={2}
                        className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary font-mono text-sm resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">CSRF Token</label>
                      <input
                        type="text"
                        value={csrfToken}
                        onChange={(e) => setCsrfToken(e.target.value)}
                        placeholder="可选"
                        className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary font-mono text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">Client ID</label>
                        <input
                          type="text"
                          value={clientId}
                          onChange={(e) => setClientId(e.target.value)}
                          placeholder="IdC 认证需要"
                          className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary font-mono text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">Client Secret</label>
                        <input
                          type="password"
                          value={clientSecret}
                          onChange={(e) => setClientSecret(e.target.value)}
                          placeholder="IdC 认证需要"
                          className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary font-mono text-sm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                          <Globe className="h-4 w-4 text-muted-foreground" />
                          Region
                        </label>
                        <input
                          type="text"
                          value={region}
                          onChange={(e) => setRegion(e.target.value)}
                          placeholder="例如: us-east-1"
                          className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary font-mono text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">Profile ARN</label>
                        <input
                          type="text"
                          value={profileArn}
                          onChange={(e) => setProfileArn(e.target.value)}
                          placeholder="可选"
                          className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary font-mono text-sm"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 添加到轮换池 */}
              <label className="flex items-center gap-3 p-4 bg-muted/30 rounded-xl border border-border cursor-pointer hover:border-primary/30 transition-colors">
                <input
                  type="checkbox"
                  checked={addToPool}
                  onChange={(e) => setAddToPool(e.target.checked)}
                  className="w-5 h-5 rounded-lg border-border bg-muted text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer"
                />
                <div>
                  <p className="text-sm font-medium text-foreground">添加到轮换池</p>
                  <p className="text-xs text-muted-foreground mt-0.5">启用后该账号将参与请求负载均衡</p>
                </div>
              </label>

              {/* 按钮 */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-3 bg-muted hover:bg-muted/80 text-foreground rounded-xl transition-colors font-medium"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={loading || !name || !refreshToken}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 text-primary-foreground rounded-xl transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/25"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>导入中...</span>
                    </>
                  ) : (
                    <>
                      <Import className="h-4 w-4" />
                      <span>导入账号</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
