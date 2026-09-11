import axios, { AxiosInstance } from 'axios';
import https from 'https';
import type { ProxmoxServerConfig, ProxmoxNode, ProxmoxNodeService, ProxmoxAPTUpdate, ProxmoxVM, VMSnapshot, VMMetrics } from '../src/types';

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
    const qemuRes = await client.get(`/nodes/${node}/qemu`, { headers });
    const qemuVMs = qemuRes.data?.data || [];

    // Also attempt to get IP addresses via QEMU guest agent if running
    const vms: ProxmoxVM[] = await Promise.all(
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
            // Guest agent not running or no permissions, safe to ignore
          }
        }

        return {
          vmid: v.vmid,
          name: v.name || `VM-${v.vmid}`,
          status: v.status as 'running' | 'stopped' | 'paused',
          node,
          type: 'qemu',
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

    return vms;
  }

  public async getVMMetrics(config: ProxmoxServerConfig, node: string, vmid: number): Promise<VMMetrics> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    const res = await client.get(`/nodes/${node}/qemu/${vmid}/status/current`, { headers });
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

  public async executeVMAction(
    config: ProxmoxServerConfig,
    node: string,
    vmid: number,
    action: 'start' | 'stop' | 'shutdown' | 'reboot' | 'suspend' | 'resume'
  ): Promise<{ success: boolean; taskId?: string }> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    const res = await client.post(`/nodes/${node}/qemu/${vmid}/status/${action}`, null, { headers });
    return {
      success: true,
      taskId: res.data?.data,
    };
  }

  public async getSnapshots(config: ProxmoxServerConfig, node: string, vmid: number): Promise<VMSnapshot[]> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    const res = await client.get(`/nodes/${node}/qemu/${vmid}/snapshot`, { headers });
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
    vmstate?: boolean
  ): Promise<{ success: boolean; taskId?: string }> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    const res = await client.post(
      `/nodes/${node}/qemu/${vmid}/snapshot`,
      { snapname, description, vmstate: vmstate ? 1 : 0 },
      { headers }
    );
    return { success: true, taskId: res.data?.data };
  }

  public async rollbackSnapshot(
    config: ProxmoxServerConfig,
    node: string,
    vmid: number,
    snapname: string
  ): Promise<{ success: boolean; taskId?: string }> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    const res = await client.post(`/nodes/${node}/qemu/${vmid}/snapshot/${snapname}/rollback`, null, { headers });
    return { success: true, taskId: res.data?.data };
  }

  public async deleteSnapshot(
    config: ProxmoxServerConfig,
    node: string,
    vmid: number,
    snapname: string
  ): Promise<{ success: boolean; taskId?: string }> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    const res = await client.delete(`/nodes/${node}/qemu/${vmid}/snapshot/${snapname}`, { headers });
    return { success: true, taskId: res.data?.data };
  }

  public async getTermproxyTicket(
    config: ProxmoxServerConfig,
    node: string,
    vmid?: number
  ): Promise<{ ticket: string; port: number; user: string }> {
    const client = this.getClient(config);
    const headers = await this.getAuthHeaders(config);
    const endpoint = vmid
      ? `/nodes/${node}/qemu/${vmid}/termproxy`
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
}
