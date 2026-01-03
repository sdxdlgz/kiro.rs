import { Button, Badge } from '@/components/ui'
import type { FilterOptions, SortOptions, SortField, ViewMode } from '@/types'
import {
  Search,
  Upload,
  Download,
  RefreshCw,
  Trash2,
  Tag,
  FolderPlus,
  CheckSquare,
  Square,
  Loader2,
  Filter,
  LayoutGrid,
  List,
  AlignJustify,
  X,
  Activity
} from 'lucide-react'

interface AccountsToolbarProps {
  // 搜索
  searchValue: string
  onSearchChange: (value: string) => void

  // 视图
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void

  // 筛选
  filterOptions: FilterOptions
  showFilterPanel: boolean
  onToggleFilterPanel: () => void

  // 排序
  sortOptions: SortOptions
  onSortChange: (options: SortOptions) => void

  // 选择
  hasSelection: boolean
  selectionCount: number
  onSelectAll: () => void
  onDeselectAll: () => void

  // 批量操作
  onBatchRefresh: () => void
  onBatchDelete: () => void
  onBatchCheck?: () => void
  batchLoading: boolean
  batchCheckLoading?: boolean

  // 分组/标签管理
  onOpenGroupManager: () => void
  onOpenTagManager: () => void

  // 导入/导出
  onImport: () => void
  onExport: () => void

  // 总数
  totalCount: number
  filteredCount: number
}

const sortFieldLabels: Record<SortField, string> = {
  name: '名称',
  request_count: '请求数',
  failure_count: '失败数',
  provider: '提供商',
  status: '状态'
}

export function AccountsToolbar({
  searchValue,
  onSearchChange,
  viewMode,
  onViewModeChange,
  filterOptions,
  showFilterPanel,
  onToggleFilterPanel,
  sortOptions,
  onSortChange,
  hasSelection,
  selectionCount,
  onSelectAll,
  onDeselectAll,
  onBatchRefresh,
  onBatchDelete,
  onBatchCheck,
  batchLoading,
  batchCheckLoading,
  onOpenGroupManager,
  onOpenTagManager,
  onImport,
  onExport,
  totalCount,
  filteredCount
}: AccountsToolbarProps) {
  const hasActiveFilters = !!(
    filterOptions.search ||
    (filterOptions.status && filterOptions.status.length > 0) ||
    (filterOptions.providers && filterOptions.providers.length > 0) ||
    (filterOptions.authMethods && filterOptions.authMethods.length > 0) ||
    filterOptions.inPool !== undefined ||
    (filterOptions.groupIds && filterOptions.groupIds.length > 0) ||
    (filterOptions.tagIds && filterOptions.tagIds.length > 0)
  )

  const handleToggleSelectAll = () => {
    if (selectionCount === filteredCount && filteredCount > 0) {
      onDeselectAll()
    } else {
      onSelectAll()
    }
  }

  return (
    <div className="space-y-3">
      {/* 搜索和主要操作 */}
      <div className="flex items-center gap-3">
        {/* 搜索框 */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索账号..."
            className="w-full pl-9 pr-8 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {searchValue && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:bg-muted rounded"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* 主要操作按钮 */}
        <Button onClick={onImport}>
          <Upload className="h-4 w-4 mr-1" />
          导入
        </Button>
        <Button variant="outline" onClick={onExport}>
          <Download className="h-4 w-4 mr-1" />
          导出
        </Button>
      </div>

      {/* 统计和选择操作 */}
      <div className="flex items-center justify-between">
        {/* 左侧：统计信息 */}
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            共 <span className="font-medium text-foreground">{totalCount}</span> 个账号
            {filteredCount !== totalCount && (
              <span>，已筛选 <span className="font-medium text-foreground">{filteredCount}</span> 个</span>
            )}
          </span>
          {hasSelection && (
            <Badge variant="secondary" className="gap-1">
              已选 {selectionCount} 个
            </Badge>
          )}
        </div>

        {/* 右侧：选择操作和管理 */}
        <div className="flex items-center gap-2">
          {/* 视图切换 */}
          <div className="flex items-center border rounded-lg p-0.5">
            <Button
              variant={viewMode === 'card' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2"
              onClick={() => onViewModeChange('card')}
              title="卡片视图"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'compact' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2"
              onClick={() => onViewModeChange('compact')}
              title="紧凑视图"
            >
              <AlignJustify className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'table' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2"
              onClick={() => onViewModeChange('table')}
              title="表格视图"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>

          {/* 排序 */}
          <select
            value={sortOptions.field}
            onChange={(e) => onSortChange({ ...sortOptions, field: e.target.value as SortField })}
            className="h-8 px-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {Object.entries(sortFieldLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={() => onSortChange({ ...sortOptions, order: sortOptions.order === 'asc' ? 'desc' : 'asc' })}
          >
            {sortOptions.order === 'asc' ? '↑' : '↓'}
          </Button>

          <div className="w-px h-6 bg-border mx-1" />

          {/* 分组/标签管理 */}
          <Button variant="ghost" size="sm" onClick={onOpenGroupManager}>
            <FolderPlus className="h-4 w-4 mr-1" />
            分组
          </Button>
          <Button variant="ghost" size="sm" onClick={onOpenTagManager}>
            <Tag className="h-4 w-4 mr-1" />
            标签
          </Button>

          {/* 筛选按钮 */}
          <Button
            variant={showFilterPanel || hasActiveFilters ? 'default' : 'ghost'}
            size="sm"
            onClick={onToggleFilterPanel}
          >
            <Filter className="h-4 w-4 mr-1" />
            筛选
            {hasActiveFilters && (
              <span className="ml-1 w-2 h-2 rounded-full bg-white" />
            )}
          </Button>

          <div className="w-px h-6 bg-border mx-1" />

          {/* 批量操作 */}
          {onBatchCheck && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onBatchCheck}
              disabled={batchCheckLoading || selectionCount === 0}
              title="检查选中账号的使用量和订阅信息"
            >
              {batchCheckLoading ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Activity className="h-4 w-4 mr-1" />
              )}
              检查
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onBatchRefresh}
            disabled={batchLoading || selectionCount === 0}
          >
            {batchLoading ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            刷新
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={onBatchDelete}
            disabled={selectionCount === 0}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            删除
          </Button>

          <div className="w-px h-6 bg-border mx-1" />

          {/* 全选 */}
          <Button variant="ghost" size="sm" onClick={handleToggleSelectAll}>
            {selectionCount === filteredCount && filteredCount > 0 ? (
              <CheckSquare className="h-4 w-4 mr-1" />
            ) : (
              <Square className="h-4 w-4 mr-1" />
            )}
            {selectionCount > 0 ? `已选 ${selectionCount}` : '全选'}
          </Button>
        </div>
      </div>
    </div>
  )
}
