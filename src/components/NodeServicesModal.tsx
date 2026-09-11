import React, { useState, useEffect, useCallback } from 'react';
import { X, RefreshCw, RotateCcw, Search, CheckCircle2, AlertCircle, Layers } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import type { ProxmoxNodeService } from '../types';

interface NodeServicesModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodeName: string;
}

export const NodeServicesModal: React.FC<NodeServicesModalProps> = ({
  isOpen,
  onClose,
  nodeName,
}) => {
  const { activeServer } = useApp();
  const [services, setServices] = useState<ProxmoxNodeService[]>([]);
  const [loading, setLoading] = useState(false);
  const [restartingService, setRestartingService] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchServices = useCallback(async () => {
    if (!activeServer || !nodeName) return;
    setLoading(true);
    setStatusMsg(null);
    try {
      if (window.api?.proxmox?.getNodeServices) {
        const list = await window.api.proxmox.getNodeServices(activeServer, nodeName);
        setServices(list);
      }
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err.message || 'Не вдалося завантажити список служб Proxmox',
      });
    } finally {
      setLoading(false);
    }
  }, [activeServer, nodeName]);

  useEffect(() => {
    if (isOpen) {
      fetchServices();
      setSearchTerm('');
      setStatusMsg(null);
    }
  }, [isOpen, fetchServices]);

  if (!isOpen) return null;

  const handleRestart = async (serviceName: string) => {
    if (!activeServer) return;
    setRestartingService(serviceName);
    setStatusMsg(null);
    try {
      if (window.api?.proxmox?.restartNodeService) {
        const res = await window.api.proxmox.restartNodeService(activeServer, nodeName, serviceName);
        if (res.success) {
          setStatusMsg({
            type: 'success',
            text: `Службу ${serviceName} успішно перезапущено!`,
          });
          setTimeout(fetchServices, 1500);
        } else {
          setStatusMsg({
            type: 'error',
            text: res.error || `Не вдалося перезапустити службу ${serviceName}`,
          });
        }
      }
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err.message || 'Помилка під час перезапуску служби',
      });
    } finally {
      setRestartingService(null);
    }
  };

  const filteredServices = services.filter(
    (s) =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.service.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.desc && s.desc.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 backdrop-animate"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-white dark:bg-[#1E1E22] rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden text-zinc-800 dark:text-zinc-100 modal-animate"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-[#25252a]/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight flex items-center gap-2">
                Служби Proxmox: {nodeName}
                <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                  {services.length} служб
                </span>
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Моніторинг стану та керування демонами гіпервізора
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchServices}
              disabled={loading}
              className="p-2 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer"
              title="Оновити список"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-500' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status Message */}
        {statusMsg && (
          <div
            className={`px-6 py-2.5 border-b text-xs flex items-center gap-2 transition-colors ${
              statusMsg.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300'
                : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300'
            }`}
          >
            {statusMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span className="flex-1">{statusMsg.text}</span>
            <button
              onClick={() => setStatusMsg(null)}
              className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Filter Toolbar */}
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/30 dark:bg-[#18181b]/30">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Пошук служб (pvedaemon, pveproxy, corosync...)"
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-white dark:bg-[#202024] border border-zinc-200 dark:border-zinc-700 text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500/40"
            />
          </div>
        </div>

        {/* Services List */}
        <div className="flex-1 overflow-y-auto p-4 divide-y divide-zinc-100 dark:divide-zinc-800/60 min-h-[260px]">
          {loading && services.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-400 gap-3">
              <RefreshCw className="w-7 h-7 animate-spin text-blue-500" />
              <span className="text-xs">Завантаження служб Proxmox...</span>
            </div>
          ) : filteredServices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-400 text-xs">
              Служб не знайдено
            </div>
          ) : (
            filteredServices.map((svc) => {
              const isRunning = svc.state === 'running';
              const isRestarting = restartingService === svc.service;

              return (
                <div
                  key={svc.service}
                  className="flex items-center justify-between py-2.5 px-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 rounded-xl transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                        isRunning
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isRunning ? 'bg-emerald-500' : 'bg-zinc-400'
                        }`}
                      />
                      {isRunning ? 'Running' : 'Stopped'}
                    </span>
                    <div>
                      <div className="text-xs font-semibold font-mono text-zinc-900 dark:text-zinc-100">
                        {svc.name || svc.service}
                      </div>
                      {svc.desc && (
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight">
                          {svc.desc}
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => handleRestart(svc.service)}
                    disabled={isRestarting}
                    className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-2xs"
                    title="Перезапустити службу"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${isRestarting ? 'animate-spin text-blue-500' : ''}`} />
                    <span>{isRestarting ? 'Перезапуск...' : 'Перезапустити'}</span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-[#25252a]/40">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 transition-colors cursor-pointer"
          >
            Закрити
          </button>
        </div>
      </div>
    </div>
  );
};
