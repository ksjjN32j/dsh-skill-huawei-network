# 排障方法论（企业网 + 华为设备）

> 来源：脱敏实战报告《WiFi路由器IPv4故障定位与修复报告》+ 官方文档维护章节。原则：**分层二分，先定位层再动设备**。

## 1 分层二分流程（终端侧发起）

1. **同网段横比**：找一台同网段正常设备对比 → 单机问题查本机（网卡/驱动/防火墙 `nft list ruleset`/代理变量 `env | grep -i proxy`），全网问题查网络设备。
2. **二层**：`arping <网关>` / `ip neighbor show` —— ARP 能解析 = 二层转发正常，故障在三层及以上；ARP 都不可达再查 VLAN/PVID/STP 阻塞（`display port vlan`、`display stp brief`）。
3. **三层**：`ping -4 网关` → `ping 公网IP`（跳过 DNS 干扰）→ `mtr` 看断在哪跳（首跳不通=网关故障；中间跳超时可能是运营商限速，看后续跳是否恢复）。
4. **服务层**：DHCP（`nmcli device show`/`journalctl -u NetworkManager | grep -i dhcp`）、DNS（`resolvectl status`）、TCP（`nc -zv <ip> <port>`）。
5. **设备侧对应命令**：`display ip interface brief`、`display ip routing-table`、`display arp`、`display ip pool`、`display dhcp server ip-in-use`、`display nat resource usage`。

## 2 特色指纹：v4 挂了、v6 正常

指纹：ping6 外网通、DHCPv6/SLAAC 正常，但 v4 拿不到地址/过不了网关。含义：
- 二层大概率正常（v6 ND 是组播、ARP 是广播，若 ARP 通而 v4 业务不通，锁定**设备 v4 服务面**）；
- DHCPv4 依赖广播+设备 DHCP server 进程；v6 走组播 RA+PD，**天然不依赖 NAT**；
- 结论方向：上游设备 v4 的 DHCP server / NAT 会话表 / v4 转发未随某次变更（模式切换、接口角色变更）正确重建。排查对象是**网关设备**，不是终端。
- 应急：终端改静态 IP+指网关试通断；管理员可在旁挂主机起备用 DHCP（dnsmasq 临时顶，option3 指向真网关）。

## 3 DHCP 无租约排障链

```text
display dhcp server ip-in-use / display ip pool        # 池耗尽？Conflict？
display current-configuration configuration dhcp       # 接口 dhcp select 配了吗；dhcp enable 了吗
```
- 高频原因：忘 `dhcp enable`；接口未 `dhcp select global|interface` 或池未绑接口；接口池掩码 /31（直接配置失败）；中继场景中继网关与服务器池不同网段；VLAN 没端到端放通；DHCP 服务器在另一台设备上而 option（如 43/60）需求不匹配。

## 4 登不上设备排障链

1. Console 永远可用（被 VTY 配置锁死时用 Console 救，Console 口不吃 AAA/ACL）。
2. 网络可达性：`ping` 管理地址（Vlanif down？路由缺失？管理网口绑 `_management_vpn_` 导致要带 VPN 实例测）。
3. 可达但拒绝：VTY `authentication-mode aaa` 但没建 local-user（谁都进不去）；local-user `service-type` 不含 ssh/telnet；SSH 用户缺 `authentication-type`；VTY 5 个会话占满（`user-interface maximum-vty` 调大 + `idle-timeout`）；ACL inbound 没放行你的源地址（含 vpn-instance 匹配）。
4. 改过网管地址/Vlanif 失联：Console 起来后先核对 `capwap source interface`、`web-manager server-source` 是否还钉着旧 Vlanif。

## 5 变更后失联（最高危场景）

- 症状：正在下发"二层转三层/上联口改造"命令时 SSH 断掉 → 大概率是 `undo portswitch` 瞬时黑洞（主文 §1-3）。
- 顺序：Console 接入 → 看清设备停在什么状态 → **不要急着敲配置**：判断剩余命令是否还需要、当前半态能否 `reboot fast`（未 save 时回到上一保存态）→ 需要继续则改走 OPS 本地脚本一次性完成（router-ar.md §9）。

## 6 持续性监控（低成本）

- 定时三探针：网关 v4 ping、v6 ping、外网各一 → **两栈不对称立即告警**（本文件 §2 指纹）。
- DHCP 存活：`nmcli device show | grep IP4` 空租约告警；备用 DHCP 进程存活。
- 设备侧：SNMP/telemetry 拉接口错包、CPU、AP 数量（`display ap all` 基线比对）。
