import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const GIT_URL = process.env.MARKET_GIT_URL || "https://github.com/OWNER/dsh-skill-huawei-network.git";
const commit = execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();

const index = {
	format: 1,
	title: { zh: "社区插件索引（网络运维）", en: "Community plugin index (network ops)" },
	description: { zh: "华为网络配置技能包等社区 DSH 组合包。", en: "Community DSH bundles, incl. Huawei network config skill." },
	plugins: [
		{
			name: pkg.name,
			title: { "zh": "华为网络配置技能包", en: "Huawei Network Config Skill" },
			description: {
				"zh": "华为 AR 路由器 / S 系列交换机 / AC+AP 无线通用配置速查（V600R025 官方文档逐字核对）：VLAN/STP/NAT/DHCP/IPv6/SSH/AP 开局与排障，含版本差异与防编造清单。",
				en: "General Huawei VRP config cheat-sheet skill for AR routers, S-series switches and AC+AP WLAN (verified against V600R025 docs).",
			},
			author: process.env.MARKET_AUTHOR || "ksjjN32j",
			keywords: ["huawei", "vrp", "network", "wlan", "skill"],
			categories: ["skills"],
			homepage: GIT_URL.replace(/\.git$/, ""),
			repository: { type: "git", url: GIT_URL },
			versions: [
				{
					version: pkg.version,
					publishTimestamp: Number(execSync(`git log -1 --format=%ct ${commit}`, { cwd: ROOT }).toString().trim()),
					source: { type: "git", url: GIT_URL, commit },
				},
			],
		},
	],
};

mkdirSync(join(ROOT, "market"), { recursive: true });
writeFileSync(join(ROOT, "market", "index.json"), JSON.stringify(index, null, "	") + "\n");
console.log("written market/index.json (commit", commit.slice(0, 8) + ")");

const validatorPath = process.env.MARKET_VALIDATOR || "/home/hdu-ailab/.npm-global/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-plugin-market-index/lib/index.js";
const { parseMarketIndex, marketInstallTarget } = await import(pathToFileURL(validatorPath).href);
const url = "https://example.com/market/index.json";
const parsed = parseMarketIndex(JSON.parse(JSON.stringify(index)), url);
console.log("validator OK:", parsed.plugins[0].name, "install =", marketInstallTarget(parsed.plugins[0].name, parsed.plugins[0].versions[0]));
