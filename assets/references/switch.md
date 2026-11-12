# S 系列交换机配置速查（S5735/S5755/S6730/S6750/S6780 等，V600R025C00 文档逐字核对）

> 适用：CloudEngine S 系列（盒式）V600R025C00。命令逐字来自官方文档包；老平台 S1700/S5700 V200 命令不可套用。
> ⚠️ 本代文档无 DHCP Snooping 独立章节（在 NAC 分册）、无 FTP/SFTP 服务器章节——不要凭记忆编命令。

## VLAN 与端口类型

```text
system-view
vlan batch { vlan-id1 [ to vlan-id2 ] } &<1-10>
vlan vlan-id ; description ... ; name vlan-name
interface interface-type interface-number
 port link-type { access | trunk | hybrid }
 port default vlan vlan-id                      # access
 port trunk allow-pass vlan { vlan-id1 [ to vlan-id2 ] | all }   # trunk
 port trunk pvid vlan vlan-id
 port hybrid { tagged | untagged } vlan ...     # hybrid（下挂既可能有tag又可能无tag设备时选它）
 port hybrid pvid vlan vlan-id
```
- 批量挂端口可在 VLAN 视图：`port interface-type { n1 [ to n2 ] }`。
- 坑：链路类型自协商缺省使能，与不支持自协商的对端互通会白耗带宽 → `port negotiation disable`；VLAN 1 不可删；范围 1~4094。
- **`portswitch`/`undo portswitch`（二/三层口互换）仅 S6780-H、S6750-H、S6730-S/H-V2、S6750-S/E-S、S5755-H/S、S5732-H-V2 等支持，S5735 系列不支持**。
- 验证：`display vlan [ summary | verbose ]`、`display port vlan [ active ]`、`display current-configuration interface`。

## VLANIF 与管理 VLAN

```text
interface vlanif vlan-id
 ip address ip-address { mask | mask-length } [ sub ]
vlan vlan-id ; management-vlan        # 成员口必须是 trunk/hybrid；管理VLAN可远程登录
```
- 防 VLAN 成员翻动引起 VLANIF 振荡：`damping time delay-time`。验证：`display ip interface brief`。

## STP / MSTP

```text
stp mode { stp | rstp | mstp }        # 缺省 MSTP，全局默认已使能
stp region-configuration ; region-name RG1 ; instance 1 vlan 2 to 10 ; quit   # 域内三要素全网一致
stp [ instance id ] root primary | root secondary     # 多台 primary 时 MAC 小者为根
stp priority <缺省32768，越小越优先>
stp pathcost-standard { dot1d-1998 | dot1t | legacy }  # 全网统一
interface X ; stp edged-port enable | stp disable     # 接终端口
 stp root-protection / stp loop-protection / stp cost ...
stp bpdu-protection                   # 系统视图；仅对手工配置的边缘口生效！
stp tc-protection
error-down auto-recovery cause bpdu-protection interval <min>
```
- 顺序：**先配参数（优先级/开销/MST域）再启用 STP**，运行中改参数会引起全网重算震荡。
- 接终端口不做边缘处理会拖慢终端 DHCP 取址。

## Eth-Trunk

```text
interface eth-trunk trunk-id
 mode { manual load-balance | lacp-static | lacp-dynamic }   # 缺省 manual
 lacp max active-linknumber n        # LACP 活动+备份链路
 trunkport interface-type { n1 [ to n2 ] }
load-balance profile p ; ip [ src-ip | dst-ip | src-mac | l4-src-port ... ] *
```
- 对端没配 Eth-Trunk 会"物理 UP 但协议 DOWN"。负载分担字段缺省因型号而异（S5755-S 含 session-id，S5735-S-V2 等字段更少）。验证：`display eth-trunk`。

## VRRP（三层网关冗余）

```text
interface vlanif id
 vrrp vrid id virtual-ip <虚IP>
 vrrp vrid id priority <缺省100>
 vrrp vrid id preempt timer delay 20
 vrrp vrid id track interface X [ reduce N ]     # 缺省故障降10（V600R025 包示例拼写 reduce，非 reduced）
 vrrp vrid id bfd peer-ip <对端地址>             # Peer/Link BFD：不改优先级直接切状态，可区分本地/远端故障
```
- IP 拥有者立即回切且**不允许配 track**；延时抢占组的 Master 不能是 IP 拥有者；`preempt disable` 后永不回切。收敛升级路线：`track interface` → `track ip route`/`track nqa` → BFD（有硬指标再上）。验证：`display vrrp verbose`。

## DHCPv4（server / relay / option 43）

