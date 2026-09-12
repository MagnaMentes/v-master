# V-Master

<p align="left">
  <a href="README.md">🇺🇦 Українська</a> •
  <b>🇬🇧 English</b>
</p>

**V-Master** is a native desktop client for macOS (Apple Silicon) designed for centralized monitoring of **Proxmox Virtual Environment** clusters and daily administration of **Ubuntu / Debian Linux** virtual machines.

The application combines hypervisor API capabilities with an integrated sysadmin toolkit: an embedded SSH terminal, a dual-pane SFTP manager, system process analytics, and safe batch package updating routines.

---

## Key Features

- **Global Spotlight Command Palette**:
  - Instant activation via **`⌘ + K`** or **`⌘ + P`** from any application view.
  - Swift navigation between tabs (Dashboard, Nodes, SFTP, Settings).
  - Search and jump directly to virtual machines by name or VMID.
  - Immediate execution of power actions (Start, Stop, Reboot), opening terminal sessions, and launching in-depth diagnostics without redundant clicks.

- **Multi-Tab SSH Terminal**:
  - Simultaneous management of multiple interactive terminal sessions.
  - Native keyboard shortcuts: **`⌘ + T`** (new tab), **`⌘ + W`** (close tab), **`⌘ + 1..9`** (fast tab switching).
  - Live connection status indicators and unread activity badges.
  - Profile-based auto-connect, macOS Keychain `ssh-agent` integration, and private SSH key authentication (`~/.ssh/id_rsa`, `id_ed25519`).
  - Customizable snippet library for 1-click command execution.

- **Proxmox VE Cluster & Batch VM Operations**:
  - Real-time monitoring of host status, CPU load, RAM consumption, and storage metrics across all cluster nodes.
  - Multi-select VM checkboxes and bottom Floating Action Bar for batch Start, Stop, Reboot, and OS package updates.
  - Node systemd services management (`pve-cluster`, `pvedaemon`, `pveproxy`, etc.).
  - Snapshot creation, rollback, and deletion with optional RAM state retention.

- **Safe OS Updates with Pre-Update Safety Snapshots**:
  - Automatic pre-update safety snapshot creation before running package upgrades.
  - One-click rollback button if updates cause issues or service regressions.
  - Classification into critical security updates vs. standard packages.
  - Isolated single-session execution to prevent dropped connections or Fail2ban lockouts during core package upgrades (`libc-bin`, `sshd`).

- **Deep System Diagnostics & Live Journalctl Viewer**:
  - Interactive systemd `journalctl` log viewer with priority filters (*All*, *Errors*, *Warnings*), unit filtering (`ssh`, `nginx`, `docker`), and real-time substring search.
  - Real-time top CPU and memory-consuming process analytics.
  - Process termination (`kill`, `SIGKILL`), systemd service management, and Linux page cache flushing (`drop_caches`).

- **Dual-Pane Graphic SFTP Manager with In-App Editor**:
  - Seamless remote file system exploration.
  - Fast upload, download, renaming, and safe deletion of files and directories.
  - Fullscreen in-app text and configuration editor with line numbers, syntax styling, and remote saving via **`⌘ + S`** (`Ctrl + S`).

- **Native macOS Notification Center Integration**:
  - Native desktop notifications for unexpected VM power drops or crashes (`running` -> `stopped`).
  - Completion alerts for lengthy batch package update workflows.

- **Design & Seamless In-App Updates**:
  - macOS Vibrancy theme support (System / Dark / Light).
  - Background updates via GitHub Releases with detailed "What's New" release notes.

---

## Installation (macOS)

### System Requirements
- macOS 12.0 (Monterey) or later.
- Architecture: **Apple Silicon (M1 / M2 / M3 / M4)**.

### Getting Started

1. Go to the latest release page:  
   👉 **[Download V-Master](https://github.com/MagnaMentes/v-master/releases/latest)**

2. Download `V-Master-X.X.X-arm64-mac.zip`.

3. Unzip the file and move `V-Master.app` into your **Applications** folder (`/Applications`).

> **First Launch on macOS:**  
> Since V-Master is an open-source non-commercial project distributed without an Apple Developer ID signature, macOS Gatekeeper may prompt that the developer cannot be verified.  
> 
> To launch without issues:
> - Right-click (or `Control + click`) on `V-Master.app` in `/Applications` and select **Open**, then confirm.  
> - Alternatively, clear the quarantine attribute via Terminal:
>   ```bash
>   xattr -cr /Applications/V-Master.app
>   ```

---

## Free Status & Project Support

**V-Master is 100% free and open-source software**. There are no paid tiers, subscriptions, telemetry, or artificial limits on the number of nodes or VMs you can manage.

The project is actively developed and maintained to streamline routine server management and homelab workflows.

If V-Master saves you time and you would like to support its ongoing development:

☕ **[Support V-Master (Monobank Jar)](https://send.monobank.ua/jar/6s5yE12CxH)**

You can also donate directly within the application by clicking the heart button in the lower-left corner of the sidebar. Every contribution is deeply appreciated!

---

## Building from Source (Developers)

```bash
# Clone the repository
git clone https://github.com/MagnaMentes/v-master.git
cd v-master

# Install dependencies
npm install

# Run in development mode (Vite + Electron live reload)
npm run dev

# Build distributable bundle for macOS (Apple Silicon)
npm run package
```

---

## License

This project is released under the [MIT](LICENSE) License.
