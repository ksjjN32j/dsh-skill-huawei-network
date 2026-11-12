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
 vrrp vrid id track interface X [ reduce 10 ]     # 缺省故障降10
```
- IP 拥有者立即回切且**不允许配 track**；延时抢占组的 Master 不能是 IP 拥有者；`preempt disable` 后永不回切。验证：`display vrrp verbose`。

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
