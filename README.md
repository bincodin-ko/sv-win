# Symvibe for Windows (unofficial)

Windows용 무한 보드 위에서 여러 AI 코딩 에이전트(Claude Code·Codex 등) 터미널을 띄우고 지휘하는 데스크톱 앱입니다. Tauri 2 + React + xterm.js.

> 비공식 개인 프로젝트입니다. 원본 macOS 앱 Symvibe의 제작사와 관계가 없습니다.

## 설치
[Releases](../../releases)에서 `Symvibe_*_x64-setup.exe`를 받아 실행하세요(현재 사용자 설치, 관리자 권한 불필요). 사용 설명서는 `docs/사용설명서.html`.

## 개발
```
npm install
npm run tauri dev
npm test && cargo test --manifest-path src-tauri/Cargo.toml
```
