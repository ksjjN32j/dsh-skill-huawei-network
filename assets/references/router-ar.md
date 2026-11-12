# AR 路由器（NetEngine AR5700/6700/8000，V600R025）企业网关速查

> 命令逐字来自官方文档包 [文档]；标注 [实测] 的来自现网验证（PPPoE、rollback 冲突项）。示例 IP 为文档原值。

## 1 二层口与 Vlanif

```text
system-view
interface 10ge 0/0/1
 portswitch                          # 三层口→二层口
 port link-type trunk                # access | trunk | hybrid
 port trunk allow-pass vlan 10       # access 口用 port default vlan 10
interface vlanif 10
 ip address 192.168.10.1 24
```
- 前置：接口处于三层模式时先 `portswitch`；Vlanif 前提是 VLAN 已建且成员口已加入。
- STP 缺省 MSTP 模式、全局默认使能、优先级 32768。
- 验证：`display port vlan`、`display interface vlanif`、`display vlan verbose`。

## 2 三层接口 / 单臂子接口 / ARP

```text
interface 10ge 0/0/1
 undo portswitch                     # 先清二层配置，否则报错（见主文 §1-3）
 ip address 172.16.1.1 255.255.255.0
 ip address 172.16.2.1 255.255.255.0 sub     # 从地址，每口最多 255 从/256 总
quit
interface 10ge 0/0/1.100
 dot1q termination vid 100           # 主接口须已在三层模式
 ip address 10.1.100.1 24
```
- **无 `arp broadcast enable`**（全库 0 命中）——终结子接口/Vlanif 无需也不能配 [文档][实测]。
- 子接口与主接口可同主网段但掩码不能相同；`dot1q termination vid` 自动生成 encapsulation，undo 同步删。
- 静态 ARP：`arp static ip mac`；`arp direct-route enable`（VLANIF 下缺省优先级 255）。
- 验证：`display ip interface brief`、`display ip interface multi-address`。

## 3 静态路由

```text
ip route-static 0.0.0.0 0.0.0.0 <nexthop> [ preference p | tag t ] * [ description .. ]
ip route-static 192.168.2.0 24 10.1.1.2 preference 60     # 缺省优先级 60
ip route-static 192.168.2.0 24 10.2.2.2 preference 100    # 浮动备份：主断才激活
```
- `ip route-static default-preference` 仅对新增路由生效。next-hop 可为接口或 `dhcp`。

## 4 最小 OSPF

```text
router-id 1.1.1.1
ospf 1
 area 0
  network 192.168.0.0 0.0.0.255      # 反掩码；wildcard 全 0 精确匹配 IP
default-route-advertise [ always ]   # ASBR 发缺省；Type-3 缺省优先级高于 Type-5/7
# 接口法：接口下 ospf enable [ process-id ] area area-id
```
- network 使能条件：接口主 IP 在网段内且接口掩码长度 ≥ network 指定掩码长度。
- 验证：`display ospf peer brief`、`display ip routing-table protocol ospf`。

## 5 NAT（本代无 nat outbound，是 NAT 策略模型）

```text
interface 10ge 0/0/2                 # WAN 口
 undo portswitch
 ip address 1.1.1.1 24
 nat enable                           # 出接口使能
quit
nat address-group 1
 mode pat                             # No-PAT: mode no-pat { global | local }
 section 0 1.1.1.10 1.1.1.15
 route enable                         # 生成黑洞路由防环
quit
nat-policy
 rule name out2inet
  source-address 10.1.1.0 24
  action source-nat address-group 1   # Easy IP: action source-nat easy-ip（免地址池）
# 对外发布：
nat server policy_web protocol tcp global 1.1.1.1 8080 inside 10.2.0.7 www route
```
- NAT Server 黑洞规则：global 地址与公网接口**不同网段必须**配黑洞路由（可 `nat server name <n> route` 补 OPR 路由）；同网段建议；与接口地址一致不需要。
- nat-policy 规则自上而下首-match 停止；可 `source-address-exclude`、source-zone/destination-zone/egress-interface（后两者互斥）。
- 验证：`display nat-policy rule`、`display nat server`、`display nat resource usage address-group`。

## 6 DHCPv4

```text
dhcp enable                          # 语法 dhcp enable [ ipv4 | ipv6 ]，必须先行
ip pool pool1
 network 10.1.1.0 mask 24
 gateway-list 10.1.1.1
 dns-list 10.1.3.1
 lease day 30
 static-bind ip-address 10.1.1.100 mac-address 00e0-fc12-3456
interface <网关接口>
 dhcp select global                   # 或 dhcp select interface（接口池：dhcp server ip-range/mask/gateway-list/dns-list）
# 中继（中继网关须与服务器池同网段）：
 dhcp select relay ; dhcp relay server-ip <服务器地址>
```
- 接口池掩码不能 /31，否则池配置失败。给 AP 下发 AC 用 `option 43 sub-option 3 ascii <AC-IP>`（ip pool 视图，见 wlan-ac-ap.md）。
- 验证：`display ip pool`（Used/Idle/Conflict/Expired）。

## 7 IPv6：RA / DHCPv6 服务端 / PD

