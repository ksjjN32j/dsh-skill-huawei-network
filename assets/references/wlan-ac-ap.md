# AC/WAC + AP 无线配置速查（AR 内置 WAC、S 系列交换机内置 WAC，V600R025 文档逐字核对）

> 独立 AC6800/AC6005（V200 代）大部分命令同源，但版本差异按对应文档核对。示例 IP 为文档原值，`<尖括号>` 为占位符。

## 1 组网规划（动手前先定这四件事）

1. **VLAN 规划**：管理 VLAN（承载 CAPWAP）与业务 VLAN 分离，**不用 VLAN 1**。直接转发建议分离否则可能业务不通；**隧道转发时管理/业务 VLAN 必须不同，且 AP↔WAC 之间只放通管理 VLAN、不放通业务 VLAN**。
2. **AC 位置 × 转发模式**：直连二层/直连三层/旁挂二层/旁挂三层 × 直接转发/隧道转发共 8 种组合（文档各有完整举例）。旁挂时 WAC 只走管理 VLAN，业务 VLAN 在汇聚/核心终结。
3. **AP 取址与 AC 发现**：AP 与 AC **同网段二层直连不需要 option43**（广播发现）；跨网段/旁挂必须 DHCP + option43（可配中继）：
   ```text
   ip pool huawei
    option 43 sub-option 3 ascii 10.23.100.1            # 单 AC，ASCII 型
    option 43 sub-option 2 ip-address 10.23.201.1 10.23.203.1   # IPv4 型，主备两个 AC
   ```
   AR/S 的 dhcpv4 章节只有 option43 原理，**下发命令在 WLAN 举例脚本里**（这是常见困惑点）。
4. **交换机直连 AP 的口**：trunk，PVID=管理 VLAN，allow-pass 管理+业务 VLAN，高密场景加 `port-isolate enable group 1` 与组播抑制。
- AR 特有：`capwap source interface vlanif N` 会"占住"该 Vlanif 地址（`undo ip address` 报 `used by wlan`），须先 `undo capwap source interface`；该命令**只接受 loopback/vlanif，不接受以太子接口**；恢复承载可用 `capwap source ip-address <ip>` [实测+文档]。
- **首次 `capwap source interface` 会交互索取 4 项凭据**（DTLS PSK / 登录 AP 用户名 / 登录 AP 密码 / 离线管理 VAP PSK），脚本化时注意交互应答 [文档]。

## 2 Fit AP 开局最小完整命令链（WAC 管理 VLAN100 / 业务 VLAN101）

```text
system-view ; sysname WAC
vlan batch 100 101
interface vlanif 100
 ip address 10.23.100.1 24
interface <上行口>
 port link-type trunk ; port trunk allow-pass vlan 100      # 业务 VLAN 口 allow-pass 101
# （跨网段时：中继+池，见 §1-3）
dhcp enable
# AP 组 + 国家码：
wlan
 ap-group name ap-group1
 regulatory-domain-profile name domain1
  country-code cn
 quit
 ap-group name ap-group1
  regulatory-domain-profile domain1
 quit
quit
capwap source interface vlanif 100            # 交互设置 4 项凭据
# DTLS 默认开启会让"首次添加的 AP"上线失败 → 临时放行：
capwap dtls no-auth enable
wlan
 ap auth-mode mac-auth                         # 缺省即 MAC 认证，可不配（没有 ap mac-authenticate 这条命令！）
 ap-id 1 type-id 216 ap-mac 00e0-fc12-3456     # type-id 查"WLAN AP版本配套和形态速查表"；MAC 格式 00e0-fc12-3456
  ap-name area_1
  ap-group ap-group1
quit
display ap all                                # State=nor 即上线成功；ExtraInfo 的 P=供电不足
undo capwap dtls no-auth enable               # 上线后立即关闭！
# SSID + 安全 + VAP：
wlan
 security-profile name sec1
  security wpa2 psk pass-phrase <PSK密码> aes
 quit
 ssid-profile name ssid1
  ssid wlan-net
 quit
 vap-profile name vap1
  forward-mode tunnel                         # 直接转发用 direct-forward
  service-vlan vlan-id 101                    # 直接转发时此 VLAN 需在 AP 路径上可达
  security-profile sec1
  ssid-profile ssid1
 quit
 ap-group name ap-group1
  vap-profile vap1 wlan 1 radio 0
  vap-profile vap1 wlan 1 radio 1
 quit
# 手动固定信道/功率（自动调优开着时手动配置不生效）：
 ap-id 1
  radio 1
   calibrate auto-channel-select disable
   calibrate auto-txpower-select disable
   channel 20mhz 149
   eirp 127
```
- AP 上线阶段（排障按序对号）：取 IP → CAPWAP 隧道 → 接入控制(Join) → 版本升级 → 配置状态检查 → Keepalive（控制 UDP5246/数据 UDP5247）→ 业务下发。

