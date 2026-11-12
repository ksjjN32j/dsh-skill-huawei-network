# @hdu/dsh-skill-huawei-network

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）技能组合包：给 Agent 装载一份**华为 VRP 设备通用配置速查**技能，覆盖 NetEngine AR 路由器、S 系列交换机与 WAC/AC+AP 无线开局与排障。

## 内容

技能 `huawei-network-config`，按任务路由加载（渐进披露，不一次灌满上下文）：

- 主文：8 条作业铁律（变更前快照、禁止 SSH 驱动 portswitch 变更、rollback 不可当兜底等）＋ 12 项 **V600R025 与老手册差异表**（`arp broadcast enable`、`nat outbound` 等已失效/改写的命令）＋ 通用验证口径；
- `references/switch.md`：VLAN/端口类型、STP/MSTP、Eth-Trunk、VRRP、DHCP(option43)、OSPF、AAA/SSH、接入交换机开局十步；
- `references/router-ar.md`：单臂子接口、静态路由、OSPF、NAT 策略模型、DHCPv4、IPv6 RA/DHCPv6/PD、PPPoE、OPS 本地脚本、配置回退、AR 开局七步；
- `references/wlan-ac-ap.md`：AC+WAC 组网规划、Fit AP 完整开局命令链、模板体系（WPA2/WPA3/1X/转发模式）、漫游/RRM/5G 优先/高密、FAT AP 与胖瘦切换、AP 不上线 11 条排障、N+1 主备与逃生、官方部署建议摘编；
- `references/troubleshooting.md`：分层排障方法论（含 v4 故障 v6 正常类不对称故障指纹、DHCP no-lease、登不上设备、变更后失联）。

所有命令按 **V600R025C00 官方文档包逐字核对**（`[文档]`），部分标注现网验证（`[实测]`）；本代文档中不存在的命令集中列入**防编造清单**（`[文档未见]`），阻止 Agent 照抄老手册。

## 安装

方式一（本地目录，开发/自用）：

```bash
dsh plugin --profile web add link:/path/to/dsh-skill-huawei-network
```

方式二（插件市场）：把本仓库发布的索引 URL 添加到 DSH Web「发现」页的插件市场索引源，搜索 `huawei` 安装。索引由 `scripts/make-index.mjs` 生成（发布流程见下）。

纯 skill 形态（不想装插件的人）：`node scripts/export-skill.mjs` 生成带 frontmatter 的技能目录，`cp -r dist/huawei-network-config ~/.dsh/skills/` 即可。**与插件版二选一安装**（同名时本地文件层会遮蔽插件版）。

安装后**无需任何配置**，新会话的可用技能目录中即出现 `huawei-network-config`。

## 发布流程（维护者）

```bash
npm test                       # provider 自检
node scripts/make-index.mjs    # 生成 market/index.json（含当前 commit 的 git 安装目标）
# 推送 GitHub → 开启 Pages → 索引 URL 即 https://<user>.github.io/<repo>/market/index.json
```

市场安装走 git 固定提交（`git+...#<commit>`），不需要 npm 账号；若已发布到 npm，可在 `make-index.mjs` 里切换为 npm 来源。

## 免责声明

- 本项目为非官方社区作品；HUAWEI、华为、NetEngine 为华为技术有限公司商标。
- 技能内容系对华为公开产品文档（support.huawei.com，V600R025C00 文档包）与公开部署建议的**提炼与笔记**，示例 IP/凭据均为文档实验值或占位符，不含任何真实网络信息。
- 适用性以对应版本官方文档为准；对设备做任何变更前请自行核对并备份。
- MIT License。
