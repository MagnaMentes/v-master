# V-Master

<p align="left">
  <a href="README.md">🇺🇦 Українська</a> •
  <b>🇬🇧 English</b>
</p>

**V-Master** is a native desktop client for macOS (Apple Silicon) designed for centralized monitoring of **Proxmox Virtual Environment** clusters and daily administration of **Ubuntu / Debian Linux** virtual machines.

The application combines hypervisor API capabilities with an integrated sysadmin toolkit: an embedded SSH terminal, a dual-pane SFTP manager, system process analytics, and safe batch package updating routines.

---

## Key Features

- **Proxmox VE Cluster & Node Management**:
  - Real-time monitoring of host status, CPU load, RAM consumption, and storage metrics.
  - VM lifecycle operations (Start, Stop, Shutdown, Reboot, Suspend, Resume).
  - Snapshot creation, rollback, and deletion with optional RAM state retention.
  - Inspection and restarts of Proxmox node services (`pve-cluster`, `pvedaemon`, `pveproxy`, etc.).

- **Embedded SSH Terminal**:
  - Instant connections using saved host profiles.
  - Authentication via passwords or private SSH keys (`~/.ssh/id_rsa`, `id_ed25519`).
  - Snippet library for one-click execution of recurring operational commands.

- **Dual-Pane Graphic SFTP Manager**:
  - Seamless remote file system browsing.
  - Fast upload, download, renaming, and safe deletion of files and directories.

- **VM Diagnostics & Service Maintenance**:
  - Live ranking of top CPU and memory-consuming processes.
  - Process termination (`kill`, `SIGKILL`), `systemd` service management, and Linux page cache flushing (`drop_caches`).

- **Safe VM OS Updates**:
  - Classification into critical security updates vs. standard packages.
  - Single-session batch installation with post-reconnect verification, avoiding dropped connections and Fail2ban lockouts during core package (`libc-bin`, `sshd`) upgrades.

- **Built-in Automatic Updates**:
  - Automated background checks for new GitHub releases.
  - In-app "What's New" release notes modal on both notification and initial launch of upgraded versions.

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
