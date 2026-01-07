import { useState, useCallback } from 'react';
import {
  Users,
  CheckCircle,
  Activity,
  Loader2,
  AlertCircle,
  UserPlus,
  Import,
} from 'lucide-react';
import type { ViewMode, SortField, AddAccountRequest, AccountCredentialsExport } from '../types';
import { useAccountsRemote } from '../hooks/useAccountsRemote';
import { useAccountsMetaStorage } from '../hooks/useAccountsMetaStorage';
import { useAccountsViewModel } from '../hooks/useAccountsViewModel';
import { useCheckResultsStorage } from '../hooks/useCheckResultsStorage';
import {
  AccountsToolbar,
  AccountsFilterPanel,
  AccountCardGrid,
  AccountCompactList,
  AccountsTable,
  GroupManageDialog,
  TagManageDialog,
  ImportAccountsDialog,
  ExportDialog,
} from '../components/accounts';

export function Accounts() {
  // 远程数据
  const {
    accounts,
    loading,
    error,
    refreshAccountToken,
    resetAccountStatus,
    deleteAccount,
    createAccount,
    batchRefresh,
    batchDelete,
    checkAccountUsage,
    batchCheckAccountsUsage,
    getAccountCredentials,
  } = useAccountsRemote();

  // 本地元数据存储
  const {
    groups,
    tags,
    metaByName,
    addGroup,
    updateGroup,
    removeGroup,
    addTag,
    updateTag,
    removeTag,
  } = useAccountsMetaStorage();

  // 视图模型
  const {
    filterOptions,
    setFilterOptions,
    sortOptions,
    setSortOptions,
    selectedNames,
    toggleSelection,
    selectAll,
    deselectAll,
    actionStates,
    setActionState,
    sortedAccounts,
    hasSelection,
    selectionCount,
  } = useAccountsViewModel({ accounts, metaByName });

  // 检查结果持久化存储
  const { checkResults, updateCheckResult } = useCheckResultsStorage();

  // UI 状态
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showGroupManager, setShowGroupManager] = useState(false);
  const [showTagManager, setShowTagManager] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchCheckLoading, setBatchCheckLoading] = useState(false);
  const [detailsAccount, setDetailsAccount] = useState<AccountCredentialsExport | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // 搜索
  const [searchValue, setSearchValue] = useState('');

  // 处理搜索变化
  const handleSearchChange = useCallback((value: string) => {
    setSearchValue(value);
    setFilterOptions({ ...filterOptions, search: value || undefined });
  }, [filterOptions, setFilterOptions]);

  // 处理排序
  const handleSort = useCallback((field: SortField) => {
    if (sortOptions.field === field) {
      setSortOptions({ ...sortOptions, order: sortOptions.order === 'asc' ? 'desc' : 'asc' });
    } else {
      setSortOptions({ field, order: 'asc' });
    }
  }, [sortOptions, setSortOptions]);

  // 单个账号操作
  const handleRefresh = useCallback(async (name: string) => {
    // 刷新账号信息 = 检查账号（获取额度信息）
    setActionState(name, 'checking');
    const result = await checkAccountUsage(name);
    setActionState(name, 'idle');
    if (result && !result.error) {
      // 更新持久化存储
      updateCheckResult(name, result);
      console.log(`账号 ${name} 检查完成: ${result.subscription || '未知'} - ${result.usagePercent.toFixed(1)}%`);
    }
  }, [checkAccountUsage, setActionState, updateCheckResult]);

  const handleRefreshToken = useCallback(async (name: string) => {
    setActionState(name, 'refreshing');
    await refreshAccountToken(name);
    setActionState(name, 'idle');
  }, [refreshAccountToken, setActionState]);

  const handleReset = useCallback(async (name: string) => {
    setActionState(name, 'refreshing');
    await resetAccountStatus(name);
    setActionState(name, 'idle');
  }, [resetAccountStatus, setActionState]);

  const handleRemove = useCallback(async (name: string) => {
    if (!confirm(`确定要删除账号 ${name} 吗？`)) return;
    setActionState(name, 'deleting');
    await deleteAccount(name);
    setActionState(name, 'idle');
  }, [deleteAccount, setActionState]);

  const handleCheck = useCallback(async (name: string) => {
    setActionState(name, 'checking');
    const result = await checkAccountUsage(name);
    setActionState(name, 'idle');
    if (result) {
      // 直接更新卡片显示，不弹窗
      updateCheckResult(name, result);
    }
  }, [checkAccountUsage, setActionState, updateCheckResult]);

  // 批量操作
  const handleBatchRefresh = useCallback(async () => {
    if (!confirm(`确定要刷新选中的 ${selectionCount} 个账号吗？`)) return;
    setBatchLoading(true);
    const names = Array.from(selectedNames);
    await batchRefresh(names);
    setBatchLoading(false);
    deselectAll();
  }, [selectedNames, selectionCount, batchRefresh, deselectAll]);

  const handleBatchDelete = useCallback(async () => {
    if (!confirm(`确定要删除选中的 ${selectionCount} 个账号吗？此操作不可恢复！`)) return;
    setBatchLoading(true);
    const names = Array.from(selectedNames);
    await batchDelete(names);
    setBatchLoading(false);
    deselectAll();
  }, [selectedNames, selectionCount, batchDelete, deselectAll]);

  const handleBatchCheck = useCallback(async () => {
    if (selectionCount === 0) return;
    setBatchCheckLoading(true);
    const names = Array.from(selectedNames);
    const results = await batchCheckAccountsUsage(names);
    setBatchCheckLoading(false);

    // 直接更新所有卡片显示，不弹窗
    results.forEach(r => {
      updateCheckResult(r.name, r);
    });
  }, [selectedNames, selectionCount, batchCheckAccountsUsage, updateCheckResult]);

  // 导入账号
  const handleImport = useCallback(async (data: AddAccountRequest): Promise<boolean> => {
    const success = await createAccount(data);
    if (!success) {
      alert('导入失败');
    }
    return success;
  }, [createAccount]);

  // 查看详情
  const handleViewDetails = useCallback(async (name: string) => {
    setDetailsLoading(true);
    const creds = await getAccountCredentials(name);
    setDetailsLoading(false);
    if (creds) {
      setDetailsAccount(creds);
    } else {
      alert('获取账号详情失败');
    }
  }, [getAccountCredentials]);

  // 复制凭证
  const handleCopyCredentials = useCallback(async (name: string) => {
    const creds = await getAccountCredentials(name);
    if (creds) {
      const text = JSON.stringify({
        name: creds.name,
        refreshToken: creds.refreshToken,
        accessToken: creds.accessToken,
        clientId: creds.clientId,
        clientSecret: creds.clientSecret,
        region: creds.region,
        expiresAt: creds.expiresAt,
        authMethod: creds.authMethod,
        provider: creds.provider,
      }, null, 2);
      await navigator.clipboard.writeText(text);
    }
  }, [getAccountCredentials]);

  // 加载状态
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">加载账号数据...</p>
        </div>
      </div>
    );
  }

  const healthyCount = accounts.filter(a => a.healthy).length;
  const totalRequests = accounts.reduce((sum, a) => sum + a.request_count, 0);

  return (
    <div className="space-y-4">
      {/* 页面头部 - 紧凑版 */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-600/20 via-primary/20 to-purple-600/20 p-4 border border-purple-500/20">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-purple-500/20 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-primary/20 to-transparent rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/20 border border-purple-500/30">
              <Users className="h-6 w-6 text-purple-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">账号管理</h1>
              <p className="text-muted-foreground text-sm">管理和导入 Kiro SSO Token</p>
            </div>
          </div>

          {/* 快速统计 - 内联显示 */}
          <div className="relative flex items-center gap-4">
            <div className="bg-card/50 rounded-lg px-4 py-2 border border-border flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">总账号</span>
              <span className="text-lg font-bold text-foreground">{accounts.length}</span>
            </div>
            <div className="bg-card/50 rounded-lg px-4 py-2 border border-border flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">健康</span>
              <span className="text-lg font-bold text-green-500">{healthyCount}</span>
            </div>
            <div className="bg-card/50 rounded-lg px-4 py-2 border border-border flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">请求</span>
              <span className="text-lg font-bold text-primary">{totalRequests.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-destructive flex items-center gap-3">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <div>
            <p className="font-medium">加载失败</p>
            <p className="text-sm opacity-80">{error}</p>
          </div>
        </div>
      )}

      {/* 工具栏 */}
      <AccountsToolbar
        searchValue={searchValue}
        onSearchChange={handleSearchChange}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        filterOptions={filterOptions}
        showFilterPanel={showFilterPanel}
        onToggleFilterPanel={() => setShowFilterPanel(!showFilterPanel)}
        sortOptions={sortOptions}
        onSortChange={setSortOptions}
        hasSelection={hasSelection}
        selectionCount={selectionCount}
        onSelectAll={selectAll}
        onDeselectAll={deselectAll}
        onBatchRefresh={handleBatchRefresh}
        onBatchDelete={handleBatchDelete}
        onBatchCheck={handleBatchCheck}
        batchLoading={batchLoading}
        batchCheckLoading={batchCheckLoading}
        onOpenGroupManager={() => setShowGroupManager(true)}
        onOpenTagManager={() => setShowTagManager(true)}
        onImport={() => setShowImportDialog(true)}
        onExport={() => setShowExportDialog(true)}
        totalCount={accounts.length}
        filteredCount={sortedAccounts.length}
      />

      {/* 筛选面板 */}
      {showFilterPanel && (
        <AccountsFilterPanel
          filterOptions={filterOptions}
          onFilterChange={setFilterOptions}
          onClose={() => setShowFilterPanel(false)}
          groups={groups}
          tags={tags}
        />
      )}

      {/* 账号列表 */}
      {sortedAccounts.length > 0 ? (
        viewMode === 'card' ? (
          <div className="h-[calc(100vh-280px)] min-h-[400px]">
            <AccountCardGrid
              accounts={sortedAccounts}
              metaByName={metaByName}
              groups={groups}
              tags={tags}
              actionStates={actionStates}
              selectedNames={selectedNames}
              checkResults={checkResults}
              onToggleSelection={toggleSelection}
              onRefresh={handleRefresh}
              onRefreshToken={handleRefreshToken}
              onRemove={handleRemove}
              onViewDetails={handleViewDetails}
              onAddAccount={() => setShowImportDialog(true)}
              onCheck={handleCheck}
              onCopyCredentials={handleCopyCredentials}
            />
          </div>
        ) : viewMode === 'compact' ? (
          <AccountCompactList
            accounts={sortedAccounts}
            metaByName={metaByName}
            groups={groups}
            tags={tags}
            actionStates={actionStates}
            selectedNames={selectedNames}
            onToggleSelection={toggleSelection}
            onRefresh={handleRefresh}
            onReset={handleReset}
            onRemove={handleRemove}
            onViewDetails={handleViewDetails}
            onCheck={handleCheck}
          />
        ) : (
          <AccountsTable
            accounts={sortedAccounts}
            metaByName={metaByName}
            groups={groups}
            tags={tags}
            actionStates={actionStates}
            selectedNames={selectedNames}
            sortField={sortOptions.field}
            sortOrder={sortOptions.order}
            onSort={handleSort}
            onToggleSelection={toggleSelection}
            onSelectAll={() => hasSelection ? deselectAll() : selectAll()}
            onRefresh={handleRefresh}
            onReset={handleReset}
            onRemove={handleRemove}
            onViewDetails={handleViewDetails}
          />
        )
      ) : !error && (
        <div className="bg-card rounded-2xl border border-border p-12 text-center">
          <div className="inline-flex p-4 rounded-2xl bg-muted mb-4">
            <UserPlus className="h-12 w-12 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {accounts.length === 0 ? '暂无账号' : '没有匹配的账号'}
          </h3>
          <p className="text-muted-foreground mb-6">
            {accounts.length === 0
              ? '点击上方"导入"按钮添加第一个 Kiro 账号'
              : '尝试调整筛选条件'}
          </p>
          {accounts.length === 0 && (
            <button
              onClick={() => setShowImportDialog(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl transition-colors"
            >
              <Import className="h-4 w-4" />
              <span>导入账号</span>
            </button>
          )}
        </div>
      )}

      {/* 对话框 */}
      {showGroupManager && (
        <GroupManageDialog
          groups={groups}
          onClose={() => setShowGroupManager(false)}
          onAddGroup={addGroup}
          onUpdateGroup={updateGroup}
          onRemoveGroup={removeGroup}
        />
      )}

      {showTagManager && (
        <TagManageDialog
          tags={tags}
          onClose={() => setShowTagManager(false)}
          onAddTag={addTag}
          onUpdateTag={updateTag}
          onRemoveTag={removeTag}
        />
      )}

      {showImportDialog && (
        <ImportAccountsDialog
          onClose={() => setShowImportDialog(false)}
          onSubmit={handleImport}
        />
      )}

      {showExportDialog && (
        <ExportDialog
          accounts={sortedAccounts}
          metaByName={metaByName}
          groups={groups}
          tags={tags}
          onClose={() => setShowExportDialog(false)}
        />
      )}

      {/* 账号详情对话框 */}
      {detailsAccount && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-lg shadow-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">账号详情</h2>
              <button
                onClick={() => setDetailsAccount(null)}
                className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">名称</span>
                  <p className="font-medium text-foreground">{detailsAccount.name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">状态</span>
                  <p className={`font-medium ${detailsAccount.healthy ? 'text-green-500' : 'text-red-500'}`}>
                    {detailsAccount.healthy ? '健康' : '异常'}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">认证方式</span>
                  <p className="font-medium text-foreground">{detailsAccount.authMethod || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">提供商</span>
                  <p className="font-medium text-foreground">{detailsAccount.provider || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Region</span>
                  <p className="font-medium text-foreground">{detailsAccount.region || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">过期时间</span>
                  <p className="font-medium text-foreground">
                    {detailsAccount.expiresAt ? new Date(detailsAccount.expiresAt).toLocaleString('zh-CN') : '-'}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">请求数</span>
                  <p className="font-medium text-foreground">{detailsAccount.requestCount}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">失败数</span>
                  <p className="font-medium text-foreground">{detailsAccount.failureCount}</p>
                </div>
              </div>

              {/* 凭证信息 */}
              <div className="space-y-3 pt-4 border-t border-border">
                <h3 className="text-sm font-medium text-foreground">凭证信息</h3>
                {detailsAccount.accessToken && (
                  <div>
                    <span className="text-xs text-muted-foreground">Access Token</span>
                    <p className="font-mono text-xs bg-muted p-2 rounded break-all max-h-24 overflow-y-auto">
                      {detailsAccount.accessToken}
                    </p>
                  </div>
                )}
                {detailsAccount.refreshToken && (
                  <div>
                    <span className="text-xs text-muted-foreground">Refresh Token</span>
                    <p className="font-mono text-xs bg-muted p-2 rounded break-all max-h-24 overflow-y-auto">
                      {detailsAccount.refreshToken}
                    </p>
                  </div>
                )}
                {detailsAccount.csrfToken && (
                  <div>
                    <span className="text-xs text-muted-foreground">CSRF Token</span>
                    <p className="font-mono text-xs bg-muted p-2 rounded break-all max-h-24 overflow-y-auto">
                      {detailsAccount.csrfToken}
                    </p>
                  </div>
                )}
                {detailsAccount.clientId && (
                  <div>
                    <span className="text-xs text-muted-foreground">Client ID</span>
                    <p className="font-mono text-xs bg-muted p-2 rounded break-all">{detailsAccount.clientId}</p>
                  </div>
                )}
                {detailsAccount.clientSecret && (
                  <div>
                    <span className="text-xs text-muted-foreground">Client Secret</span>
                    <p className="font-mono text-xs bg-muted p-2 rounded break-all max-h-24 overflow-y-auto">
                      {detailsAccount.clientSecret}
                    </p>
                  </div>
                )}
                {detailsAccount.profileArn && (
                  <div>
                    <span className="text-xs text-muted-foreground">Profile ARN</span>
                    <p className="font-mono text-xs bg-muted p-2 rounded break-all">{detailsAccount.profileArn}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-border">
              <button
                onClick={() => setDetailsAccount(null)}
                className="w-full px-4 py-2.5 bg-muted hover:bg-muted/80 text-foreground rounded-xl transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 加载详情中 */}
      {detailsLoading && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card rounded-xl p-6 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-foreground">加载账号详情...</span>
          </div>
        </div>
      )}
    </div>
  );
}
