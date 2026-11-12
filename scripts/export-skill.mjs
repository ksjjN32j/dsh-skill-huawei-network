import { mkdirSync, writeFileSync, rmSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// 从 assets/（单一事实来源）导出"纯 skill 形态"目录：带 frontmatter 的 SKILL.md + references/。
// 用法: node scripts/export-skill.mjs [输出目录]   →  默认 ./dist/huawei-network-config
// 拿到后 cp -r dist/huawei-network-config ~/.dsh/skills/ 即可（不要与插件版同时安装）。
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = process.argv[2] || join(ROOT, "dist", "huawei-network-config");
const body = new URL("../assets/huawei-network-config.md", import.meta.url);
const { readFileSync } = await import("node:fs");

const desc = "华为 VRP 设备通用配置与作业规范：NetEngine AR 路由器（AR5700/6700/8000）、S 系列交换机（S5735/S5755/S6730/S6750/S6780 等）、WAC/AC+AP 无线（Fit AP、FAT AP、SSID/安全/漫游/高密）。做 VLAN、trunk、STP、Eth-Trunk、VRRP、DHCP(option43)、静态路由、OSPF、NAT、IPv6 RA+PD、SSH 管理面、AP 开局上线、VAP 模板、无线排障、脚本化变更时使用。命令按 V600R025 官方文档逐字核对，含版本差异表与防编造清单（老手册命令在本代已失效/改写的条目）。";

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
writeFileSync(
	join(OUT, "SKILL.md"),
	`---\nname: huawei-network-config\ndescription: ${desc}\n---\n\n${readFileSync(fileURLToPath(body), "utf8")}`,
);
cpSync(join(ROOT, "assets", "references"), join(OUT, "references"), { recursive: true });
console.log("exported skill form →", OUT);
