import React, { useState } from 'react';
import {
  Server,
  Plus,
  LayoutDashboard,
  Terminal,
  FolderTree,
  Code2,
  Settings,
  ChevronRight,
  ChevronDown,
  HardDrive,
  Circle,
  Flame,
  Lock,
  ArrowUpCircle,
  RefreshCw,
  Heart,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useTranslation } from '../contexts/LanguageContext';
import { ServerModal } from './ServerModal';

interface NavItem {
  id: 'dashboard' | 'terminal' | 'sftp' | 'snippets' | 'settings';
  label: string;
  icon: any;
  badge?: number;
}

export const Sidebar: React.FC = () => {
  const { t } = useTranslation();
  const {
    servers,
    activeServer,
    nodes,
    vms,
    selectedVM,
    tabs,
    activeView,
    vmUpdates,
    vmAlerts,
    checkAllVMUpdates,
    setActiveView,
    selectServer,
    selectVM,
    saveServer,
    openTerminalForVM,
  } = useApp();

  const [isServerModalOpen, setIsServerModalOpen] = useState(false);
  const [isServerDropdownOpen, setIsServerDropdownOpen] = useState(false);
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});
  const [collapsedInactiveNodes, setCollapsedInactiveNodes] = useState<Record<string, boolean>>({});

  const toggleNodeCollapse = (nodeName: string) => {
    setCollapsedNodes((prev) => ({ ...prev, [nodeName]: !prev[nodeName] }));
  };

  const toggleInactiveNodeCollapse = (nodeName: string) => {
    setCollapsedInactiveNodes((prev) => ({
      ...prev,
      [nodeName]: prev[nodeName] === undefined ? false : !prev[nodeName],
    }));
  };

  const navItems: NavItem[] = [
    { id: 'dashboard', label: t('sidebar.clusterOverview'), icon: LayoutDashboard },
    { id: 'terminal', label: t('sidebar.vmTerminals'), icon: Terminal, badge: tabs.length },
    { id: 'sftp', label: t('sidebar.sftpFiles'), icon: FolderTree },
    { id: 'snippets', label: t('sidebar.commandSnippets'), icon: Code2 },
    { id: 'settings', label: t('sidebar.settings'), icon: Settings },
  ];

  return (
    <aside className="w-64 h-full flex flex-col border-r select-none transition-colors duration-200 bg-[#ECECEC] dark:bg-[#1E1E22] border-[#D4D4D4] dark:border-[#2E2E32] text-zinc-700 dark:text-zinc-300">
      {/* Server Selector Bar */}
      <div className="p-3 border-b border-[#D4D4D4] dark:border-[#2E2E32]">
        <div className="relative">
          <button
            onClick={() => setIsServerDropdownOpen(!isServerDropdownOpen)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white dark:bg-[#28282D] border border-zinc-300 dark:border-zinc-700 text-xs font-medium shadow-xs hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
          >
            <div className="flex items-center gap-2 truncate">
              <Server className="w-4 h-4 text-blue-500 shrink-0" />
              <span className="truncate">{activeServer ? activeServer.name : t('sidebar.selectServerPrompt')}</span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          </button>

          {/* Server Dropdown */}
          {isServerDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white dark:bg-[#28282D] border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl overflow-hidden py-1 text-xs">
              <div className="px-2 py-1 text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                {t('sidebar.pveServers')}
              </div>
              {servers.map((srv) => (
                <button
                  key={srv.id}
                  onClick={() => {
                    selectServer(srv);
                    setIsServerDropdownOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-colors ${
                    activeServer?.id === srv.id
                      ? 'text-blue-600 dark:text-blue-400 font-medium bg-blue-50/50 dark:bg-blue-950/20'
                      : ''
                  }`}
                >
                  <span className="truncate">{srv.name}</span>
                  <span className="text-[10px] text-zinc-400">{srv.host}</span>
                </button>
              ))}
              <div className="border-t border-zinc-200 dark:border-zinc-700 mt-1 pt-1">
                <button
                  onClick={() => {
                    setIsServerDropdownOpen(false);
                    setIsServerModalOpen(true);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('sidebar.addNewServer')}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Navigation */}
      <div className="p-2 space-y-0.5 border-b border-[#D4D4D4] dark:border-[#2E2E32]">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'hover:bg-zinc-200/80 dark:hover:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-zinc-500 dark:text-zinc-400'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge !== undefined && item.badge > 0 && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    isActive ? 'bg-white/20 text-white' : 'bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Proxmox Nodes & VMs Tree */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="px-2 py-1 flex items-center justify-between text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
          <span>{t('sidebar.clusterVms')}</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => checkAllVMUpdates()}
              title={t('sidebar.checkAllUpdates')}
              className="p-1 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
            <span className="text-[10px] font-normal">{t('sidebar.vmsCount', { count: vms.length })}</span>
          </div>
        </div>

        {nodes.length === 0 && activeServer && (
          <div className="px-3 py-4 text-center text-xs text-zinc-400">
            {t('sidebar.nodeNotFound')}
          </div>
        )}

        {nodes.map((node) => {
          const isCollapsed = collapsedNodes[node.node] || false;
          const nodeVMs = vms.filter((v) => v.node === node.node).sort((a, b) => a.vmid - b.vmid);
          const activeNodeVMs = nodeVMs.filter((v) => v.status === 'running');
          const inactiveNodeVMs = nodeVMs.filter((v) => v.status !== 'running');
          const isInactiveCollapsed = collapsedInactiveNodes[node.node] ?? true;

          const renderSidebarVMItem = (vm: (typeof vms)[0]) => {
            const isSelected = selectedVM?.vmid === vm.vmid && activeView === 'vm-detail';
            const isRunning = vm.status === 'running';

            return (
              <div
                key={vm.vmid}
                onClick={() => selectVM(vm)}
                className={`group flex items-center justify-between px-2 py-1 rounded-md text-xs cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 font-medium'
                    : 'hover:bg-zinc-200/70 dark:hover:bg-zinc-800/70 text-zinc-700 dark:text-zinc-300'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-1">
                  <Circle
                    className={`w-2 h-2 fill-current shrink-0 ${
                      isRunning
                        ? 'text-emerald-500'
                        : vm.status === 'paused'
                        ? 'text-amber-500'
                        : 'text-zinc-400'
                    }`}
                  />
                  <span className="truncate min-w-0">{vm.name}</span>
                  <span className="text-[10px] text-zinc-400 shrink-0">#{vm.vmid}</span>
                  <div className="flex items-center gap-0.5 shrink-0 ml-auto">
                    {vmUpdates[vm.vmid]?.isLoading && (
                      <span
                        title={t('sidebar.checkingUpdates')}
                        className="inline-flex items-center justify-center p-0.5 text-zinc-400 dark:text-zinc-500 shrink-0"
                      >
                        <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                      </span>
                    )}
                    {vmAlerts[vm.vmid]?.hasAlert && (
                      <span
                        title={t('sidebar.highResourceUsage', { cpu: vmAlerts[vm.vmid].cpuPercent, ram: vmAlerts[vm.vmid].ramPercent })}
                        className={`inline-flex items-center justify-center p-0.5 rounded-full ${
                          vmAlerts[vm.vmid].severity === 'critical'
                            ? 'bg-rose-500 text-white animate-pulse'
                            : 'bg-amber-500 text-white'
                        } shadow-xs shrink-0`}
                      >
                        <Flame className="w-2.5 h-2.5" />
                      </span>
                    )}
                    {vmUpdates[vm.vmid]?.hasCritical && (
                      <span
                        title={t('sidebar.criticalUpdates')}
                        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-red-500 text-white font-bold text-[9px] shrink-0 animate-pulse shadow-xs"
                      >
                        !
                      </span>
                    )}
                    {vmUpdates[vm.vmid]?.hasDangerousOnly && !vmUpdates[vm.vmid]?.hasCritical && (
                      <span
                        title={t('sidebar.dangerousUpdates')}
                        className="inline-flex items-center justify-center p-0.5 rounded-full bg-amber-500 text-white shadow-xs shrink-0"
                      >
                        <Lock className="w-2.5 h-2.5" />
                      </span>
                    )}
                    {!vmUpdates[vm.vmid]?.hasCritical && (vmUpdates[vm.vmid]?.safeCount || 0) > 0 && (
                      <span
                        title={t('sidebar.safeUpdatesCount', { count: vmUpdates[vm.vmid].safeCount })}
                        className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded-full bg-blue-500/15 dark:bg-blue-400/20 text-blue-600 dark:text-blue-400 font-semibold text-[9px] border border-blue-500/30 dark:border-blue-400/30 shadow-2xs shrink-0"
                      >
                        <ArrowUpCircle className="w-2.5 h-2.5" />
                        <span>{vmUpdates[vm.vmid].safeCount}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Quick Terminal Launch Button on Hover */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {isRunning && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openTerminalForVM(vm, 'ssh');
                      }}
                      title={t('sidebar.openSshTerminal')}
                      className="p-1 rounded hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
                    >
                      <Terminal className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          };

          return (
            <div key={node.node} className="mt-1">
              {/* Node Header */}
              <button
                onClick={() => toggleNodeCollapse(node.node)}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60 transition-colors text-xs font-medium"
              >
                <div className="flex items-center gap-1.5 truncate">
                  {isCollapsed ? (
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  )}
                  <HardDrive className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 shrink-0" />
                  <span className="truncate">{node.node}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Circle
                    className={`w-2 h-2 fill-current ${
                      node.status === 'online' ? 'text-emerald-500' : 'text-red-500'
                    }`}
                  />
                  <span className="text-[10px] text-zinc-400">({nodeVMs.length})</span>
                </div>
              </button>

              {/* Node VMs List */}
              {!isCollapsed && (
                <div className="pl-4 pr-1 mt-0.5 space-y-0.5">
                  {activeNodeVMs.map((vm) => renderSidebarVMItem(vm))}

                  {/* Collapsed Inactive VMs at the bottom */}
                  {inactiveNodeVMs.length > 0 && (
                    <div className="pt-1 mt-1 border-t border-zinc-200/60 dark:border-zinc-800/60">
                      <button
                        onClick={() => toggleInactiveNodeCollapse(node.node)}
                        className="w-full flex items-center justify-between px-1.5 py-1 rounded text-[11px] text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer select-none"
                      >
                        <div className="flex items-center gap-1 truncate">
                          {isInactiveCollapsed ? (
                            <ChevronRight className="w-3 h-3 text-zinc-400 shrink-0" />
                          ) : (
                            <ChevronDown className="w-3 h-3 text-zinc-400 shrink-0" />
                          )}
                          <span className="truncate">{t('sidebar.inactiveVms')}</span>
                        </div>
                        <span className="text-[10px] text-zinc-400">({inactiveNodeVMs.length})</span>
                      </button>
                      {!isInactiveCollapsed && (
                        <div className="pl-2 mt-0.5 space-y-0.5 view-animate">
                          {inactiveNodeVMs.map((vm) => renderSidebarVMItem(vm))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="py-2.5 px-3 border-t border-[#D4D4D4] dark:border-[#2E2E32] text-[11px] text-zinc-500 dark:text-zinc-400 flex flex-col items-center justify-center gap-1 text-center">
        <span className="select-none font-medium">V-Master v{__APP_VERSION__}</span>
        <button
          onClick={() => {
            window.api?.system?.openExternal('https://send.monobank.ua/jar/6s5yE12CxH');
          }}
          title={t('sidebar.supportProjectTooltip')}
          className="inline-flex items-center justify-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-700 dark:hover:text-rose-300 transition-colors cursor-pointer"
        >
          <Heart className="w-3.5 h-3.5 fill-rose-500/20 text-rose-500" />
          <span>{t('sidebar.supportProject')}</span>
        </button>
      </div>

      {/* Server Modal */}
      <ServerModal
        isOpen={isServerModalOpen}
        onClose={() => setIsServerModalOpen(false)}
        onSave={saveServer}
      />
    </aside>
  );
};