```text
dhcp enable
dhcpv6 pool pool1
 address prefix fc00:3::/64
 dns-server fc00:4::1                 # v6 DNS 必须 DHCPv6 下发（RA 无 dns-server 命令）
interface 10ge 0/0/1
 undo portswitch
 ipv6 enable
 ipv6 address fc00:3::1/64
 ipv6 nd autoconfig managed-address-flag   # M 位：有状态取地址
 ipv6 nd autoconfig other-flag             # O 位：无状态地址+其他参数
 ipv6 nd ra prefix default no-advertise    # 关掉 SLAAC 前缀（配合 M 位）
 dhcpv6 server pool1
```
- PD 服务端：`dhcpv6 pool <n>` + `prefix-delegation <前缀>/<长度> <授权长度>`。
- PD 客户端：WAN 口 `dhcpv6 client pd <prefix-name>`；内网 Vlanif `ipv6 enable` + `ipv6 address dhcpv6-prefix <前缀>::1/64`。
- **PD 大坑**：Vlanif 上该地址在拿到 PD 前缀前不生效（接口无地址）；**内网 SVI 接口 ID 是手工钉死的，ISP renumber 后必须重配/脚本重指**（最易漏的 v6 黑洞）[文档][实测]。两接口配相同 dhcpv6-prefix 会"配置成功但不生效"。
- 中继：接口 `dhcpv6 relay destination <v6地址>`（link-address 与 source-interface 互斥）。
- 验证：`display dhcpv6 pool`、`display ipv6 interface`。

## 8 PPPoE WAN [实测——本包无 PPPoE 文档，以下来自现网]

```text
interface 10ge 0/0/0.100
 dot1q termination vid 100
 pppoe-client dialer 1 bundle-number 1
interface Dialer1
 ip address ppp-negotiate
 dialer bundle 1
```
- Vlanif 上配 `pppoe-client` 直接 unrecognized；一个 Dialer Bundle 同时只能绑一个接口（切 WAN 先 undo 旧口）。
- 验证：`display pppoe-client session summary`。

## 9 OPS 本地脚本（跨风险变更的安全通道）

```text
<AR> ops install file mychange.py                    # 装到 flash:/$_user/
<AR> system-view
[AR] ops
[AR-ops] script-assistant python mychange.py         # 事件触发型
# 免事件直接执行：<AR> ops run python mychange.py
```
```python
# -*- coding: utf-8 -*-
import ops
def ops_condition(_ops):
    _ops.cli.subscribe("cli1", "触发命令串", enter=True, sync=True, async_skip=False, sync_wait=60)
    return 0
def ops_execute(_ops):
    handle, err = _ops.cli.open()
    _ops.cli.execute(handle, "system-view")
    _ops.cli.execute(handle, "interface 10ge 0/0/1")
    _ops.cli.execute(handle, "undo portswitch")      # 一次一条命令
    _ops.cli.close(handle)
    return 1
```
- `_ops.cli.execute(fd, command, choice=None)`：choice 为交互式应答 dict（如 `{"Continue?":"y"}`，≤8 项）；返回 Next:1 时以 command=None 续取输出。
- 批处理助手 `*.bat` **默认从用户视图执行**，避免交互/跳转命令，内容不做语法检查。
- OPS 看门狗（心跳+可达性判断+自动 `reboot fast`）见 troubleshooting.md §5。

## 10 配置文件与回退

```text
save
save flash:/prearm_<date>.cfg                        # 快照另存
startup saved-configuration prearm_<date>.cfg        # 下次启动指向快照（根目录！）
display startup                                      # 核对
commit label pre_change ; display configuration commit list verbose
configuration file auto-save                         # 定时自动保存（按需）
```
- `rollback configuration to label/file/commit-id` 文档存在但实测不可靠 → 兜底只用：快照 + startup + `reboot fast`（主文 §1，另见 troubleshooting §5）。
- 设备未完全启动禁 save；恢复结果查 `display configuration recover-result`。

## 11 管理安全（一次配对，别再返工）

```text
aaa
 local-user <name> password irreversible-cipher <密文>
 local-user <name> privilege level 3
 local-user <name> service-type ssh
quit
rsa local-key-pair create                            # RSA≥3072 或用 ECC；不支持 SSH1.x
stelnet server enable
ssh authentication-type default password
ssh user <name> authentication-type password
ssh user <name> service-type stelnet
ssh server-source -i vlanif 10                       # 指定源接口（可省=all-interface）
user-interface vty 0 4
 authentication-mode aaa
 protocol inbound ssh                                # 配了后自动禁 Telnet
 acl 2000 inbound                                    # rule permit source <网管IP> 0
 shell ; idle-timeout 20
```
- 两步缺一（authentication-type / service-type）就登不上；authentication-mode aaa 但没建 local-user = 谁都进不去。
- ACL inbound 限"谁能登"，outbound 限"登录后能去哪"；管理网口缺省绑 `_management_vpn_`（ACL 加 `vpn-instance _management_vpn_`）。
- 验证：`display ssh server status`、`display ssh user-information`。

## 12 AR 标准开局顺序

1. Console：Vlanif 管理地址 → AAA+SSH+VTY ACL → `save`+快照+`commit label`。
2. WAN：三层口/子接口 + IP（或 §8 PPPoE）→ 缺省路由（备份链路 preference 100 浮动）。
3. 内网：`vlan batch` + 下行 trunk + Vlanif 网关 → DHCP 池（gateway-list/dns-list）；v6 按 §7。
4. NAT：§5 全流程；对外发布 nat server。
5. 需要动态路由时：§4 最小 OSPF。
6. 无线：加载 references/wlan-ac-ap.md（AR 内置 WAC 同源命令）。
7. 任何跨 portswitch 批量变更 → OPS 脚本（§9）或 Console，不碰 §10 的 rollback。
