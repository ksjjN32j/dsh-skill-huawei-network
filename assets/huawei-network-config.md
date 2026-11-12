
# 华为路由器/交换机/AC+AP 通用配置

## 0. 适用范围与证据等级

- 适用：VRP V8 代际——AR5700/6700/8000（V600R025）、CloudEngine S 系列盒式交换机（V600R025）、AR/S 交换机内置 WAC + Fit/FAT AP。老平台（AR V200、S5700 V200、S1700、独立 AC6800 老版）命令**不可直接套用**。
- 每个结论标注证据等级：
  - **[文档]**＝V600R025 官方文档包逐字核对（本地 .hdx 文档包可全文检索，见 §5）；
  - **[实测]**＝现网操作验证过（来自现网割接与故障处置实战）；
  - **[文档未见]**＝本代文档中 0 命中——**不要凭老手册记忆编命令**。
- 本文所有 IP/密码均为文档示例或占位符。写真实配置时用用户环境值，不要把示例值当事实值。

## 1. 作业铁律（任何设备通用，先读这个）

1. **变更前留后路** [文档+实测]：`save` + 另存快照 `save flash:/prearm_<date>.cfg` + `startup saved-configuration <快照>` + `display startup` 核对 + `commit label pre_change`。启动配置文件必须在存储器根目录。
2. **未完全启动时严禁 save** [文档]：会用不完整配置覆盖已存文件。
3. **跨 `undo portswitch` 的批量变更禁止用 SSH 脚本驱动** [实测]：执行瞬间本机所有 Vlanif 失去二层、管理面即断、会话残余命令丢弃。走 Console 或设备本地 OPS 脚本（router-ar.md §8）。undo portswitch 前必须清空该口全部二层配置，否则执行不成功 [文档]。
4. **rollback 不是兜底** [文档+实测冲突]：V600R025 文档明载 `rollback configuration to label/file` 可用，但现网实测 parser 不认、且对"L2→L3+接口 IP"类变更会静默跳过 IP 赋值。兜底手段＝快照文件 + `startup saved-configuration` + `reboot fast`（不保存重启）。
5. **配置一段、验证一段**：全程只读 `display` 验证（见 §4），不做"配完 200 行再看"。
6. **管理面最后动、最先保**：开 SSH 并用新通道验证通过后，才允许撤 Console/旧通道；改网管口/Vlanif 地址前先确认 CAPWAP 源、web-manager server-source 等是否引用它（wlan-ac-ap.md §1）。
7. **密码策略不可关** [文档]：≥8 位、四类字符、禁与用户名及其倒序同、禁与前 10 次重复；`super password` 提级官方不推荐。
8. **批量脚本从用户视图开始** [文档]：OPS/批处理助手默认用户视图执行，脚本第一行自己写 `system-view`。

## 2. V600R025 与"老手册/网传教程"关键差异速查

| 事项 | 本代（V600R025 AR/S） | 老手册常见写法（会报错/失效） |
|---|---|---|
| dot1q 终结子接口 ARP | 无需也不能配，全库无 `arp broadcast enable` [文档][实测] | `arp broadcast enable` |
| 源 NAT | 接口 `nat enable` + `nat address-group` + `nat-policy rule → action source-nat` [文档] | `nat outbound`（V600R025 包 0 命中；**V300 AR6x00 仍是标准写法，跨代勿互抄**） |
| PPPoE WAN | 子接口 `dot1q termination vid` + `pppoe-client dialer 1 bundle-number 1`；Vlanif 不支持 [实测]（本包无 PPPoE 文档 [文档未见]） | 配到 Vlanif / V200 dialer 套路 |
| Telnet | 需先 `install feature-software WEAKEA`，不推荐；`protocol inbound ssh` 后自动禁 Telnet [文档] | 直接 `telnet server enable` |
| SSH | 不兼容 1.x；RSA≥3072 或 ECC；用户要配 `authentication-type` + `service-type` 两步 [文档] | 单步配置 |
| rollback 回退 | 文档有，实测不可靠 → 见 §1-4 [文档+实测] | 当保险用 |
| portswitch 端口二/三层互换 | AR 全系可逆；交换机仅 S6780-H/S6750-H/S6730-S/H-V2/S6750-S/S5755-H/S/S5732-H-V2 等支持，S5735 不支持 [文档] | 以为所有口随意切 |
| DHCP 接口池掩码 | /31 会配置失败 [文档] | — |
| `ip route-static default-preference` | 仅对新增路由生效 [文档] | 以为全局改写既有路由 |
| BPDU 保护 | 仅对手工配置 `stp edged-port enable` 的口生效 [文档] | 以为对自动识别边缘口生效 |
| AP 上线认证命令 | `ap auth-mode mac-auth`（缺省即 MAC 认证）[文档] | `ap mac-authenticate` |
| AC 数据平面加密开关 | 无独立开关；只有控制隧道 DTLS；隧道转发业务走 CAPWAP 数据隧道 [文档] | 老 AC `station-account` 之类 |
| NTP | `ntp unicast-server <ip>`（V600 全包 0 命中 `ntp-service`）[文档] | `ntp-service unicast-server` |
| IPSG 使能 | VLAN 视图 `ipv4 source check user-bind enable` [文档] | `ip source check user-bind enable`（V200 拼写） |
| 上下行链路联动 | `monitor-link group N` + `port … uplink/downlink` [文档] | `link-group`（本代包 0 命中 [文档未见]） |

