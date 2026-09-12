import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Terminal,
  FolderTree,
  Code2,
  Settings,
  LayoutDashboard,
  Server,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';

interface CommandItem {
  id: string;
  category: 'Віртуальні машини' | 'Навігація' | 'Дії' | 'Сніппети';
  title: string;
  subtitle?: string;
  badge?: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  perform: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const {
    vms,
    selectVM,
    setActiveView,
    openTerminalForVM,
    snippets,
    sendSnippetToTerminal,
    activeServer,
  } = useApp();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Build commands list
  const items: CommandItem[] = [];

  // 1. Navigation items
  items.push(
    {
      id: 'nav-dashboard',
      category: 'Навігація',
      title: 'Огляд кластера (Dashboard)',
      subtitle: activeServer ? activeServer.name : 'Головний екран',
      icon: LayoutDashboard,
      perform: () => {
        setActiveView('dashboard');
        onClose();
      },
    },
    {
      id: 'nav-terminal',
      category: 'Навігація',
      title: 'Термінал SSH',
      subtitle: 'Сесії командного рядка',
      icon: Terminal,
      perform: () => {
        setActiveView('terminal');
        onClose();
      },
    },
    {
      id: 'nav-sftp',
      category: 'Навігація',
      title: 'Файловий менеджер SFTP',
      subtitle: 'Перегляд та передача файлів',
      icon: FolderTree,
      perform: () => {
        setActiveView('sftp');
        onClose();
      },
    },
    {
      id: 'nav-snippets',
      category: 'Навігація',
      title: 'Бібліотека сніппетів',
      subtitle: 'Збережені команди',
      icon: Code2,
      perform: () => {
        setActiveView('snippets');
        onClose();
      },
    },
    {
      id: 'nav-settings',
      category: 'Навігація',
      title: 'Налаштування',
      subtitle: 'Конфігурація застосунку та зовнішній вигляд',
      icon: Settings,
      perform: () => {
        setActiveView('settings');
        onClose();
      },
    }
  );

  // 2. VM items
  vms.forEach((vm) => {
    items.push({
      id: `vm-${vm.vmid}`,
      category: 'Віртуальні машини',
      title: vm.name,
      subtitle: `VMID: ${vm.vmid} • Нода: ${vm.node} • Стан: ${vm.status === 'running' ? 'Увімкнено' : 'Зупинено'}`,
      badge: `#${vm.vmid}`,
      icon: Server,
      iconColor: vm.status === 'running' ? 'text-emerald-500' : 'text-zinc-400',
      perform: () => {
        selectVM(vm);
        setActiveView('vm-detail');
        onClose();
      },
    });

    if (vm.status === 'running') {
      items.push({
        id: `vm-term-${vm.vmid}`,
        category: 'Дії',
        title: `Відкрити SSH термінал: ${vm.name}`,
        subtitle: `Підключення до #${vm.vmid}`,
        badge: 'SSH',
        icon: Terminal,
        iconColor: 'text-blue-500',
        perform: () => {
          selectVM(vm);
          openTerminalForVM(vm, 'ssh');
          onClose();
        },
      });

      items.push({
        id: `vm-sftp-${vm.vmid}`,
        category: 'Дії',
        title: `Перейти до SFTP: ${vm.name}`,
        subtitle: `Файлова система #${vm.vmid}`,
        badge: 'SFTP',
        icon: FolderTree,
        iconColor: 'text-amber-500',
        perform: () => {
          selectVM(vm);
          setActiveView('sftp');
          onClose();
        },
      });
    }
  });

  // 3. Snippets
  snippets.forEach((s) => {
    items.push({
      id: `snippet-${s.id}`,
      category: 'Сніппети',
      title: s.title,
      subtitle: s.command,
      badge: s.category,
      icon: Code2,
      perform: () => {
        sendSnippetToTerminal(s.command);
        onClose();
      },
    });
  });

  // Filter items
  const q = query.toLowerCase().trim();
  const filteredItems = items.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.subtitle?.toLowerCase().includes(q) ||
      item.badge?.toLowerCase().includes(q)
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filteredItems.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + (filteredItems.length || 1)) % (filteredItems.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].perform();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh] bg-black/40 dark:bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white/95 dark:bg-[#1C1C1F]/95 backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all text-zinc-900 dark:text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-zinc-200/80 dark:border-zinc-800/80">
          <Search className="w-5 h-5 text-zinc-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Введіть назву ВМ, команду або дію... (Esc для виходу)"
            className="flex-1 bg-transparent text-sm outline-hidden placeholder:text-zinc-400 font-medium"
          />
          <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-semibold text-zinc-400 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          className="max-h-[380px] overflow-y-auto p-2 divide-y divide-transparent space-y-0.5 text-xs"
        >
          {filteredItems.length === 0 ? (
            <div className="py-10 text-center text-zinc-400">
              Нічого не знайдено за запитом &laquo;{query}&raquo;
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const isSelected = index === selectedIndex;
              const Icon = item.icon;
              return (
                <div
                  key={item.id}
                  onClick={() => item.perform()}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${!isSelected && item.iconColor ? item.iconColor : ''}`} />
                    </div>
                    <div className="truncate">
                      <div className="font-medium truncate">{item.title}</div>
                      {item.subtitle && (
                        <div
                          className={`text-[10px] truncate ${
                            isSelected ? 'text-blue-100' : 'text-zinc-400 dark:text-zinc-500'
                          }`}
                        >
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 pl-2">
                    {item.badge && (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          isSelected
                            ? 'bg-white/20 text-white'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                    <span
                      className={`text-[10px] ${
                        isSelected ? 'text-blue-100' : 'text-zinc-400'
                      }`}
                    >
                      {item.category}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts helper */}
        <div className="px-4 py-2 bg-zinc-50/80 dark:bg-[#18181A]/80 border-t border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-400">
          <div className="flex items-center gap-3">
            <span>↑↓ Навігація</span>
            <span>↵ Вибрати</span>
            <span>esc Закрити</span>
          </div>
          <span className="font-medium">V-Master Command Palette</span>
        </div>
      </div>
    </div>
  );
};
