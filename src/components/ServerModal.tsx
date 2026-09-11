import React, { useState } from 'react';
import { X, Server, CheckCircle2, AlertCircle } from 'lucide-react';
import type { ProxmoxServerConfig } from '../types';

interface ServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (server: ProxmoxServerConfig) => Promise<void>;
  initialServer?: ProxmoxServerConfig | null;
}

export const ServerModal: React.FC<ServerModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialServer,
}) => {
  const [name, setName] = useState(initialServer?.name || '');
  const [host, setHost] = useState(initialServer?.host || '');
  const [port, setPort] = useState(initialServer?.port || 8006);
  const [authType, setAuthType] = useState<'token' | 'ticket'>(initialServer?.authType || 'token');
  const [tokenId, setTokenId] = useState(initialServer?.tokenId || '');
  const [tokenSecret, setTokenSecret] = useState(initialServer?.tokenSecret || '');
  const [username, setUsername] = useState(initialServer?.username || 'root');
  const [password, setPassword] = useState(initialServer?.password || '');
  const [realm, setRealm] = useState(initialServer?.realm || 'pam');
  const [verifySsl, setVerifySsl] = useState(initialServer?.verifySsl ?? false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const config: ProxmoxServerConfig = {
        id: initialServer?.id || `srv-${Date.now()}`,
        name: name || host,
        host,
        port: Number(port),
        authType,
        tokenId,
        tokenSecret,
        username,
        password,
        realm,
        verifySsl,
      };

      if (!window.api?.proxmox?.testConnection) {
        setTestResult({
          success: false,
          message: 'Системний міст Proxmox не підключено. Спробуйте оновити вікно (Cmd+R).',
        });
        return;
      }

      const res = await window.api.proxmox.testConnection(config);
      if (res.success) {
        setTestResult({
          success: true,
          message: `Успішно підключено! Proxmox VE ${res.version || ''}`,
        });
      } else {
        setTestResult({
          success: false,
          message: res.error || 'Помилка з’єднання',
        });
      }
    } catch (e: any) {
      setTestResult({ success: false, message: e.message });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!host) return;

    setSaving(true);
    try {
      const config: ProxmoxServerConfig = {
        id: initialServer?.id || `srv-${Date.now()}`,
        name: name || host,
        host,
        port: Number(port),
        authType,
        tokenId,
        tokenSecret,
        username,
        password,
        realm,
        verifySsl,
      };

      await onSave(config);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white dark:bg-[#252528] rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden text-zinc-800 dark:text-zinc-100">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center gap-2 font-semibold">
            <Server className="w-5 h-5 text-blue-500" />
            <span>{initialServer ? 'Редагувати сервер Proxmox' : 'Додати сервер Proxmox'}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-sm">
          <div>
            <label className="block font-medium text-xs mb-1">Назва сервера</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Мій Proxmox Кластер"
              className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block font-medium text-xs mb-1">Хост або IP адреса *</label>
              <input
                type="text"
                required
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="192.168.1.100 або pve.local"
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block font-medium text-xs mb-1">Порт</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                placeholder="8006"
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-xs mb-1">Тип автентифікації</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAuthType('token')}
                className={`py-1.5 px-3 rounded-lg border text-xs font-medium transition-colors ${
                  authType === 'token'
                    ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                API Token (Рекомендовано)
              </button>
              <button
                type="button"
                onClick={() => setAuthType('ticket')}
                className={`py-1.5 px-3 rounded-lg border text-xs font-medium transition-colors ${
                  authType === 'ticket'
                    ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                Логін / Пароль
              </button>
            </div>
          </div>

          {authType === 'token' ? (
            <div className="space-y-3 pt-1">
              <div>
                <label className="block font-medium text-xs mb-1">Token ID *</label>
                <input
                  type="text"
                  value={tokenId}
                  onChange={(e) => setTokenId(e.target.value)}
                  placeholder="root@pam!vmaster"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-xs mb-1">Token Secret *</label>
                <input
                  type="password"
                  value={tokenSecret}
                  onChange={(e) => setTokenSecret(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-xs font-mono"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-xs mb-1">Користувач *</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="root"
                    className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-medium text-xs mb-1">Realm</label>
                  <input
                    type="text"
                    value={realm}
                    onChange={(e) => setRealm(e.target.value)}
                    placeholder="pam або pve"
                    className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-xs mb-1">Пароль *</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Введіть пароль"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          <div className="pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={verifySsl}
                onChange={(e) => setVerifySsl(e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-600 text-blue-600"
              />
              <span className="text-xs text-zinc-600 dark:text-zinc-400">
                Перевіряти валідність SSL сертифіката (вимкніть для самопідписаних)
              </span>
            </label>
          </div>

          {testResult && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                testResult.success
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                  : 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-700 dark:text-red-300'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-zinc-200 dark:border-zinc-700">
            <button
              type="button"
              disabled={testing || !host}
              onClick={handleTest}
              className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-600 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              {testing ? 'Перевірка...' : 'Перевірити з’єднання'}
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Скасувати
              </button>
              <button
                type="submit"
                disabled={saving || !host}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors disabled:opacity-50 shadow-xs"
              >
                {saving ? 'Збереження...' : 'Зберегти'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
