import { defineConfig, devices } from "@playwright/test";
// tsconfig.node 에 @types/node 가 없어 process 만 선언(설정 파일은 node 에서 돈다)
declare const process: { env: Record<string, string | undefined> };

// 포트·워커는 환경변수로: PW_PORT=1431 PW_WORKERS=2 npx playwright test ...
const port = Number(process.env.PW_PORT ?? 1420);
const url = `http://localhost:${port}`;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  // CLI --workers가 이 값보다 우선. 기본 2(메모리 보호)
  workers: Number(process.env.PW_WORKERS ?? 2),
  use: { baseURL: url, locale: "en-US" },
  // 실제 GPU로 WebGL(WebView2와 같게). 없으면 headless가 SwiftShader(소프트웨어)로 그려 rAF 중앙값이 66ms로 나옴
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions: { args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] } } }],
  globalSetup: "./playwright.global-setup.ts", // vite 기동·종료 (webServer 대신, 이유는 그 파일 주석)
});
