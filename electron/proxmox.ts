import axios, { AxiosInstance } from 'axios';
import https from 'https';
import type { ProxmoxServerConfig, ProxmoxNode, ProxmoxNodeService, ProxmoxAPTUpdate, ProxmoxVM, VMSnapshot, VMMetrics, ProxmoxRRDPoint, ProxmoxBackup } from '../src/types';

interface AuthTicket {
  ticket: string;
  csrfToken: string;
  expiresAt: number;
}

export class ProxmoxService {
  private clients: Map<string, AxiosInstance> = new Map();
  private tickets: Map<string, AuthTicket> = new Map();

  private getClient(config: ProxmoxServerConfig): AxiosInstance {
    const existing = this.clients.get(config.id);
    if (existing) {
      return existing;
    }

    const agent = new https.Agent({
      rejectUnauthorized: config.verifySsl ?? false,
    });

    const client = axios.create({
      baseURL: `https://${config.host}:${config.port}/api2/json`,
      httpsAgent: agent,
      timeout: 10000,
    });

    this.clients.set(config.id, client);
    return client;
  }

  public clearClient(serverId: string): void {
    this.clients.delete(serverId);
    this.tickets.delete(serverId);
  }

  private async getAuthHeaders(config: ProxmoxServerConfig): Promise<Record<string, string>> {
    if (config.authType === 'token') {
      if (!config.tokenId || !config.tokenSecret) {
        throw new Error('Proxmox API Token ID або Secret не вказано');
      }
      return {
        Authorization: `PVEAPIToken=${config.tokenId}=${config.tokenSecret}`,
      };
    }

    // Ticket Auth
    let ticketData = this.tickets.get(config.id);
    if (!ticketData || Date.now() > ticketData.expiresAt) {
      const client = this.getClient(config);
      const realm = config.realm || 'pam';
      const usernameWithRealm = config.username?.includes('@')
        ? config.username
        : `${config.username}@${realm}`;

      const res = await client.post('/access/ticket', {
        username: usernameWithRealm,
        password: config.password,
      });

      if (!res.data || !res.data.data) {
        throw new Error('Невдала спроба автентифікації в Proxmox');
      }

      const { ticket, CSRFPreventionToken } = res.data.data;
      ticketData = {
        ticket,
        csrfToken: CSRFPreventionToken,
        expiresAt: Date.now() + 7000 * 1000, // 2 hours
      };
      this.tickets.set(config.id, ticketData);
    }

    return {
      Cookie: `PVEAuthCookie=${ticketData.ticket}`,
      CSRFPreventionToken: ticketData.csrfToken,
    };
  }

  public async testConnection(config: ProxmoxServerConfig): Promise<{ success: boolean; version?: string; error?: string }> {
    try {
      const client = this.getClient(config);
      const headers = await this.getAuthHeaders(config);
      const res = await client.get('/version', { headers });
      return {
        success: true,
        version: res.data?.data?.release || res.data?.data?.version,
      };
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Помилка підключення';
      return { success: false, error: msg };
    }
  }

  public async getNodes(config: ProxmoxServerConfig): Promise<ProxmoxNode[]> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    const res = await client.get('/nodes', { headers });