## 3 模板体系 / 安全 / 转发

- 继承关系：AP/AP 组 ← 一级模板（域管理、射频、VAP、AP 有线口、AP 系统、场景）← 二级模板（SSID/安全/流量模板挂在 VAP 模板下）。应用 `vap-profile <n> wlan <id> radio { <r> | all | radio-policy { 2.4g | 5g | 6g | all } }`，`ap-group all` 可全局下发。
- 安全模板（逐字）：
  ```text
  security wpa2 psk pass-phrase <pwd> aes                                  # 最常用
  security wpa-wpa2 psk { pass-phrase | hex } <k> { tkip [ aes ] | aes }   # TKIP 已不建议（降速率）
  security wpa3 sae pass-phrase <pwd> aes                                  # WPA3 强制 PMF
  security wpa3 dot1x { gcmp256 | aes }
  security wpa2-wpa3 psk-sae pass-phrase <pwd> aes                         # 混合过渡（PMF 非强制）
  pmf { optional | mandatory } ; wpa ptk-update enable
  ```
- SSID 模板：`ssid`、`ssid-hide enable`、`max-sta-number`、`reach-max-sta hide-ssid disable`、`deny-broadcast-probe enable`、`dot11r enable [ over-the-ds ]`、`undo dot11k disable`、`undo dot11v bss-transition disable`。
- VAP 模板：`forward-mode { direct-forward | tunnel }`（只有这两种）、`service-vlan`、`layer3-roam disable`（缺省三层漫游是开的）、`keep-service enable [ allow new-access [ no-auth ] ]`（AP 离线逃生，仅直接转发）、`type service-backup ap-offline` / `type service-backup auth-server-down [ vap-auto-off <min> ] radius-server template <r>`。
- 802.1X 链（RADIUS）：
  ```text
  radius-server template r1 ; radius-server authentication <ip> 1812 ; radius-server shared-key cipher <key> ; quit
  aaa
   authentication-scheme s1 ; authentication-mode radius
   domain example.com ; authentication-scheme s1 ; radius-server r1
  quit
  dot1x-access-profile name d1                     # 默认 EAP 终结方式，RADIUS 需支持 EAP
  authentication-profile name p1
   dot1x-access-profile d1
   access-domain example.com force
  wlan ; vap-profile name vap1 ; authentication-profile p1
  ```
- 隔离：流量模板/AP 有线口模板 `user-isolate { l2 | all }`；交换机侧 `port-isolate enable group 1`。
- 加密澄清：AC 只有**控制隧道 DTLS**（`capwap dtls psk`/`no-auth`），无独立数据平面加密开关；隧道转发业务本身走 CAPWAP 数据隧道，直接转发不建。

## 4 漫游 / 射频 / 高密

- **WAC 内漫游零配置**；三层漫游缺省开启（VAP 模板 `layer3-roam disable` 可关）；跨 VLAN 三层漫游完整举例＝双 AP 组+双业务 VLAN+option43。**跨 AC 漫游本代无 mobility-group 命令**，官方方案是 §7 的 N+1 备份。
- 快速漫游：`dot11r enable`（SSID 模板）+ `undo dot11k disable` + `undo dot11v bss-transition disable`；智能漫游：RRM 模板 `undo smart-roam disable`；免牵引 `station-unsteerable sta-mac <mac>`。
- RRM：缺省自动调优开启（间隔 1440min），**手动信道/功率前必须先 disable 对应 auto 项**：`calibrate auto-channel-select disable`、`calibrate auto-txpower-select disable`；调优信道集合配在域管理模板；`display channel switch-record reason { calibrate | ap-sync | ... }`。
- 5G 优先（频谱导航，VAP 模板）：`undo band-steer disable` + `band-steer higher-band` + `band-steer deny-threshold { <n> | always }`（**不能配 0，否则 higher-band 不生效**）+ `band-steer snr-threshold`；2.4G/5G 绑不同 RRM 模板且参数冲突时以 2.4G 为准。
- 高密工具箱：动态负载均衡 `undo sta-load-balance dynamic disable`（`display sta-load-balance fairness`）；CAC（RRM 模板）`uac client-number threshold access 32 roam 32`、`uac client-snr threshold 25`、`uac reach-access-threshold hide-ssid | priority-replace`；抑制 `traffic-optimize { broadcast | multicast }-suppression packets <r>`（AP 有线口版含 unicast-suppression）、按协议限速 `traffic-optimize broadcast-suppression { arp | igmp | nd | dhcp | ... } rate-threshold <v>`；广播转单播 `traffic-optimize bcmc unicast-send { arp | nd | dhcp | mdns }*`；VIP 空口带宽预留（射频模板）`vip-user bandwidth reservation-ratio <ratio>`（缺省 20）。
- 易混名称：`dc_cfg_wlan_dap_*`＝零漫游分布式 Wi-Fi（中心 AP+ORU，医院病房等），**不是"旁挂 AC"**；`dc_cfg_wlan_hs2_*`＝Hotspot2.0（`hotspot2-profile` → `network-type`/`hessid`/`network-authen-type` → 挂 VAP 模板）。

