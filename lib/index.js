import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
//#region lib/types/index.js
/**
 * Bundled `huawei-network-config` skill provider.
 *
 * Ships a general-purpose Huawei VRP configuration skill (AR routers,
 * S-series switches, WAC/AC+AP WLAN; commands verified verbatim against
 * V600R025C00 official documentation) plus reference files resolved from
 * the package `assets/` directory.
 *
 * @module @hdu/dsh-skill-huawei-network
 */
const PROVIDER_NAME = "huawei-network";
const SKILL_BODY_URL = new URL("../assets/huawei-network-config.md", import.meta.url);
const RESOURCE_BASE = {
	kind: "directory",
	path: fileURLToPath(new URL("../assets/", import.meta.url)),
};
const CANDIDATE = {
	name: "huawei-network-config",
	description: "华为 VRP 设备通用配置与作业规范：NetEngine AR 路由器（AR5700/6700/8000）、S 系列交换机（S5735/S5755/S6730/S6750/S6780 等）、WAC/AC+AP 无线（Fit AP、FAT AP、SSID/安全/漫游/高密）。做 VLAN、trunk、STP、Eth-Trunk、VRRP、DHCP(option43)、静态路由、OSPF、NAT、IPv6 RA+PD、SSH 管理面、AP 开局上线、VAP 模板、无线排障、脚本化变更时使用。命令按 V600R025 官方文档逐字核对，含版本差异表与防编造清单（老手册命令在本代已失效/改写的条目）。",
	invocation: {
		modelInvocable: true,
		userInvocable: true,
	},
	provider: PROVIDER_NAME,
	source: "bundled",
	resourceBase: RESOURCE_BASE,
	rank: 600, // BUNDLED_SKILL_RANK
	locator: SKILL_BODY_URL,
};
const provider = {
	name: PROVIDER_NAME,
	list: () => Promise.resolve([CANDIDATE]),
	async get(_candidate) {
		return {
			name: CANDIDATE.name,
			description: CANDIDATE.description,
			invocation: CANDIDATE.invocation,
			provider: PROVIDER_NAME,
			source: "bundled",
			resourceBase: RESOURCE_BASE,
			content: await readFile(SKILL_BODY_URL, "utf8"),
		};
	},
};
/** Cordis plugin name. */
const name = "skill-huawei-network";
/** Service required by the bundled provider. */
const inject = ["skills"];
/** Register the bundled `huawei-network-config` provider on `ctx.skills`. */
function apply(ctx) {
	ctx.skills.registerProvider(() => provider);
}
//#endregion
export { apply, inject, name };