```text
dhcp enable                                   # 必须先行
# 接口池：
interface vlanif id ; dhcp select interface
 dhcp server ip-range start end ; dhcp server mask <掩码不能/31>
 dhcp server gateway-list a ; dhcp server dns-list b ; dhcp server lease day 30
# 全局池：
ip pool pool1 ; network .. mask .. ; excluded-ip-address .. ; gateway-list .. ; dns-list ..
interface vlanif id ; dhcp select global
# option 43（指 AC 等，无专用命令，用通用 option）：
ip pool 视图：option 43 sub-option 3 ascii <AC地址>
interface 视图：dhcp server option 43 sub-option 3 ascii <AC地址>
# relay：接入口 dhcp select relay + dhcp relay server-ip <地址>；中继网关须与服务器池同网段
```
验证：`display ip pool [ name .. ]`、`display dhcp server ip-in-use`、`display dhcp relay`。

**VRRP 双机做 DHCP 服务器**（官方举例标准做法）：主备两台**都建同名 ip pool**；`gateway-list` 指向 VRRP 虚拟 IP 并把 VIP 加入 `excluded-ip-address`；两侧用 `excluded-ip-address` 互斥错开服务范围（主服务大段、备服务小段）防冲突。

**option 43（AC 发现）细节**：四种写法任选其一——`option 43 sub-option 2 ip-address <AC1> [<AC2> …]`（≤8 个 AC）/ `sub-option 3 ascii "<ip1>,<ip2>"` / `sub-option 1 hex <AC地址HEX串>` / `option 43 hex 03<长度ASCII串>`。**同时配置多条会全部生效——只选一条**。第三方 DHCP 服务器：AC IP 放 option43、AC 域名后缀放 option15；DNS 发现方式 AP 自动拼 `huawei-wlan-controller` 前缀查询。AP 管理 VLAN 的放号网段**不得包含 192.168.254.254 所在网段**（撞 V600 AP 缺省管理地址）[文档]。

- 高密度无线池耗尽缓解：`authentication user-offline send-dhcp-release enable`（终端下线联动释放租约）；池监控 `display ip pool` + 分配失败日志；大规模可按 Option82 拆池（中继默认信任 Option82：`dhcp server trust option82`）。

## 园区网参考架构（核心/汇聚/接入）

- 官方两种网关范式：**核心做网关**（中小园区：核心终结全部业务 VLAN + DHCP 在核心 + 接入纯二层 Eth-Trunk 上联，核心互联/核心↔出口用专用 VLAN）；**双机 VRRP 网关**（网关落核心/汇聚对，接入仅二层双挂）。放核心还是汇聚官方无选型条文——按"业务 VLAN 终结点在哪，网关就在哪"操作。
- MSTP+VRRP 双挂标准顺序：①互联 trunk + `vlan batch`；②MST 域三要素全网一致（region-name/revision/instance）；③**实例根桥与 VRRP 主对齐**（A=`stp instance 1 root primary`，B=secondary；instance 2 反之）→ 两组交叉 Master 实现负载分担；④全网 `stp pathcost-standard legacy`，欲阻塞口 `stp instance N cost 20000`；⑤`stp enable`，终端口 edged + 全局 `stp bpdu-protection`；⑥根桥指定口 `stp root-protection`；⑦Vlanif+路由协议；⑧VRRP（priority 120/100 + `preempt timer delay 20`）。
- 上行断→关下行（防接入层黑洞）：**Monitor Link**：`monitor-link group 1` → `port <上行> uplink` → `port <下行> downlink 1` → `timer recover-time 10`。老手册 `link-group` 写法本代无 [文档未见]。
- **堆叠 vs M-LAG 选型**：盒式主流=**iStack 堆叠**（接入/汇聚层）+ 上行 Eth-Trunk 双挂；核心双机=VRRP+MSTP；M-LAG 仅中高端型号（V600R025 规格页仅 S6780-H/S6750(-E-S)/S6730(-E)-H-V2/S6730-S-V2/S5755-H/S/S5732-H-V2 等，**S5735 等主流盒式不支持**）。
  - iStack 关键步骤：`stack` → 备机 `stack member 1 renumber 2` → `interface Stack-Port1/1` + `port member-group interface <口1> <口2>` → **断电接线再上电** → 建议 `set system-mac`；双主检测有直连/代理 MAD。部署建议（官方明文）：堆叠放汇聚/接入层、每台成员都要有独立上行；堆叠系统带宽=最小互联带宽；高端设备可下置、低端不得上置。
  - M-LAG 约束：DFS-GROUP+三层心跳、同桥 MAC，下行所接交换机**必须配根保护**。

## 接入安全（Snooping / IPSG / DAI / 风暴）

