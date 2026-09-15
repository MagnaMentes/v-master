import React, { useState } from 'react';
import {
  Code2,
  Plus,
  Play,
  Copy,
  Trash2,
  Edit2,
  Check,
  Search,
  Package,
  Cpu,
  Boxes,
  Globe,
  Tag,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useTranslation } from '../contexts/LanguageContext';
import type { Snippet } from '../types';

export const SnippetsView: React.FC = () => {
  const { t } = useTranslation();
  const { snippets, saveSnippet, deleteSnippet, sendSnippetToTerminal, tabs } = useApp();

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modal edit/create
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingSnippet, setEditingSnippet] = useState<Snippet | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [command, setCommand] = useState('');
  const [category, setCategory] = useState<Snippet['category']>('custom');

  const categories = [
    { id: 'all', label: t('snippets.categories.all'), icon: Tag },
    { id: 'system', label: t('snippets.categories.system'), icon: Cpu },
    { id: 'package', label: t('snippets.categories.package'), icon: Package },
    { id: 'docker', label: t('snippets.categories.docker'), icon: Boxes },
    { id: 'network', label: t('snippets.categories.network'), icon: Globe },
    { id: 'custom', label: t('snippets.categories.custom'), icon: Code2 },
  ];

  const filtered = snippets.filter((s) => {
    const matchCategory = selectedCategory === 'all' || s.category === selectedCategory;
    const matchSearch =
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase()) ||
      s.command.toLowerCase().includes(search.toLowerCase());
    return matchCategory && matchSearch;
  });

  const handleOpenCreate = () => {
    setEditingSnippet(null);
    setTitle('');
    setDescription('');
    setCommand('');
    setCategory('custom');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (s: Snippet) => {
    setEditingSnippet(s);
    setTitle(s.title);
    setDescription(s.description);
    setCommand(s.command);
    setCategory(s.category);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !command) return;

    const snip: Snippet = {
      id: editingSnippet?.id || `snip-${Date.now()}`,
      title,
      description,
      command,
      category,
    };

    await saveSnippet(snip);
    setIsModalOpen(false);
  };

  const handleCopy = (snip: Snippet) => {
    navigator.clipboard.writeText(snip.command);
    setCopiedId(snip.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-50 dark:bg-[#18181B] text-zinc-800 dark:text-zinc-100 overflow-hidden select-none">
      {/* Top Header */}
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-white dark:bg-[#252528]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
            <Code2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold">{t('snippets.title')}</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {t('snippets.subtitle')}
            </p>
          </div>
        </div>

        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors shadow-xs cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{t('snippets.add')}</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="px-4 py-3 bg-zinc-100 dark:bg-[#202024] border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Category Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  isSelected
                    ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-xs border border-zinc-200 dark:border-zinc-700'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/80 dark:hover:bg-zinc-800/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search Field */}
        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('snippets.search')}
            className="w-full pl-8 pr-3 py-1 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-xs focus:outline-hidden focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Snippets Grid */}
      <div className="flex-1 overflow-y-auto p-5">
        {filtered.length === 0 ? (
          <div className="text-center p-12 text-xs text-zinc-400">
            Команд за вашим запитом не знайдено
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((snip) => (
              <div
                key={snip.id}
                className="p-4 rounded-xl bg-white dark:bg-[#252528] border border-zinc-200 dark:border-zinc-700/80 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                      {snip.title}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-medium">
                      {snip.category}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                    {snip.description || 'Немає опису'}
                  </p>
                  <div className="mt-2.5 p-2 rounded-lg bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-zinc-800 font-mono text-[11px] text-zinc-800 dark:text-zinc-200 break-all">
                    {snip.command}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 mt-3 border-t border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleCopy(snip)}
                      title="Скопіювати команду"
                      className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
                    >
                      {copiedId === snip.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => handleOpenEdit(snip)}
                      title={t('common.edit')}
                      className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteSnippet(snip.id)}
                      title={t('common.delete')}
                      className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/40 text-zinc-400 hover:text-red-500 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button
                    onClick={() => sendSnippetToTerminal(snip.command)}
                    title={
                      tabs.length > 0
                        ? t('snippets.runInTerminal')
                        : 'Спочатку відкрийте термінал ВМ'
                    }
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors shadow-xs cursor-pointer"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>{t('snippets.runInTerminal')}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Snippet Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-[#252528] rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700 p-5 text-zinc-800 dark:text-zinc-100 text-xs">
            <h3 className="font-bold text-sm mb-3">
              {editingSnippet ? t('common.edit') : t('snippets.add')}
            </h3>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block font-medium mb-1">{t('sftp.name')} *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Docker Compose Up"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700"
                />
              </div>

              <div>
                <label className="block font-medium mb-1">{t('snippets.category')}</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700"
                >
                  <option value="system">{t('snippets.categories.system')}</option>
                  <option value="package">{t('snippets.categories.package')}</option>
                  <option value="docker">{t('snippets.categories.docker')}</option>
                  <option value="network">{t('snippets.categories.network')}</option>
                  <option value="custom">{t('snippets.categories.custom')}</option>
                </select>
              </div>

              <div>
                <label className="block font-medium mb-1">{t('snippets.description')}</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Короткий опис команди"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700"
                />
              </div>

              <div>
                <label className="block font-medium mb-1">{t('snippets.command')} (Bash / Shell) *</label>
                <textarea
                  required
                  rows={3}
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="docker compose pull && docker compose up -d"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={!title || !command}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium cursor-pointer"
                >
                  {t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
