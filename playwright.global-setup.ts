import { spawn } from "node:child_process";

// webServer 대신 직접 띄움: Playwright는 쉘(cmd /c)로 감싸 Windows에서 vite가 안 죽고 종료가 멈춘다.
// shell 없이 node가 vite를 바로 실행 → child.kill()이 곧 vite 종료.
export default async function globalSetup() {
  const port = Number(process.env.PW_PORT ?? 1420);
  const url = `http://localhost:${port}`;
  if (await up(url)) return; // 이미 떠 있으면 재사용(종료도 안 함)
  const child = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--port", String(port), "--strictPort"], { stdio: "ignore" });
  const deadline = Date.now() + 60_000;
  while (!(await up(url))) {
    if (child.exitCode !== null || Date.now() > deadline) {
      child.kill();
      throw new Error(`vite가 ${url}에서 안 떴다(포트 사용 중이거나 시간 초과)`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return () => {
    child.kill();
  };
}

const up = (url: string) => fetch(url).then((r) => r.ok, () => false);
