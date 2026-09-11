import React, { useState } from 'react';
import { X, Key, FolderOpen, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import type { SSHProfile } from '../types';

interface SSHProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (profile: SSHProfile) => Promise<void>;
  initialProfile?: SSHProfile | null;
  defaultVmid?: number;
  defaultHost?: string;
}

export const SSHProfileModal: React.FC<SSHProfileModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialProfile,
  defaultVmid,
  defaultHost,
}) => {
  const [name, setName] = useState(initialProfile?.name || (defaultVmid ? `VM-${defaultVmid} SSH` : 'Нове підключення'));
  const [host, setHost] = useState(initialProfile?.host || defaultHost || '');
  const [port, setPort] = useState(initialProfile?.port || 22);
  const [username, setUsername] = useState(initialProfile?.username || '');
  const [authType, setAuthType] = useState<'password' | 'privateKey'>(initialProfile?.authType || 'privateKey');
  const [password, setPassword] = useState(initialProfile?.password || '');
  const [privateKeyPath, setPrivateKeyPath] = useState(initialProfile?.privateKeyPath || '~/.ssh/id_ed25519');
  const [privateKeyPassphrase, setPrivateKeyPassphrase] = useState(initialProfile?.privateKeyPassphrase || '');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setName(initialProfile?.name || (defaultVmid ? `VM-${defaultVmid} SSH` : 'Нове підключення'));
      setHost(initialProfile?.host || defaultHost || '');
      setPort(initialProfile?.port || 22);
      setUsername(initialProfile?.username || '');
      setAuthType(initialProfile?.authType || 'privateKey');
      setPassword(initialProfile?.password || '');
      setPrivateKeyPath(initialProfile?.privateKeyPath || '~/.ssh/id_ed25519');
      setPrivateKeyPassphrase(initialProfile?.privateKeyPassphrase || '');
      setTestResult(null);
    }
  }, [isOpen, initialProfile, defaultVmid, defaultHost]);

  React.useEffect(() => {
    if (isOpen && !initialProfile?.username && window.api?.ssh?.getSystemDefaults) {
      window.api.ssh.getSystemDefaults(host || defaultHost).then((defaults) => {
        if (defaults.username && !username) {
          setUsername(defaults.username);
        }
        if (defaults.privateKeyPath && !initialProfile?.privateKeyPath) {
          setPrivateKeyPath(defaults.privateKeyPath);
        }
      }).catch(() => {});
    }
  }, [isOpen, host, defaultHost, initialProfile]);

  if (!isOpen) return null;

  const handleSelectKeyFile = async () => {
    if (window.api?.sftp?.selectLocalFile) {
      const selected = await window.api.sftp.selectLocalFile();
      if (selected) {
        setPrivateKeyPath(selected);
      }
    }
  };

  const handleTest = async () => {
    if (!host || !username) {
      setTestResult({
        success: false,
        message: 'Вкажіть хост та імʼя користувача для перевірки зʼєднання.',
      });
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const profile: SSHProfile = {
        id: initialProfile?.id || `temp-${Date.now()}`,
        name: name || host,
        host,
        port: Number(port),
        username,
        authType,
        password,
        privateKeyPath,
        privateKeyPassphrase,
        vmid: defaultVmid || initialProfile?.vmid,
      };

      if (!window.api?.ssh?.testConnection) {
        setTestResult({
          success: false,
          message: 'API перевірки SSH недоступне.',
        });
        return;
      }

      const res = await window.api.ssh.testConnection(profile);
      if (res.success) {
        setTestResult({
          success: true,
          message: 'SSH-зʼєднання успішно встановлено!',
        });
      } else {
        setTestResult({
          success: false,
          message: res.error || 'Не вдалося підключитися через SSH',
        });
      }
    } catch (e: any) {
      setTestResult({
        success: false,
        message: e.message || 'Помилка виконання перевірки',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!host || !username) return;

    setSaving(true);
    try {
      const profile: SSHProfile = {
        id: initialProfile?.id || `ssh-${Date.now()}`,
        name,
        host,
        port: Number(port),
        username,
        authType,
        password,
        privateKeyPath,
        privateKeyPassphrase,
        vmid: defaultVmid || initialProfile?.vmid,
      };

      await onSave(profile);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs backdrop-animate">
      <div className="w-full max-w-md bg-white dark:bg-[#252528] rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden text-zinc-800 dark:text-zinc-100 modal-animate">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center gap-2 font-semibold">
            <Key className="w-5 h-5 text-amber-500" />
            <span>{initialProfile ? 'Редагувати SSH профіль' : 'Налаштувати SSH підключення'}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-sm">
          <div>
            <label className="block font-medium text-xs mb-1">Назва профілю</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ubuntu Server SSH"
              className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="block font-medium text-xs">Хост / IP адреса *</label>
                {defaultHost && host !== defaultHost && (
                  <button
                    type="button"
                    onClick={() => setHost(defaultHost)}
                    className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-medium"
                  >
                    Взяти IP ВМ ({defaultHost})
                  </button>
                )}
              </div>
              <input
                type="text"
                required
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="192.168.1.150"
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-mono text-xs"
              />
            </div>
            <div>
              <label className="block font-medium text-xs mb-1">Порт</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                placeholder="22"
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-mono text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-xs mb-1">Користувач Ubuntu *</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ubuntu або root"
              className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-mono text-xs"
            />
          </div>

          <div>
            <label className="block font-medium text-xs mb-1">Метод автентифікації</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAuthType('privateKey')}
                className={`py-1.5 px-3 rounded-lg border text-xs font-medium transition-colors ${
                  authType === 'privateKey'
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-500 text-amber-600 dark:text-amber-400'
                    : 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                Приватний SSH ключ
              </button>
              <button
                type="button"
                onClick={() => setAuthType('password')}
                className={`py-1.5 px-3 rounded-lg border text-xs font-medium transition-colors ${
                  authType === 'password'
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-500 text-amber-600 dark:text-amber-400'
                    : 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                Пароль
              </button>
            </div>
          </div>

          {authType === 'privateKey' ? (
            <div className="space-y-3">
              <div>
                <label className="block font-medium text-xs mb-1">Шлях до приватного ключа *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={privateKeyPath}
                    onChange={(e) => setPrivateKeyPath(e.target.value)}
                    placeholder="~/.ssh/id_ed25519"
                    className="flex-1 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleSelectKeyFile}
                    title="Вибрати файл ключа"
                    className="p-2 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <FolderOpen className="w-4 h-4 text-zinc-600 dark:text-zinc-300" />
                  </button>
                </div>
              </div>
              <div>
                <label className="block font-medium text-xs mb-1">Passphrase ключа (якщо є)</label>
                <input
                  type="password"
                  value={privateKeyPassphrase}
                  onChange={(e) => setPrivateKeyPassphrase(e.target.value)}
                  placeholder="Опціонально"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-xs"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block font-medium text-xs mb-1">Пароль облікового запису *</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Введіть пароль"
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-xs"
              />
            </div>
          )}

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
              disabled={testing || !host || !username}
              onClick={handleTest}
              className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-600 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              {testing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-500" />
                  <span>Перевірка...</span>
                </>
              ) : (
                <span>Перевірити зʼєднання</span>
              )}
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Скасувати
              </button>
              <button
                type="submit"
                disabled={saving || !host || !username}
                className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium transition-colors disabled:opacity-50 shadow-xs cursor-pointer"
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
