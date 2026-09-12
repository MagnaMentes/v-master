import React, { useState, useEffect } from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import { AppProvider, useApp } from './contexts/AppContext';
import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { VMDetailView } from './components/VMDetailView';
import { TerminalView } from './components/TerminalView';
import { SFTPView } from './components/SFTPView';
import { SnippetsView } from './components/SnippetsView';
import { SettingsView } from './components/SettingsView';
import { AppUpdateToast } from './components/AppUpdateToast';
import { CommandPalette } from './components/CommandPalette';

const MainContent: React.FC = () => {
  const { activeView, selectedVM } = useApp();

  return (
    <main className="flex-1 flex overflow-hidden">
      <div key={activeView} className="flex-1 flex overflow-hidden view-animate">
        {activeView === 'dashboard' && <DashboardView />}
        {activeView === 'vm-detail' && selectedVM && <VMDetailView key={selectedVM.vmid} />}
        {activeView === 'terminal' && <TerminalView />}
        {activeView === 'sftp' && <SFTPView />}
        {activeView === 'snippets' && <SnippetsView />}
        {activeView === 'settings' && <SettingsView />}
      </div>
    </main>
  );
};

const AppLayout: React.FC = () => {
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K or Cmd+P or Ctrl+K/P to open Command Palette
      if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 'k' || e.key.toLowerCase() === 'p')) {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden antialiased bg-[#F6F6F6] dark:bg-[#18181B] text-zinc-800 dark:text-zinc-100 transition-colors duration-200">
      <TitleBar />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <MainContent />
      </div>
      <AppUpdateToast />
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AppProvider>
        <AppLayout />
      </AppProvider>
    </ThemeProvider>
  );
};

export default App;