## 3. 任务路由（按需加载，别全读）

| 要做的事 | 看哪里 |
|---|---|
| 交换机：VLAN/端口类型/STP/Eth-Trunk/VRRP/DHCP/OSPF/AAA-SSH/开局顺序；园区三层组网与 MSTP+VRRP；接入安全三件套；iStack 堆叠 vs M-LAG；syslog/SNMP/NTP 运维 | [references/switch.md](references/switch.md) |
| AR 路由器：子接口/静态路由/OSPF/NAT/DHCPv4/IPv6 RA+PD/OPS/配置回退/开局顺序；双 PPPoE 主备/负载分担、NQA 联动、策略路由、IPsec NAT-T、升级补丁（§13，V300 代际对照） | [references/router-ar.md](references/router-ar.md) |
| 无线：AC+WAC 组网规划/Fit AP 开局/SSID+安全+转发模式/漫游+跨AC漫游组/RRM/高密/FAT AP/AP 排障/N+1 与 HSB/独立 AC 差异 | [references/wlan-ac-ap.md](references/wlan-ac-ap.md) |
| 排障方法论（v4/v6 不对称、DHCP no-lease、登不进） | [references/troubleshooting.md](references/troubleshooting.md) |
| 二层转三层/WAN 迁移割接 | troubleshooting.md §5 + 自维护的本网络割接笔记 |

## 4. 通用验证口径（配完就敲这些）

- 二层：`display vlan verbose`、`display port vlan`、`display stp brief`、`display eth-trunk`
- 三层：`display ip interface brief`、`display ip routing-table`、`display arp`
- DHCP：`display ip pool`、`display dhcp server ip-in-use`
- NAT：`display nat-policy rule`、`display nat server`、`display nat resource usage address-group`
- IPv6：`display ipv6 interface`、`display dhcpv6 pool`
- 无线：`display ap all`（State=nor）、`display vap all`、`display station all`、`display capwap configuration`
- 管理面：`display ssh server status`、`display local-user`、`display startup`

## 5. 资料来源

- 官方文档包（支持命令全文核对）：support.huawei.com 下载对应产品与 V600R025C00 版本的文档包（.hdx 为 zip，主题页在 resources/，编码 GB18030，解包后先转码再检索）。
- 华为官网《WLAN 常见部署建议》：<https://support.huawei.com/hedex/api/pages/EDOC1100064375/AZI0130Q/08/resources/dc/dc_wlan_planning_0022.html>（其建议已并入 wlan-ac-ap.md §8）。
- 现网实测经验：标注 [实测] 的条目来自现网操作验证（PPPoE 落点、portswitch 黑洞、rollback 不可靠）。
- 本包查证为"不存在"的东西不要编：DHCP Snooping 独立章节（命令在快速开局/NAC 举例中）、`arp broadcast enable`、`nat outbound`、`ntp-service` 前缀、`link-group`（用 `monitor-link`）、PPPoE 文档、AP 侧 `ap delete-configuration`/`ap-sync` 命令。
