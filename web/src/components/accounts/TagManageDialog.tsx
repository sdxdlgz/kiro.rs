import { useState } from 'react';
import { X, Plus, Trash2, Edit2, Check, Tag } from 'lucide-react';
import type { AccountTag } from '../../types';

interface TagManageDialogProps {
  tags: AccountTag[];
  onClose: () => void;
  onAddTag: (input: { name: string; color: string }) => string;
  onUpdateTag: (tagId: string, patch: Partial<Omit<AccountTag, 'id'>>) => void;
  onRemoveTag: (tagId: string) => void;
}

const colorOptions = [
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#6366f1', // indigo
];

export function TagManageDialog({
  tags,
  onClose,
  onAddTag,
  onUpdateTag,
  onRemoveTag,
}: TagManageDialogProps) {
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(colorOptions[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingColor, setEditingColor] = useState('');

  const handleAdd = () => {
    if (!newTagName.trim()) return;
    onAddTag({ name: newTagName.trim(), color: newTagColor });
    setNewTagName('');
    setNewTagColor(colorOptions[Math.floor(Math.random() * colorOptions.length)]);
  };

  const startEditing = (tag: AccountTag) => {
    setEditingId(tag.id);
    setEditingName(tag.name);
    setEditingColor(tag.color);
  };

  const saveEditing = () => {
    if (!editingId || !editingName.trim()) return;
    onUpdateTag(editingId, { name: editingName.trim(), color: editingColor });
    setEditingId(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-md shadow-2xl">
        {/* 头部 */}
        <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/20 border border-purple-500/30">
              <Tag className="h-5 w-5 text-purple-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">标签管理</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors text-slate-400 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* 添加新标签 */}
          <div className="flex gap-2">
            <div className="flex-1 flex gap-2">
              <input
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="新标签名称"
                className="flex-1 px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              <div className="relative">
                <input
                  type="color"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent"
                />
              </div>
            </div>
            <button
              onClick={handleAdd}
              disabled={!newTagName.trim()}
              className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>

          {/* 标签列表 */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {tags.length === 0 ? (
              <p className="text-center text-slate-500 py-8">暂无标签</p>
            ) : (
              tags.map((tag) => (
                <div
                  key={tag.id}
                  className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-xl border border-slate-700/50"
                >
                  {editingId === tag.id ? (
                    <>
                      <input
                        type="color"
                        value={editingColor}
                        onChange={(e) => setEditingColor(e.target.value)}
                        className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
                      />
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="flex-1 px-3 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEditing();
                          if (e.key === 'Escape') cancelEditing();
                        }}
                      />
                      <button
                        onClick={saveEditing}
                        className="p-1.5 hover:bg-green-500/20 rounded-lg text-green-400 transition-colors"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={cancelEditing}
                        className="p-1.5 hover:bg-slate-700/50 rounded-lg text-slate-400 transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span
                        className="w-4 h-4 rounded-full flex-shrink-0"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="flex-1 text-white">{tag.name}</span>
                      <button
                        onClick={() => startEditing(tag)}
                        className="p-1.5 hover:bg-slate-700/50 rounded-lg text-slate-400 hover:text-white transition-colors"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onRemoveTag(tag.id)}
                        className="p-1.5 hover:bg-red-500/20 rounded-lg text-red-400 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* 底部 */}
        <div className="px-6 py-4 border-t border-slate-700/50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 bg-slate-700/50 hover:bg-slate-700 text-white rounded-xl transition-colors"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
