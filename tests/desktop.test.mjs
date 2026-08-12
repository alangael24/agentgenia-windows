import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const contracts = require("../desktop/dist/contracts.cjs");

test("ships the complete connector catalog", () => {
  const ids = contracts.CONNECTOR_CATALOG.map((item) => item.id);
  assert.equal(ids.length, 49);
  for (const id of [
    "google-workspace", "slack", "notion", "salesforce", "microsoft-365",
    "linkedin", "zoom", "github", "jira", "figma", "hubspot", "canva",
    "linear", "asana", "clickup", "shopify", "stripe", "quickbooks",
    "vercel", "snowflake", "databricks", "mailchimp"
  ]) assert.ok(ids.includes(id), `missing connector ${id}`);
});

test("renders a bundled brand logo for every plugin", async () => {
  const [renderer, bundledLogos] = await Promise.all([
    readFile(new URL("../desktop/src/renderer.ts", import.meta.url), "utf8"),
    readFile(new URL("../desktop/src/connector-logo-data.ts", import.meta.url), "utf8")
  ]);
  const simpleIconIds = new Set(
    [...renderer.matchAll(/^  ([a-z0-9]+): si[A-Za-z0-9]+,$/gm)].map((match) => match[1])
  );
  const bundledIconIds = new Set(
    [...bundledLogos.matchAll(/^  "([a-z0-9]+)": "data:image\//gm)].map((match) => match[1])
  );
  const missing = [...new Set(contracts.CONNECTOR_CATALOG.map((item) => item.icon))]
    .filter((iconId) => !simpleIconIds.has(iconId) && !bundledIconIds.has(iconId));
  assert.deepEqual(missing, []);
});

test("normalizes persisted bot and connector state", () => {
  assert.deepEqual(
    contracts.normalizeConnectorIds(["slack", "slack", "fake", "shopify", 42]),
    ["slack", "shopify"]
  );
  const state = contracts.normalizeAppState({
    onboardingCompleted: true,
    selectedConnectorIds: ["github", "fake"],
    activeBotId: "bot-1",
    bots: [{
      id: "bot-1",
      name: "  Mi   bot  ",
      color: "#2f91f5",
      shape: "circle",
      connectorIds: ["github", "fake"],
      createdAt: "2026-08-11T00:00:00.000Z"
    }]
  });
  assert.equal(state.bots[0].name, "Mi bot");
  assert.deepEqual(state.bots[0].connectorIds, ["github"]);
  assert.equal(state.activeBotId, "bot-1");
});

test("keeps first-bot onboarding and creates later bots immediately", async () => {
  const renderer = await readFile(new URL("../desktop/src/renderer.ts", import.meta.url), "utf8");
  assert.match(renderer, /async function createDefaultBot\(\): Promise<void>/);
  assert.match(renderer, /if \(!state\.bots\.length\)[\s\S]{0,180}activeView = "bot-builder"/);
  assert.match(renderer, /name: "Nuevo bot",\s+color: BOT_COLORS\[6\],\s+shape: BOT_SHAPES\[0\]/);
  assert.match(renderer, /class="bot-avatar-trigger"[^>]*data-open-settings/);
  assert.doesNotMatch(renderer, /class="traffic-lights"/);
  assert.match(renderer, /class="sidebar-window-name"/);
});

test("keeps the plugin marketplace and derives Yours from installed plugins", async () => {
  const renderer = await readFile(new URL("../desktop/src/renderer.ts", import.meta.url), "utf8");
  assert.match(renderer, /data-plugin-tab="marketplace"/);
  assert.match(renderer, /data-plugin-tab="yours"/);
  assert.match(renderer, /CONNECTOR_CATALOG\.filter\(\(connector\) => selectedConnectorIds\.has\(connector\.id\)\)/);
});

test("isolates the renderer and keeps all secrets in the main process", async () => {
  const [main, preload, html, oauth] = await Promise.all([
    readFile(new URL("../desktop/src/main.ts", import.meta.url), "utf8"),
    readFile(new URL("../desktop/src/preload.ts", import.meta.url), "utf8"),
    readFile(new URL("../desktop/renderer/index.html", import.meta.url), "utf8"),
    readFile(new URL("../desktop/src/oauth.ts", import.meta.url), "utf8")
  ]);
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /setAppUserModelId\("com\.agentgenia\.desktop"\)/);
  assert.match(main, /autoHideMenuBar:\s*true/);
  assert.match(main, /https:\/\/agentgenia-api\.onrender\.com/);
  assert.match(main, /https:\/\/outcome-service\.onrender\.com/);
  assert.match(preload, /contextBridge\.exposeInMainWorld\("wrapperDesktop"/);
  assert.doesNotMatch(preload, /access_token|refresh_token|client_secret|STRIPE_SECRET_KEY/);
  assert.match(html, /connect-src 'none'/);
  assert.match(oauth, /safeStorage\.encryptString/);
  assert.match(oauth, /safeStripeUrl/);
});

test("contains no backend or Pi harness implementation", async () => {
  const sources = await Promise.all([
    readFile(new URL("../desktop/src/main.ts", import.meta.url), "utf8"),
    readFile(new URL("../desktop/src/preload.ts", import.meta.url), "utf8"),
    readFile(new URL("../desktop/src/renderer.ts", import.meta.url), "utf8")
  ]);
  for (const source of sources) assert.doesNotMatch(source, /pi_harness|go_backend|pi-chrome/);
});

test("configures a per-user x64 NSIS installer", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.build.appId, "com.agentgenia.desktop");
  assert.equal(packageJson.build.win.target[0].target, "nsis");
  assert.deepEqual(packageJson.build.win.target[0].arch, ["x64"]);
  assert.equal(packageJson.build.nsis.perMachine, false);
  assert.equal(packageJson.build.nsis.oneClick, false);
  assert.match(packageJson.build.artifactName, /^AgentGenia-Setup-/);
});

test("uses Windows-safe file URL conversion in the build script", async () => {
  const buildScript = await readFile(new URL("../desktop/build.mjs", import.meta.url), "utf8");
  assert.match(buildScript, /fileURLToPath/);
  assert.doesNotMatch(buildScript, /\.pathname/);
});