## 5 FAT AP 与胖瘦切换 / AP 生命周期

- FAT AP＝设备本机配 WLAN（无 capwap source、无 AP 组导入），适用 SOHO/AR 内置 AP：
  ```text
  wlan
   regulatory-domain-profile name default ; country-code cn
   security-profile name wlan-net ; security wpa2 psk pass-phrase <PSK密码> aes ; quit
   ssid-profile name wlan-net ; ssid wlan-net ; quit
   vap-profile name wlan-net
    service-vlan vlan-id 100                    # FAT 直接转发，业务 VLAN 本地交换
    security-profile wlan-net ; ssid-profile wlan-net
   quit
   ap-id 0
    regulatory-domain-profile default
    vap-profile wlan-net wlan 1 radio 0 ; vap-profile wlan-net wlan 1 radio 1
  display vap ssid wlan-net                     # Status=ON
  ```
  AR 内置 AP 通过内部 `VGE0/0/0` 口连接（AP 款型名含 W，如 AR5710-xxWxx），固化脚本带 `capwap source interface vlanif 4094`+`ap-group built_in_ap`+`ap-id 0`；WAC 模块可同时管理外部 Fit AP（FAT+FIT 混合扩展）。
- **胖瘦/预配置切换**（AP 上线参数，必须 commit）：
  ```text
  wlan ; provision-ap
   ap-mode { fit | fat | cloud }
   commit { ap-mac <m> | ap-id <i> | ap-group <g> | all }     # 不 commit 不生效（高频坑）
  display provision-ap parameter-list
  ```
  视图内还有 `address-mode { dhcp | static }`、`management-vlan`、`capwap dtls server-auth`。有误：`display ap non-fit-mode all` → `ap mode-switch fit ap-mac <mac>` 纠正。
- **AP 升级**：缺省 AC 模式（AC 带版本自动同步）；自动升级 `ap update update-filename <f> ap-type <id>`（**完成后 undo 该命令，防新上线老 AP 被降级**）；在线 `ap update load ap-id <i> update-filename <f>`；批量 `ap update multi-load / multi-reset`（可按信道 `partition` 错峰）；`display ap update status { all | downloading | failed | succeed }`。FTP/SFTP 模式：`ap update mode ftp-mode` + `ap update ftp-server ...`。
- **AP 增删改**：离线导入（`ap auth-mode mac-auth|sn-auth` + `ap-id ... ap-mac/ap-sn`，建议带 type-id）、不认证自动发现（`ap auth-mode no-auth`）、白名单（`ap whitelist mac/sn`）、手工确认（`display ap unauthorized record` → `ap-confirm { all | mac | sn }`）；黑名单 `ap blacklist mac`。换硬件免重配：`ap modify ap-id mac mac`；换组 `ap-regroup ap-id <i> new-group <g>`；AP 必须属于一个组（未指定进 default）。恢复出厂 `ap manufacturer-config ap-id <id>`；复位 `ap-reset { all | ap-id | ap-group }`。
- AP 掉线兜底登录：AP 系统模板开离线管理 VAP（`ap-system-profile name temporary-system` → `undo temporary-management disable` → 挂 AP 组），无线终端 Stelnet 到 AP（PSK＝capwap source 时设的第 4 项）。

## 6 AP 不上线排障

