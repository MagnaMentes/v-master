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
  - Interactive live preview of terminal color palettes (Dark, Light, Dracula, Monokai) and font sizing directly in Settings.
  - Profile-based auto-connect, macOS Keychain `ssh-agent` integration, and private SSH key authentication (`~/.ssh/id_rsa`, `id_ed25519`).
  - Secure sudo password storage in macOS Keychain with an automatic prompt right after a successful connection test.
  - Customizable snippet library for 1-click command execution.

- **Proxmox LXC Container Management**:
  - First-class support for both KVM/QEMU VMs and lightweight Linux Containers (LXC).
  - Distinct visual badges (**`VM`** in blue and **`CT`** in purple).
  - Snapshotting, power actions, and console access for containers.

- **Historical Performance Graphs (Proxmox RRD Metrics)**:
  - Interactive SVG performance charts for CPU utilization (%) and memory consumption (RAM).
  - Timeframe presets: **1 hour**, **24 hours**, and **7 days**.

- **Proxmox VZDump Backup Management**:
  - View and manage existing backups for every VM and container across cluster storages.
  - On-demand backup creation with custom modes (*Snapshot*, *Suspend*, *Stop*) and compression (*ZSTD*, *GZIP*, *None*).

- **In-Guest Docker Container Monitoring**:
  - Inspect running and stopped Docker containers with image names, port bindings, and health statuses.
  - Restart individual containers with root/sudo support.
  - Live streaming of container logs in-app without terminal overhead.

- **Enhanced SFTP Manager**:
  - Drag-and-Drop file uploads with a visual drop-zone overlay.
  - **Live Tail** polling mode in the built-in file editor for continuous log watching.

- **SSH Bastion / Jump Host & Auto-Reconnect**:
  - Secure SSH tunneling to private-network servers via intermediate bastion hosts.
  - Automatic terminal reconnection countdown (5 seconds) with manual cancel support upon connection drop.

- **Cross-Platform Support (macOS & Windows)**:
  - Native window title bar handling (`hiddenInset` for macOS with traffic lights, native frameless header for Windows).
  - Windows OpenSSH Agent pipe support (`\\.\pipe\openssh-ssh-agent`).
  - Windows NSIS installer and portable ZIP targets for x64.

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
