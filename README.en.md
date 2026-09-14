# V-Master

<p align="left">
  <a href="README.md">🇺🇦 Українська</a> •
  <b>🇬🇧 English</b>
</p>

**V-Master** is a fast and convenient desktop client for **macOS** and **Windows**, designed for monitoring **Proxmox Virtual Environment** clusters and daily administration of **Linux (Ubuntu / Debian)** virtual machines and containers.

The application combines all essential sysadmin tools in a single workspace: hypervisor web APIs, a multi-tab SSH terminal, a dual-pane SFTP manager, in-guest Docker container monitoring, and safe automated OS package updates.

---

## Key Features

### 🖥️ Proxmox VE Virtual Machine & Container Management
- **Full Support for KVM/QEMU & LXC**: manage virtual machines (`VM`) and lightweight Linux containers (`CT`) with distinct color-coded badges for instant recognition.
- **Power Operations**: start, gracefully shutdown, force stop, or reboot single or multiple VMs simultaneously via the batch Floating Action Bar.
- **Snapshots**: create instant snapshots (with optional RAM retention), rollback, or delete them in seconds.
- **Backup Management (VZDump)**: inspect existing backups across cluster storages and create new backups on-demand (modes: *Snapshot*, *Suspend*, *Stop*; compression: *ZSTD*, *GZIP*, or none).
- **Interactive Historical Metrics (RRD)**: visual performance charts for CPU utilization (%) and RAM consumption over the last **1 hour**, **24 hours**, or **7 days** with average, peak, and live readings, coordinate reference scale, hover inspection cursor, and seamless smooth interval switching without resetting VM page state.
- **Comprehensive Node Administration (PVE Hosts)**: complete dedicated management dashboard for each cluster node featuring real-time CPU utilization (actual percentage, color-coded progress bar, 1/5/15 min Load Average, core specs), storage pool monitoring (ZFS, LVM-Thin, NFS, CIFS), physical disk diagnostics with **SMART (PASSED/FAILED)** health, temperatures, and wearout metrics, network bridges & interfaces (`vmbr0`, bond, VLAN), real-time host **Syslog** with error filtering, live cluster task history with detailed terminal logs, alongside systemd service management (`pve-cluster`, `pvedaemon`, `pveproxy`) and node APT package updates.
- **Window Geometry Persistence**: seamlessly saves and restores custom window dimensions, screen position, and maximized state across restarts and app updates.

### ⚡ Global Spotlight Command Palette
- Triggered instantly via **`⌘ + K`** / **`⌘ + P`** on macOS and **`Ctrl + K`** / **`Ctrl + P`** on Windows.
- Real-time search across all virtual machines and containers by name or VMID.
- Instant navigation between app sections and fast power actions without clicking through nested menus.

### 💻 Embedded Multi-Tab SSH Terminal
- **Multi-tasking**: open multiple concurrent sessions in clean tabs (**`⌘ + T`** / **`Ctrl + T`** — new tab, **`⌘ + W`** / **`Ctrl + W`** — close).
- **Authentication**: connect via password or private keys (`id_ed25519`, `id_rsa`), with automatic integration with system `ssh-agent` (macOS Keychain and Windows OpenSSH Agent).
- **SSH Bastion / Jump Host**: securely tunnel connections to isolated servers via an intermediate bastion node.
- **Terminal Auto-Reconnect**: automatic 5-second countdown and reconnection attempt if the network drops unexpectedly.
- **Encrypted Sudo Password**: securely stores your sudo password in your operating system keychain to eliminate repetitive password prompts.
- **Command Snippets**: 1-click execution of handy diagnostic commands (disk usage, memory, listening ports, Docker).
- **Themes & Sizing**: custom palettes (Dark, Light, Dracula, Monokai) and customizable font sizes.

### 📁 Dual-Pane Graphic SFTP Manager
- Remote file system exploration with upload and download capabilities.
- Direct desktop file upload via **Drag-and-Drop** with drop-zone highlight.
- Built-in fullscreen text and configuration editor with code highlighting and instant saving via **`⌘ + S`** (**`Ctrl + S`**).
- **Live Tail Mode**: watch remote log files update in real-time.

### 🐳 Docker & Deep System Diagnostics
- **Docker Monitoring**: live view of running and stopped containers with image names, port bindings, and statuses.
- **Container Control**: restart individual containers and stream live container logs directly in-app.
- **Live Journalctl**: real-time continuous streaming of systemd `journalctl` logs with severity filters (*All*, *Errors*, *Warnings*) and substring search.
- **Process Analytics**: inspect top CPU and memory-consuming processes, terminate rogue tasks (`kill`), and flush OS disk cache (`drop_caches`).

### 🛡️ Safe OS Package Updates (Safety Snapshots)
- Automatically takes a safety snapshot before applying OS packages.
- One-click rollback button to immediately revert VM state if updates cause regressions.
- Transparent classification of updates into security advisories vs. regular package upgrades.

---

## Installation

### macOS
1. Open the latest release page: 👉 **[Download V-Master](https://github.com/MagnaMentes/v-master/releases/latest)**.
2. Download `V-Master-X.X.X-arm64-mac.zip`.
3. Extract the archive and drag `V-Master.app` into your **Applications** folder (`/Applications`).

> **Note for First Launch on macOS:**  
> V-Master is an open-source non-commercial project distributed without a paid Apple Developer ID signature. On first launch, macOS Gatekeeper may show a warning about an unverified developer.  
> 
> **How to open:**
> - Right-click (or `Control + click`) `V-Master.app` in `/Applications`, select **Open**, and confirm.  
> - Or remove the quarantine attribute with a single Terminal command:
>   ```bash
>   xattr -c /Applications/V-Master.app
>   ```

### Windows
1. Download the Windows installer package from the **[Latest Release](https://github.com/MagnaMentes/v-master/releases/latest)**.
2. Run the installer and follow the setup wizard (it will automatically create desktop and start menu shortcuts).

---

## Supporting the Project

**V-Master is 100% free and open-source software**. There are no paid tiers, subscriptions, tracking, or artificial limitations on the number of servers you can connect.

If V-Master saves you time and proves helpful in your daily workflow:

☕ **[Support V-Master (Monobank Jar)](https://send.monobank.ua/jar/6s5yE12CxH)**

You can also donate directly inside the app by clicking the support button at the bottom of the sidebar. Thank you for your support!

---

## Building from Source

```bash
# Clone the repository
git clone https://github.com/MagnaMentes/v-master.git
cd v-master

# Install dependencies
npm install

# Start development mode
npm run dev

# Build installer bundle for macOS
npm run package

# Build installer bundle for Windows
npm run package:win
```

---

## License

This project is released under the open-source [MIT](LICENSE) License.
