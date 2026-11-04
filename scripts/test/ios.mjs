import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawnSync } from "node:child_process";
const root = process.cwd(),
  out = path.join(root, "build/ios");
fs.mkdirSync(out, { recursive: true });
const device = process.argv[2];
const modelVersion =
  process.argv[3] ??
  JSON.parse(fs.readFileSync("manifest.json", "utf8")).version;
if (!/^\d+\.\d+\.\d+$/.test(modelVersion))
  throw Error("Use a published model-data version x.y.z");
if (!device) throw Error("Pass an existing iOS Simulator UDID");
function command(args, options = {}) {
  const p = spawnSync(args[0], args.slice(1), { encoding: "utf8", ...options });
  if (p.status !== 0) throw Error(p.stderr || p.stdout || String(p.error));
  return p.stdout.trim();
}
const sdk = command(["xcrun", "--sdk", "iphonesimulator", "--show-sdk-path"]);
const app = path.join(out, "SoftMatchaQA.app");
fs.mkdirSync(app, { recursive: true });
const executable = path.join(app, "SoftMatchaQA");
const arch = process.arch === "arm64" ? "arm64" : "x86_64";
command([
  "xcrun",
  "--sdk",
  "iphonesimulator",
  "swiftc",
  "-parse-as-library",
  "-target",
  `${arch}-apple-ios18.6-simulator`,
  "-sdk",
  sdk,
  "-module-cache-path",
  path.join(out, "module-cache"),
  "-framework",
  "UIKit",
  "-framework",
  "WebKit",
  "tests/ios/App.swift",
  "-o",
  executable,
]);
const info = {
  CFBundleIdentifier: "dev.softmatcha.ios-qa",
  CFBundleName: "SoftMatchaQA",
  CFBundleExecutable: "SoftMatchaQA",
  CFBundlePackageType: "APPL",
  CFBundleVersion: "1",
  CFBundleShortVersionString: "1.0",
  MinimumOSVersion: "18.6",
  LSRequiresIPhoneOS: true,
  UILaunchScreen: {},
  NSAppTransportSecurity: {
    NSAllowsLocalNetworking: true,
    NSAllowsArbitraryLoadsInWebContent: true,
  },
};
const plist = path.join(out, "info.json");
fs.writeFileSync(plist, JSON.stringify(info));
command([
  "plutil",
  "-convert",
  "xml1",
  "-o",
  path.join(app, "Info.plist"),
  plist,
]);
command(["codesign", "--force", "--sign", "-", app]);
const state = JSON.parse(
  command(["xcrun", "simctl", "list", "devices", "--json"]),
);
if (
  !Object.values(state.devices)
    .flat()
    .find((d) => d.udid === device && d.state === "Booted")
)
  command(["xcrun", "simctl", "boot", device]);
command(["xcrun", "simctl", "bootstatus", device, "-b"]);
command(["xcrun", "simctl", "install", device, app]);
const data = command([
  "xcrun",
  "simctl",
  "get_app_container",
  device,
  "dev.softmatcha.ios-qa",
  "data",
]);
const documents = path.join(data, "Documents");
fs.mkdirSync(documents, { recursive: true });
const resultFile = path.join(documents, "results.json");
if (fs.existsSync(resultFile)) fs.unlinkSync(resultFile);
const worker = await build({
  entryPoints: ["src/infrastructure/worker/search-worker.ts"],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: "es2020",
  loader: { ".wasm": "binary" },
  define: { "import.meta.url": '""' },
});
const suite = await build({
  entryPoints: ["tests/ios/suite.ts"],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: "es2020",
  plugins: [
    {
      name: "ios-host",
      setup(b) {
        b.onResolve({ filter: /^obsidian$/ }, () => ({
          path: "obsidian",
          namespace: "host",
        }));
        b.onLoad({ filter: /.*/, namespace: "host" }, () => ({
          contents:
            "export const requestUrl=(args)=>globalThis.nativeModelRequest(args)",
        }));
        b.onResolve({ filter: /^softmatcha-worker-source$/ }, () => ({
          path: "worker",
          namespace: "worker",
        }));
        b.onLoad({ filter: /.*/, namespace: "worker" }, () => ({
          contents: `export default ${JSON.stringify(worker.outputFiles[0].text)}`,
        }));
      },
    },
  ],
});
const html = `<!doctype html><meta name="viewport" content="width=device-width"><style>body{font:14px system-ui;white-space:pre-wrap;padding:12px}</style><body>Running iOS WebKit tests…<script>globalThis.qaModelVersion=${JSON.stringify(modelVersion)}</script><script src="/suite.js"></script>`;
const server = http.createServer((req, res) => {
  if (req.url === "/") {
    res.setHeader("Content-Type", "text/html");
    res.end(html);
    return;
  }
  if (req.url === "/suite.js") {
    res.setHeader("Content-Type", "application/javascript");
    res.end(suite.outputFiles[0].contents);
    return;
  }
  if (/^\/downloads\/model-\d+\.zip$/.test(req.url ?? "")) {
    const file = path.join(documents, path.basename(req.url));
    if (fs.existsSync(file)) {
      res.setHeader("Content-Type", "application/zip");
      fs.createReadStream(file).pipe(res);
      return;
    }
  }
  res.writeHead(404);
  res.end();
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
try {
  const port = server.address().port;
  command([
    "xcrun",
    "simctl",
    "launch",
    device,
    "dev.softmatcha.ios-qa",
    `http://127.0.0.1:${port}/`,
  ]);
  const deadline = Date.now() + 240000;
  while (!fs.existsSync(resultFile) && Date.now() < deadline)
    await new Promise((r) => setTimeout(r, 1000));
  if (!fs.existsSync(resultFile)) throw Error("iOS Simulator test timed out");
  const result = JSON.parse(fs.readFileSync(resultFile, "utf8"));
  fs.writeFileSync(
    path.join(out, "results.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  command([
    "xcrun",
    "simctl",
    "io",
    device,
    "screenshot",
    path.join(out, "screenshot.png"),
  ]);
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
} finally {
  server.close();
  command(["xcrun", "simctl", "terminate", device, "dev.softmatcha.ios-qa"]);
}
