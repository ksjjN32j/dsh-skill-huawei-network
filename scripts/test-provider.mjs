import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { apply, inject, name } from "../lib/index.js";

assert.equal(typeof apply, "function");
assert.equal(name, "skill-huawei-network");
assert.deepEqual(inject, ["skills"]);

let registered;
apply({ skills: { registerProvider: (f) => { registered = f(); } } });
assert.ok(registered && registered.name === "huawei-network");

const list = await registered.list();
assert.equal(list.length, 1);
assert.equal(list[0].name, "huawei-network-config");

const skill = await registered.get(list[0]);
assert.ok(skill.content.includes("作业铁律"), "body contains core rules");
assert.ok(!skill.content.includes("huawei-vrp-cutover"), "public copy: no private skill refs");
for (const ref of ["switch.md", "router-ar.md", "wlan-ac-ap.md", "troubleshooting.md"]) {
	await access(join(skill.resourceBase.path, "references", ref));
}
console.log("provider self-test OK:", list[0].name, "body", skill.content.length, "chars");