```text
display ap all                    # State 列；nor=正常；ExtraInfo P=供电不足
display ap unauthorized record    # 有记录＝认证模式挡了：加白名单或 ap-confirm
display ap online-fail-record all ; display ap offline-record all
display capwap configuration      # 源接口对不对
display ap-type undefined record  # AC 不认识该 AP 型号（升级 AC 版本或带 type-id）
display ap non-fit-mode all       # 被误切成 FAT/Cloud 模式
display wlan config-errors         # 模板互斥/类型不匹配类配置错误
display vap create-fail-record all
```
按序核对 11 个高频原因：
1. `capwap source interface` 未配/配错，或到 AP 网段无路由（补 `ip route-static`）。
2. **DTLS 默认开 → 首配 AP 必失败**：`capwap dtls no-auth enable` 放行，上线后立即 undo。
3. 跨网段没配 option43/中继（§1-3 命令）。
4. 直连口 PVID/allow-pass 没放管理 VLAN；隧道转发时错把业务 VLAN 也端到端放通。
5. capwap source 配置时 4 项凭据缺失被拒。
6. MAC/SN 认证未加白名单或未 `ap-confirm`；误入黑名单。
7. AC 不支持该 AP 型号。
8. 未配国家码/域管理模板（注意改 country-code 会清空信道功率并可能重启 AP）。
9. AP 上行口被配成 endpoint 模式（重启后必掉线）。
10. PoE 供电不足（ExtraInfo `P`）；AP 24h 未上线且无用户会自动重启（循环现象）。
11. `provision-ap` 配了没 `commit`（"配置看似存在但不生效"）。
- 彻底失联最后手段：AP 缺省管理 IP 169.254.1.1 —— 接入交换机配 `arp static 169.254.1.1 <AP的MAC>` + `interface Vlanif 1`+`ip address 169.254.1.100 24` + 直连口 `port trunk pvid vlan 1`，登录 AP 后 `interface GigabitEthernet 0/0/0`+`work-mode root` 或 `reset factory-configuration`。

## 7 主备与业务不中断

- **N+1 AC 备份**（S 系列包载；AR 包文档未见，勿套用）：
  ```text
  wlan ; ap-system-profile name apsys
   primary-access ip-address <主WAC-CAPWAP源地址>
   backup-access  ip-address <备WAC-CAPWAP源地址>    # 必须同时配、不能相同、须为 CAPWAP 源地址（经 NAT 填 NAT 后地址）
   quit
   ap-group name ap-group1 ; ap-system-profile apsys
  undo ac protect enable ; ap-reset all              # 需复位 AP 生效
  undo ac protect restore disable                    # 备机上启用回切
  display ac protect
  ```
  主备配置保持同步、系统时间保持一致。
- **WAC 故障业务逃生**：`keep-service enable`（全局=AP 系统模板，细粒度=VAP 模板，**VAP 优先级高；仅直接转发**；允许新接入仅适用于 Portal/MAC/开放/PSK/SAE/OWE 类认证；与离线管理 VAP、备份 VAP 互斥）；`type service-backup ap-offline`（独立逃生 SSID）；认证服务器故障备份 `type service-backup auth-server-down ...`。

## 8 官方部署建议摘编（WLAN 网规/配置，全表见官网链接）

- 信道：手动规划或开自动调优（缺省开，间隔 1440min）；双 5G 射频两个信道至少隔一个信道（36/44/52/60 例：36 配了另一个用 52/60 不用 44）。
- 功率：AP 发射功率略高于终端发射功率保上下行平衡；严守当地 EIRP；同频 AP 不可见但覆盖有交集 → `rts-cts` 模式解隐藏节点。
- 覆盖：砖墙/木隔墙隔一间放一个 AP，金属/混凝土每间一个；室内室外不得用同一台室外 AP；边缘场强 -70dBm；室分 AP 不正对走廊双侧同放。
- 漫游：终端主动性差配智能漫游/强制低信号下线；频繁移动场景调低 STA 关联老化时间与 DHCP 租期。
- SSID 多时调大 beacon 间隔（约 SSID 数一半×100ms，100~500ms）；组播报文必须抑制（直接转发配在直连交换机口，隧道转发配在 AC 流量模板）。
- 规划：大规模用 AC+Fit AP，FAT AP 只限 SOHO 小范围；AP 按组网规则命名；高容量场景中心 AP+RU。
- 其他：新版本优先升级；AP 升级文件名与文件系统严格一致；Web 网管包版本必须与设备软件版本配套。
- 来源：<https://support.huawei.com/hedex/api/pages/EDOC1100064375/AZI0130Q/08/resources/dc/dc_wlan_planning_0022.html>

## 9 AR 内置 WAC vs S 系列内置 WAC

| 维度 | AR | S 系列 |
|---|---|---|
| 内置 AP | 名含 W 的款型内置 Fit AP 模块（内部 `VGE0/0/0` 口，FAT 形态运行，WAC 模块兼管外部 Fit AP） | 无内置 AP |
| 端口/视图 | `10ge`/`MultiGE`/`VGE`；WAN 口直接 `undo portswitch`+IP | `10GE1/0/x`；二三层口互换仅部分系列（switch.md） |
| 独有文档族 | `*_fatap` 平行文档族 | `galaxy_ssid_management_cfg`（离线管理 SSID/定时关 VAP）、DAP/Hotspot2.0/N+1 备份举例 |
| N+1 备份 | 本包文档未见（≠不支持，勿凭猜配） | `dc_cfg_wlan_reliab_*` 全套 |
| 命令一致性 | capwap source / ap auth-mode / 模板体系 / provision-ap+commit / mode-switch / band-steer / CAC 两包一致 | 同左 |
