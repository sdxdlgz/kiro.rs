import { useState } from 'react'
import { useTheme } from '../hooks/useTheme'
import {
  LayoutDashboard,
  Users,
  ChevronLeft,
  ChevronRight,
  Zap,
  Sun,
  Moon
} from 'lucide-react'

interface SidebarProps {
  currentPage: string
  onNavigate: (page: string) => void
}

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const { theme, toggleTheme } = useTheme()

  const navItems = [
    { id: 'dashboard', label: '仪表盘', icon: LayoutDashboard, description: '查看轮换池状态' },
    { id: 'accounts', label: '账号管理', icon: Users, description: '管理 Kiro 账号' },
  ]

  return (
    <aside className={`relative bg-card/95 backdrop-blur-xl border-r border-border flex flex-col transition-all duration-300 ${
      collapsed ? 'w-[72px]' : 'w-64'
    }`}>
      {/* 背景装饰 */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-primary/5 pointer-events-none" />

      {/* Logo */}
      <div className="relative h-16 flex items-center px-4 border-b border-border">
        <div className={`flex items-center gap-3 overflow-hidden transition-all duration-300 ${collapsed ? 'w-0 opacity-0' : 'w-full opacity-100'}`}>
          <div className="flex-shrink-0 p-2 rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/20">
            <Zap className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-foreground truncate">Kiro.rs</h1>
            <p className="text-[10px] text-muted-foreground truncate">管理面板</p>
          </div>
        </div>

        {collapsed && (
          <div className="flex-shrink-0 p-2 rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/20 mx-auto">
            <Zap className="h-5 w-5 text-primary-foreground" />
          </div>
        )}
      </div>

      {/* 折叠按钮 */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 z-10 p-1.5 bg-card border border-border rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-all shadow-lg"
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5" />
        ) : (
          <ChevronLeft className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Navigation */}
      <nav className="relative flex-1 p-3 space-y-1.5 overflow-y-auto">
        <div className={`mb-4 px-3 transition-all duration-300 ${collapsed ? 'opacity-0 h-0' : 'opacity-100'}`}>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">导航</p>
        </div>

        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = currentPage === item.id

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`group relative w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 ${
                isActive
                  ? 'bg-gradient-to-r from-primary/20 to-primary/10 text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
              title={collapsed ? item.label : undefined}
            >
              {/* 活动指示器 */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-gradient-to-b from-primary to-primary/80 rounded-r-full" />
              )}

              <div className={`flex-shrink-0 p-2 rounded-lg transition-colors ${
                isActive
                  ? 'bg-primary/20 text-primary'
                  : 'bg-muted text-muted-foreground group-hover:bg-accent group-hover:text-foreground'
              }`}>
                <Icon className="h-4 w-4" />
              </div>

              <div className={`min-w-0 text-left transition-all duration-300 ${collapsed ? 'w-0 opacity-0' : 'w-full opacity-100'}`}>
                <p className={`text-sm font-medium truncate ${isActive ? 'text-foreground' : ''}`}>
                  {item.label}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {item.description}
                </p>
              </div>

              {/* Hover 效果 */}
              {!isActive && (
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary/0 to-primary/0 group-hover:from-primary/5 group-hover:to-primary/5 transition-all pointer-events-none" />
              )}
            </button>
          )
        })}
      </nav>

      {/* 底部：主题切换 */}
      <div className="relative p-3 border-t border-border">
        <button
          onClick={toggleTheme}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground transition-all ${collapsed ? 'justify-center' : ''}`}
          title={collapsed ? (theme === 'dark' ? '切换到白天模式' : '切换到夜间模式') : undefined}
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4 flex-shrink-0" />
          ) : (
            <Moon className="h-4 w-4 flex-shrink-0" />
          )}
          {!collapsed && (
            <span className="text-sm">{theme === 'dark' ? '白天模式' : '夜间模式'}</span>
          )}
        </button>
      </div>

      {/* 版本信息 */}
      <div className={`relative px-4 py-3 border-t border-border transition-all duration-300 ${collapsed ? 'opacity-0 h-0 p-0 overflow-hidden' : 'opacity-100'}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] text-muted-foreground">版本</p>
            <p className="text-xs text-foreground font-mono">v1.0.0</p>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] text-muted-foreground">运行中</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