    return (res.data?.data || []).map((n: any) => ({
      node: n.node,
      status: n.status === 'online' ? 'online' : 'offline',
      cpu: n.cpu,
      maxcpu: n.maxcpu,
      mem: n.mem,
      maxmem: n.maxmem,
      uptime: n.uptime,
    }));
  }

  public async getVMs(config: ProxmoxServerConfig, node: string): Promise<ProxmoxVM[]> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);

    // Fetch QEMU VMs
    let qemuVMs: any[] = [];
    try {
      const qemuRes = await client.get(`/nodes/${node}/qemu`, { headers });
      qemuVMs = qemuRes.data?.data || [];
    } catch (e) {
      console.warn('Failed to fetch QEMU VMs:', e);
    }

    // Fetch LXC containers
    let lxcCTs: any[] = [];
    try {
      const lxcRes = await client.get(`/nodes/${node}/lxc`, { headers });
      lxcCTs = lxcRes.data?.data || [];
    } catch (e) {
      console.warn('Failed to fetch LXC containers:', e);
    }

    // Process QEMU VMs
    const parsedQemu: ProxmoxVM[] = await Promise.all(
      qemuVMs.map(async (v: any) => {
        let ipAddresses: string[] = [];
        if (v.status === 'running') {
          try {
            const ifRes = await client.get(`/nodes/${node}/qemu/${v.vmid}/agent/network-get-interfaces`, {
              headers,
              timeout: 2000,
            });
            const ifaces = ifRes.data?.data?.result || [];
            for (const iface of ifaces) {
              if (iface['ip-addresses']) {
                for (const ip of iface['ip-addresses']) {
                  if (ip['ip-address-type'] === 'ipv4' && !ip['ip-address'].startsWith('127.')) {
                    ipAddresses.push(ip['ip-address']);
                  }
                }
              }
            }
          } catch {
            // Guest agent not running or no permissions
          }
        }

        return {
          vmid: v.vmid,
          name: v.name || `VM-${v.vmid}`,
          status: v.status as 'running' | 'stopped' | 'paused',
          node,
          type: 'qemu' as const,
          cpu: v.cpu,
          cpus: v.cpus,
          mem: v.mem,
          maxmem: v.maxmem,
          disk: v.disk,
          maxdisk: v.maxdisk,
          uptime: v.uptime,
          netin: v.netin,
          netout: v.netout,
          ipAddresses,
          freemem: v.freemem,
          ballooninfo: v.ballooninfo,
        };
      })
    );

    // Process LXC containers
    const parsedLxc: ProxmoxVM[] = await Promise.all(
      lxcCTs.map(async (c: any) => {
        let ipAddresses: string[] = [];
        if (c.status === 'running') {
          try {
            const ifRes = await client.get(`/nodes/${node}/lxc/${c.vmid}/interfaces`, {
              headers,
              timeout: 2000,
            });
            const ifaces = ifRes.data?.data || [];
            for (const iface of ifaces) {
              if (iface.inet && !iface.inet.startsWith('127.')) {
                const cleanIp = iface.inet.split('/')[0];
                if (cleanIp) ipAddresses.push(cleanIp);
              }
            }
          } catch {
            // Interfaces endpoint not accessible or permission denied
          }
        }

        return {
          vmid: c.vmid,
          name: c.name || `CT-${c.vmid}`,
          status: c.status as 'running' | 'stopped' | 'paused',
          node,
          type: 'lxc' as const,
          cpu: c.cpu,
          cpus: c.cpus,
          mem: c.mem,
          maxmem: c.maxmem,
          disk: c.disk,
          maxdisk: c.maxdisk,
          uptime: c.uptime,
          netin: c.netin,
          netout: c.netout,
          ipAddresses,
          freemem: c.freemem,
        };
      })
    );

    return [...parsedQemu, ...parsedLxc];
  }

  public async getVMMetrics(config: ProxmoxServerConfig, node: string, vmid: number, vmType: 'qemu' | 'lxc' = 'qemu'): Promise<VMMetrics> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    const res = await client.get(`/nodes/${node}/${vmType}/${vmid}/status/current`, { headers });
    const d = res.data?.data || {};

    return {
      cpu: d.cpu || 0,
      maxcpu: d.cpus || 1,
      mem: d.mem || 0,
      maxmem: d.maxmem || 1,
      disk: d.disk || 0,
      maxdisk: d.maxdisk || 1,
      netin: d.netin || 0,
      netout: d.netout || 0,
      timestamp: Date.now(),
      freemem: d.freemem,
      ballooninfo: d.ballooninfo,
    };
  }

  public async getRRDData(
    config: ProxmoxServerConfig,
    node: string,
    vmid: number,
    timeframe: 'hour' | 'day' | 'week' | 'month' | 'year' = 'hour',
    vmType: 'qemu' | 'lxc' = 'qemu'
  ): Promise<ProxmoxRRDPoint[]> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    try {
      const res = await client.get(`/nodes/${node}/${vmType}/${vmid}/rrddata`, {
        headers,
        params: { timeframe, cf: 'AVERAGE' },
      });
      return (res.data?.data || []).map((p: any) => ({
        time: p.time,
        cpu: p.cpu !== undefined ? p.cpu : 0,
        mem: p.mem !== undefined ? p.mem : 0,
        maxmem: p.maxmem !== undefined ? p.maxmem : 0,
        disk: p.disk !== undefined ? p.disk : 0,
        maxdisk: p.maxdisk !== undefined ? p.maxdisk : 0,
        netin: p.netin !== undefined ? p.netin : 0,
        netout: p.netout !== undefined ? p.netout : 0,
      }));
    } catch (err) {
      console.warn(`Failed to fetch RRD data for ${vmType}/${vmid}:`, err);
      return [];
    }
  }

  public async executeVMAction(
    config: ProxmoxServerConfig,
    node: string,
    vmid: number,
    action: 'start' | 'stop' | 'shutdown' | 'reboot' | 'suspend' | 'resume',
    vmType: 'qemu' | 'lxc' = 'qemu'
  ): Promise<{ success: boolean; taskId?: string }> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    const res = await client.post(`/nodes/${node}/${vmType}/${vmid}/status/${action}`, null, { headers });
    return {
      success: true,
      taskId: res.data?.data,
    };
  }

  public async getBackups(config: ProxmoxServerConfig, node: string, vmid: number): Promise<ProxmoxBackup[]> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    try {
      // 1. Get storages supporting backups on this node
      const storagesRes = await client.get(`/nodes/${node}/storage`, { headers });
      const storages = storagesRes.data?.data || [];
      const backupStorages = storages.filter((s: any) => s.content && s.content.includes('backup'));

      const backups: ProxmoxBackup[] = [];
      await Promise.all(
        backupStorages.map(async (st: any) => {
          try {
            const contentRes = await client.get(`/nodes/${node}/storage/${st.storage}/content`, {
              headers,
              params: { content: 'backup', vmid },
            });
            const items = contentRes.data?.data || [];
            for (const item of items) {
              if (Number(item.vmid) === Number(vmid)) {
                backups.push({
                  volid: item.volid,
                  size: item.size || 0,
                  ctime: item.ctime || 0,
                  format: item.format || '',
                  notes: item.notes || '',
                });
              }
            }
          } catch {
            // Storage content might fail if offline
          }
        })
      );

      // Sort newest first
      return backups.sort((a, b) => b.ctime - a.ctime);
    } catch (err) {
      console.warn(`Failed to fetch backups for VMID ${vmid}:`, err);
      return [];
    }
  }

  public async createBackup(
    config: ProxmoxServerConfig,
    node: string,
    vmid: number,
    mode: 'snapshot' | 'suspend' | 'stop' = 'snapshot',
    compress: 'zstd' | 'gzip' | 'lzo' | 'none' = 'zstd'
  ): Promise<{ success: boolean; taskId?: string }> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    const payload: any = {
      vmid,
      mode,
      compress,
    };
    const res = await client.post(`/nodes/${node}/vzdump`, payload, { headers });
    return { success: true, taskId: res.data?.data };
  }

  public async getSnapshots(config: ProxmoxServerConfig, node: string, vmid: number, vmType: 'qemu' | 'lxc' = 'qemu'): Promise<VMSnapshot[]> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    const res = await client.get(`/nodes/${node}/${vmType}/${vmid}/snapshot`, { headers });
    return (res.data?.data || [])
      .filter((s: any) => s.name !== 'current')
      .map((s: any) => ({
        name: s.name,
        snaptime: s.snaptime,
        description: s.description || '',
        parent: s.parent,
        vmstate: Boolean(s.vmstate),
      }));
  }

  public async createSnapshot(
    config: ProxmoxServerConfig,
    node: string,
    vmid: number,
    snapname: string,
    description?: string,
    vmstate?: boolean,
    vmType: 'qemu' | 'lxc' = 'qemu'
  ): Promise<{ success: boolean; taskId?: string }> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    const payload: any = { snapname, description };
    if (vmType === 'qemu') {
      payload.vmstate = vmstate ? 1 : 0;
    }
    const res = await client.post(
      `/nodes/${node}/${vmType}/${vmid}/snapshot`,
      payload,
      { headers }
    );
    return { success: true, taskId: res.data?.data };
  }

  public async rollbackSnapshot(
    config: ProxmoxServerConfig,
    node: string,
    vmid: number,
    snapname: string,
    vmType: 'qemu' | 'lxc' = 'qemu'
  ): Promise<{ success: boolean; taskId?: string }> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    const res = await client.post(`/nodes/${node}/${vmType}/${vmid}/snapshot/${snapname}/rollback`, null, { headers });
    return { success: true, taskId: res.data?.data };
  }

  public async deleteSnapshot(
    config: ProxmoxServerConfig,
    node: string,
    vmid: number,
    snapname: string,
    vmType: 'qemu' | 'lxc' = 'qemu'
  ): Promise<{ success: boolean; taskId?: string }> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    const res = await client.delete(`/nodes/${node}/${vmType}/${vmid}/snapshot/${snapname}`, { headers });
    return { success: true, taskId: res.data?.data };
  }

  public async getTermproxyTicket(
    config: ProxmoxServerConfig,
    node: string,
    vmid?: number,
    vmType: 'qemu' | 'lxc' = 'qemu'
  ): Promise<{ ticket: string; port: number; user: string }> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    const endpoint = vmid
      ? `/nodes/${node}/${vmType}/${vmid}/termproxy`
      : `/nodes/${node}/termproxy`;

    const res = await client.post(endpoint, null, { headers });
    const d = res.data?.data;
    return {
      ticket: d.ticket,
      port: d.port,
      user: d.user,
    };
  }

  public async getNodeStatus(
    config: ProxmoxServerConfig,
    node: string
  ): Promise<any> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    const res = await client.get(`/nodes/${node}/status`, { headers });
    return res.data?.data;
  }

  public async getNodeServices(
    config: ProxmoxServerConfig,
    node: string
  ): Promise<ProxmoxNodeService[]> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    const res = await client.get(`/nodes/${node}/services`, { headers });
    return (res.data?.data || []).map((s: any) => ({
      service: s.service,
      name: s.name || s.service,
      state: s.state || 'unknown',
      desc: s.desc || '',
    }));
  }

  public async restartNodeService(
    config: ProxmoxServerConfig,
    node: string,
    service: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = this.getClient(config);
      const headers = await this.getAuthHeaders(config);
      await client.post(`/nodes/${node}/services/${service}/restart`, null, { headers });
      return { success: true };
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Помилка перезапуску служби';
      return { success: false, error: msg };
    }
  }

  public async executeNodeAction(
    config: ProxmoxServerConfig,
    node: string,
    action: 'reboot' | 'shutdown'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = this.getClient(config);
      const headers = await this.getAuthHeaders(config);
      await client.post(`/nodes/${node}/status`, { command: action }, { headers });
      return { success: true };
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Помилка виконання дії вузла';
      return { success: false, error: msg };
    }
  }

  public async getNodeUpdates(
    config: ProxmoxServerConfig,
    node: string
  ): Promise<ProxmoxAPTUpdate[]> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    const res = await client.get(`/nodes/${node}/apt/update`, { headers });
    return (res.data?.data || []).map((u: any) => ({
      package: u.Package || u.package,
      title: u.Title || u.title || '',
      version: u.Version || u.version,
      oldVersion: u.OldVersion || u.oldVersion || '',
      description: u.Description || u.description || '',
      priority: u.Priority || u.priority || '',
      section: u.Section || u.section || '',
      arch: u.Arch || u.arch || '',
    }));
  }

  public async refreshNodeUpdates(
    config: ProxmoxServerConfig,
    node: string
  ): Promise<{ success: boolean; taskId?: string; error?: string }> {
    try {
      const client = this.getClient(config);
      const headers = await this.getAuthHeaders(config);
      const res = await client.post(`/nodes/${node}/apt/update`, null, { headers });
      return { success: true, taskId: res.data?.data };
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Помилка оновлення списку пакетів';
      return { success: false, error: msg };
    }
  }

  public async getNodeStorage(
    config: ProxmoxServerConfig,
    node: string
  ): Promise<any[]> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    const res = await client.get(`/nodes/${node}/storage`, { headers });
    return (res.data?.data || []).map((s: any) => ({
      storage: s.storage,
      type: s.type || 'unknown',
      content: s.content || '',
      active: Boolean(s.active),
      enabled: Boolean(s.enabled ?? true),
      shared: Boolean(s.shared),
      total: s.total || 0,
      used: s.used || 0,
      avail: s.avail || 0,
      usedFraction: s.used_fraction || (s.total ? s.used / s.total : 0),
    }));
  }

  public async getNodeDisks(
    config: ProxmoxServerConfig,
    node: string
  ): Promise<any[]> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    const res = await client.get(`/nodes/${node}/disks/list`, { headers });
    return (res.data?.data || []).map((d: any) => ({
      devpath: d.devpath || d.node || '',
      model: d.model || 'Unknown Disk',
      serial: d.serial || '',
      size: d.size || 0,
      type: d.type || 'unknown',
      health: d.health || 'UNKNOWN',
      wearout: d.wearout,
      temperature: d.temperature,
      rpm: d.rpm,
    }));
  }

  public async getNodeTasks(
    config: ProxmoxServerConfig,
    node: string,
    limit: number = 50
  ): Promise<any[]> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    const res = await client.get(`/nodes/${node}/tasks?limit=${limit}`, { headers });
    return (res.data?.data || []).map((t: any) => ({
      upid: t.upid,
      node: t.node,
      pid: t.pid,
      pstart: t.pstart,
      starttime: t.starttime,
      endtime: t.endtime,
      type: t.type,
      id: t.id,
      user: t.user,
      status: t.status,
    }));
  }

  public async getNodeTaskLog(
    config: ProxmoxServerConfig,
    node: string,
    upid: string
  ): Promise<string[]> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    const encodedUpid = encodeURIComponent(upid);
    const res = await client.get(`/nodes/${node}/tasks/${encodedUpid}/log?limit=500`, { headers });
    return (res.data?.data || []).map((l: any) => l.t || '');
  }

  public async getNodeNetworks(
    config: ProxmoxServerConfig,
    node: string
  ): Promise<any[]> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    const res = await client.get(`/nodes/${node}/network`, { headers });
    return (res.data?.data || []).map((n: any) => ({
      iface: n.iface,
      type: n.type || 'unknown',
      active: Boolean(n.active),
      autostart: Boolean(n.autostart),
      address: n.address,
      netmask: n.netmask,
      cidr: n.cidr,
      gateway: n.gateway,
      bridge_ports: n.bridge_ports,
      slaves: n.slaves,
      comments: n.comments,
    }));
  }

  public async createNodeNetwork(
    config: ProxmoxServerConfig,
    node: string,
    params: {
      iface: string;
      type: string;
      cidr?: string;
      gateway?: string;
      bridge_ports?: string;
      autostart?: boolean;
      comments?: string;
    }
  ): Promise<{ success: boolean; error?: string }> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    const payload: any = {
      iface: params.iface,
      type: params.type,
      autostart: params.autostart ? 1 : 0,
    };
    if (params.cidr) payload.cidr = params.cidr;
    if (params.gateway) payload.gateway = params.gateway;
    if (params.bridge_ports) payload.bridge_ports = params.bridge_ports;
    if (params.comments) payload.comments = params.comments;

    await client.post(`/nodes/${node}/network`, payload, { headers });
    return { success: true };
  }

  public async updateNodeNetwork(
    config: ProxmoxServerConfig,
    node: string,
    iface: string,
    params: {
      cidr?: string;
      gateway?: string;
      bridge_ports?: string;
      autostart?: boolean;
      comments?: string;
    }
  ): Promise<{ success: boolean; error?: string }> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    const payload: any = {};
    if (params.autostart !== undefined) payload.autostart = params.autostart ? 1 : 0;
    if (params.cidr !== undefined) payload.cidr = params.cidr;
    if (params.gateway !== undefined) payload.gateway = params.gateway;
    if (params.bridge_ports !== undefined) payload.bridge_ports = params.bridge_ports;
    if (params.comments !== undefined) payload.comments = params.comments;

    await client.put(`/nodes/${node}/network/${encodeURIComponent(iface)}`, payload, { headers });
    return { success: true };
  }

  public async deleteNodeNetwork(
    config: ProxmoxServerConfig,
    node: string,
    iface: string
  ): Promise<{ success: boolean; error?: string }> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    await client.delete(`/nodes/${node}/network/${encodeURIComponent(iface)}`, { headers });
    return { success: true };
  }

  public async applyNodeNetworkChanges(
    config: ProxmoxServerConfig,
    node: string
  ): Promise<{ success: boolean; taskId?: string; error?: string }> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    const res = await client.put(`/nodes/${node}/network`, null, { headers });
    return { success: true, taskId: res.data?.data };
  }

  public async revertNodeNetworkChanges(
    config: ProxmoxServerConfig,
    node: string
  ): Promise<{ success: boolean; error?: string }> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    await client.delete(`/nodes/${node}/network`, { headers });
    return { success: true };
  }

  public async createStorage(
    config: ProxmoxServerConfig,
    params: {
      storage: string;
      type: 'dir' | 'nfs' | 'lvmthin' | 'zfspool';
      content?: string;
      path?: string;
      server?: string;
      export?: string;
      pool?: string;
      thinpool?: string;
      vgname?: string;
    }
  ): Promise<{ success: boolean; error?: string }> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    const payload: any = {
      storage: params.storage,
      type: params.type,
    };
    if (params.content) payload.content = params.content;
    if (params.path) payload.path = params.path;
    if (params.server) payload.server = params.server;
    if (params.export) payload.export = params.export;
    if (params.pool) payload.pool = params.pool;
    if (params.thinpool) payload.thinpool = params.thinpool;
    if (params.vgname) payload.vgname = params.vgname;

    await client.post(`/storage`, payload, { headers });
    return { success: true };
  }

  public async deleteStorage(
    config: ProxmoxServerConfig,
    storageId: string
  ): Promise<{ success: boolean; error?: string }> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    await client.delete(`/storage/${encodeURIComponent(storageId)}`, { headers });
    return { success: true };
  }

  public async initGptDisk(
    config: ProxmoxServerConfig,
    node: string,
    disk: string
  ): Promise<{ success: boolean; taskId?: string; error?: string }> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    const res = await client.post(`/nodes/${node}/disks/initgpt`, { disk }, { headers });
    return { success: true, taskId: res.data?.data };
  }

  public async wipeDisk(
    config: ProxmoxServerConfig,
    node: string,
    disk: string
  ): Promise<{ success: boolean; taskId?: string; error?: string }> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    const res = await client.put(`/nodes/${node}/disks/wipedisk`, { disk }, { headers });
    return { success: true, taskId: res.data?.data };
  }

  public async getNextVMID(
    config: ProxmoxServerConfig
  ): Promise<number> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    const res = await client.get('/cluster/nextid', { headers });
    return Number(res.data?.data) || 100;
  }

  public async createVM(
    config: ProxmoxServerConfig,
    node: string,
    params: {
      vmid: number;
      name: string;
      cores?: number;
      memory?: number; // MB
      diskSize?: number; // GB
      storage?: string;
      bridge?: string;
      iso?: string;
      startAfterCreate?: boolean;
    }
  ): Promise<{ success: boolean; taskId?: string; error?: string }> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    const payload: any = {
      vmid: params.vmid,
      name: params.name,
      cores: params.cores || 2,
      sockets: 1,
      memory: params.memory || 2048,
      net0: `virtio,bridge=${params.bridge || 'vmbr0'}`,
    };

    if (params.storage) {
      const diskGb = params.diskSize || 32;
      payload.scsihw = 'virtio-scsi-pci';
      payload.scsi0 = `${params.storage}:${diskGb},discard=on,ssd=1`;
      payload.boot = 'order=scsi0;ide2;net0';
    }

    if (params.iso) {
      payload.ide2 = `${params.iso},media=cdrom`;
    }

    if (params.startAfterCreate) {
      payload.start = 1;
    }

    const res = await client.post(`/nodes/${node}/qemu`, payload, { headers });
    return { success: true, taskId: res.data?.data };
  }

  public async getNodeSyslog(
    config: ProxmoxServerConfig,
    node: string,
    limit: number = 200
  ): Promise<any[]> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    const res = await client.get(`/nodes/${node}/syslog?limit=${limit}`, { headers });
    return (res.data?.data || []).map((l: any) => ({
      n: l.n || 0,
      t: l.t || '',
    }));
  }
}