```text
# 顺序：snooping → 上行 trusted → IPSG → DAI，跳步必丢包
dhcp enable
dhcp snooping enable                            # 全局
interface Eth-Trunk <上行>  ; dhcp snooping enable ; dhcp snooping trusted
# 终端口逐个 dhcp snooping enable（或 VLAN 视图批量 + trusted interface 例外）
vlan <id> ; ipv4 source check user-bind enable   # IPSG（V200 拼写 ip source…，别照抄）
interface X ; arp anti-attack check user-bind enable        # DAI
  arp anti-attack check user-bind check-item { ip-address | mac-address | vlan | interface }*
  arp anti-attack check user-bind alarm enable [ threshold N ]
arp anti-attack rate-limit source-ip <ip> maximum 100       # ARP 泛洪限速
storm suppression { broadcast | multicast | unknown-unicast } cir <值>   # 简单抑制（另一机制）
storm-control broadcast min-rate .. max-rate .. ; storm-control action { error-down | block | suppress }  # 两级阈值控制
port-security enable [ maximum N ]              # 与 mux-vlan 同口互斥 [文档]
```
- 官方排错页明文三坑：上行口忘配 trusted 丢包；上行口误开 IPSG 丢包；动态场景没开 snooping 则 IPSG 无效。
- 验证：`display ip source check user-bind status`、`display arp anti-attack statistics check user-bind`、`display dhcp snooping`。

## 运维接入（syslog / SNMPv3 / NTP / 升级）

```text
info-center enable
info-center loghost <syslog-ip> facility local2 channel loghost1 ; info-center loghost source <接口>
snmp-agent sys-info version v3                  # 只留 v3，禁 v1/v2c
snmp-agent group v3 <group> privacy ... ; snmp-agent usm-user v3 <user> group <group> authentication-mode sha2-256 ... privacy-mode aes128 ... acl <ACL>
ntp unicast-server <ntp-ip> [ source-interface <接口> ]   # ⚠️ V600 无 ntp-service 前缀，照抄老手册必报错
```
- 升级顺序：官方定死的只有**堆叠平滑升级**——新包拷齐全部成员 → `upgrade backup-area slot 2 to 3`（先升备成员备区，`display upgrade area` 见 passed）→ `upgrade start`（自动 save+平滑倒换）→ `display upgrade state`。无线配套原则=AC 版本必须支持在册 AP → **先升 AC 再升 AP**；"全网自顶向下"属工程惯例非官方条文。

## 静态路由与最小 OSPF

```text
ip route-static 0.0.0.0 0.0.0.0 <nexthop> [ preference p | tag t ] * [ description .. ]
router-id ipv4-address                        # 建议在 ospf 进程外先配
ospf [ process-id ] ; area 0 ; network <网段> <反掩码>    # wildcard 全 0 为精确匹配 IP
# 接口法：ospf enable [ process-id ] area area-id
default-route-advertise [ always ]            # 向 OSPF 发缺省路由
silent-interface <接终端/用户侧口>            # 只发布不建邻居
```
- network 使能条件：接口主 IP 在网段内且接口掩码长度 ≥ network 指定掩码长度。验证：`display ospf peer brief`、`display ip routing-table protocol ospf`。

## 管理面安全（AAA / SSH / VTY）

```text
aaa
 local-user NAME password irreversible-cipher <密文>
 local-user NAME service-type ssh
 local-user NAME privilege level 3            # 0~15，3=可配系统级命令
quit
rsa local-key-pair create                      # RSA 建议 ≥3072 或改用 ECC
stelnet server enable
ssh user NAME authentication-type password     # 这步
ssh user NAME service-type stelnet             # 和这步，缺一不可
user-interface vty 0 4
 authentication-mode aaa ; protocol inbound ssh   # 配 ssh 后设备自动禁 telnet
 acl 2000 inbound                              # 白名单：rule permit source <网管IP> 0
 shell ; idle-timeout 20
```
- 密码策略不可关闭：≥8 位且四类字符（大小写/数字/特殊）、禁与用户名及其倒序相同、禁与前 10 次重复。
- `super password` 提级方式文档明示不推荐（越权风险）。Telnet 需先 `install feature-software WEAKEA`（新版本行为），不推荐用。
- VTY 缺省最大 5 个、空闲超时 10min；authentication-mode aaa 但没建 local-user 会谁都登不进去。
- 管理网口缺省绑 `_management_vpn_`，ACL 写 `rule permit vpn-instance _management_vpn_ source ...`。

## 接入交换机典型开局顺序

1. `sysname` + Console 配管理 VLANIF → 2. `vlan batch`（管理 VLAN 单列）→ 3. 上行 trunk / 下行 access + 边缘端口 → 4. STP：核心 `root primary`、接入 `secondary`、MST 域三要素一致 → 5. 需捆绑先建 Eth-Trunk 再划 VLAN → 6. `dhcp enable` + Vlanif 地址池（AP 场景加 option 43）→ 7. 双网关配 VRRP（track 上行口）→ 8. 缺省/浮动静态路由 → 9. **最后**开 SSH（local-user + vty acl + stelnet），新通道验证通过再撤 Console → 10. `save`。
