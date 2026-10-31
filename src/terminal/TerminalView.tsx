import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { askPasteCheck } from "../console/PasteCheck";
import { altPlain, imeKeyBlocked, isStrayPaste, joinOneLine, mapKey, pasteLineCount, sanitizePaste } from "./input";
import { hookIme } from "./ime";
import { fixImeSpot } from "./imeSpot";
import { fontSizeFor, zoomFont } from "./textSize";
import { termTheme, type Mode } from "../theme/palette";
import { useSettings } from "../settings/useSettings";
import { isLowSpec } from "../perf/lowSpec";
import { createGlGate, scrollbackFor } from "./perf";

const globalSize = () => Number(useSettings.getState().s.textSize) || 100; // S-363
import { useUnicode11 } from "./unicode";
import { debugTerms, isTauri, ptyKill, ptyResize, ptySpawn, ptyWrite } from "../lib/ipc";

// ---- WebGL: 화면에 보이는 터미널만, 동시에 최대 12개(S-074. WebView2 문맥 한도 16). 못 얻은 보이는 터미널은 자리가 나길 기다린다.
export const MAX_WEBGL = 12;
let glActive = 0;
const waiting = new Set<() => void>();
export const webglActive = () => glActive;
if (typeof window !== "undefined" && !isTauri()) Object.assign(window, { __webglActive: webglActive });

/** WebGL 렌더러를 붙이고 떼는 함수를 돌려준다. 자리가 없거나 실패하거나 문맥을 잃으면 DOM 렌더러로 남는다. */
export function attachWebgl(term: Terminal): () => void {
  if (glActive >= MAX_WEBGL) return () => {};
  let gl: WebglAddon | null = null;
  const release = () => {
    if (!gl) return;
    const g = gl;
    gl = null;
    try {
      g.dispose();
    } catch {
      /* 이미 해제됨 */
    }
    glActive--;
    waiting.forEach((w) => w()); // 자리가 났다
  };
  try {
    gl = new WebglAddon();
    gl.onContextLoss(release); // 문맥을 잃으면 DOM 으로 내려간다
    term.loadAddon(gl);
    glActive++;
    // 222번: WebGL 은 캔버스 크기를 화면 배율 무시(device-pixel-content-box)로 다시 맞춘다 → 보드 줌 배율(dpr/창 dpr)을 곱해 덮어쓴다
    const core = (term as unknown as { _core?: { _coreBrowserService?: { dpr: number }; _renderService?: { _renderer?: { value?: unknown } } } })._core;
    const r = core?._renderService?._renderer?.value as { _setCanvasDevicePixelDimensions?: (w: number, h: number) => void } | undefined;
    const set = r?._setCanvasDevicePixelDimensions?.bind(r);
    if (r && set) r._setCanvasDevicePixelDimensions = (w, h) => { const k = (core?._coreBrowserService?.dpr ?? 1) / window.devicePixelRatio; set(Math.round(w * k), Math.round(h * k)); };
  } catch {
    try {
      gl?.dispose();
    } catch {
      /* 무시 */
    }
    gl = null;
  }
  return release;
}

export interface TermHandle {
  term: Terminal;
  /** 지금 크기에 맞춰 cols/rows 다시 계산(바뀌었으면 term.onResize 가 난다) */
  fit: () => void;
  /** S-073: 글자 크기 배율(%) 적용. null = 전역(100) */
  setTextSize: (pct: number | null) => void;
  /** 141번 멈춤(PAUSED): 켜면 cols/rows 를 그대로 두고 칸 크기에 맞춰 글꼴만 키운다(멈춘 프로그램은 새 크기로 다시 못 그린다). 끄면 원래 글꼴로 맞춘다 */
  freeze: (on: boolean) => void;
  dispose: () => void;
}

const curMode = (): Mode => (document.documentElement.getAttribute("data-theme") === "light" ? "light" : "og"); // S-411
const FIT_MS = 30; // S-063: 끄는 중 최대 30ms 마다

/** xterm 하나를 el 안에 만든다. 링크 애드온 없음, 창 제목·OSC 52 무시(S-108), 스크롤백 1만(S-106, 저사양 3000). */
export function createTerminal(el: HTMLElement): TermHandle {
  const term = new Terminal({ allowProposedApi: true, scrollback: scrollbackFor(isLowSpec()), fontFamily: '"Cascadia Mono", Consolas, monospace', fontSize: fontSizeFor(null, globalSize()), theme: termTheme(curMode()), cursorStyle: "bar", cursorInactiveStyle: "bar", cursorBlink: true, linkHandler: { activate() {}, hover() {}, allowNonHttpProtocols: false } }); // OSC 8 링크도 눌리지 않는다(S-108) // S-134
  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  useUnicode11(term); // 이모지 폭을 Claude 와 같게(y8)
  term.open(el);
  for (const ident of [0, 1, 2, 8, 52]) term.parser.registerOscHandler(ident, () => true); // 제목 0·1·2, 하이퍼링크 8, 클립보드 52: 처리한 것으로 치고 버림
  fixScaledMouse(term);
  const unsharp = sharpOnZoom(term, el);
  const unhook = hookInput(term);
  let font = term.options.fontSize!; // 멈춤이 아닐 때의 글꼴
  let frozen: { w: number; h: number; f: number } | null = null; // 멈춘 순간의 화면 크기와 글꼴
  const fit = () => {
    if (el.clientWidth <= 0 || el.clientHeight <= 0) return;
    if (!frozen) return fitAddon.fit();
    const s = el.querySelector<HTMLElement>(".xterm-screen");
    if (!frozen.w && s?.offsetWidth) frozen = { w: s.offsetWidth, h: s.offsetHeight, f: frozen.f }; // 숨어 있다가 처음 보일 때 잰다
    if (!frozen.w) return;
    term.options.fontSize = zoomFont(frozen.f, frozen.w, frozen.h, el.clientWidth, el.clientHeight);
    // 글자 폭이 글꼴에 딱 비례하지 않아 몇 % 넘칠 수 있다 → 그려진 뒤 재서 0.5px 씩 줄인다(최대 8번)
    let tries = 8;
    const trim = () => {
      if (!frozen || !s || tries-- <= 0) return;
      if ((s.offsetWidth > el.clientWidth || s.offsetHeight > el.clientHeight) && term.options.fontSize! > 6) {
        term.options.fontSize = term.options.fontSize! - 0.5;
        requestAnimationFrame(trim);
      }
    };
    requestAnimationFrame(trim);
  };
  fit();
  // S-411: 테마가 바뀌면 팔레트만 갈아 끼운다(세션·버퍼 그대로)
  const themeObs = new MutationObserver(() => { term.options.theme = termTheme(curMode()); });
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  // WebGL: 보이면 켜고, 안 보인 지 10초가 지나야 끈다(P2: 팬하다 잠깐 나갔다 들어오는 콘솔이 문맥을 버렸다 다시 만들지 않게). 화면 둘레 50% 까지는 보이는 것으로 친다
  let visible = false;
  const gate = createGlGate(() => (glActive < MAX_WEBGL ? attachWebgl(term) : null));
  const retry = () => gate.set(visible); // 다른 터미널이 자리를 놓으면 보이는데 못 얻은 터미널이 다시 시도
  waiting.add(retry);
  const io = new IntersectionObserver(
    (es) => {
      visible = es[es.length - 1]?.isIntersecting ?? false;
      gate.set(visible, !visible && el.getClientRects().length === 0); // display:none(숨은 워크스페이스)이면 바로 뗀다
    },
    { rootMargin: "50%" },
  );
  io.observe(el);

  // 크기 변화: 첫 변화는 바로, 이어지는 변화는 30ms 마다 마지막 값으로
  let last = 0;
  let timer: number | undefined;
  const ro = new ResizeObserver(() => {
    const now = performance.now();
    if (now - last >= FIT_MS) {
      last = now;
      fit();
    } else if (timer === undefined) {
      timer = window.setTimeout(() => {
        timer = undefined;
        last = performance.now();
        fit();
      }, FIT_MS - (now - last));
    }
  });
  ro.observe(el);

  return {
    term,
    fit,
    setTextSize: (pct) => {
      font = fontSizeFor(pct, globalSize()); // S-073: 바뀌면 fit → onResize → PTY resize
      if (!frozen) term.options.fontSize = font; // 멈춘 동안엔 재개할 때 적용
      fit();
    },
    freeze: (on) => {
      if (on === !!frozen) return;
      if (on) {
        const s = el.querySelector<HTMLElement>(".xterm-screen");
        frozen = { w: s?.offsetWidth ?? 0, h: s?.offsetHeight ?? 0, f: font };
      } else {
        frozen = null;
        term.options.fontSize = font;
      }
      fit();
    },
    dispose: () => {
      ro.disconnect();
      io.disconnect();
      themeObs.disconnect();
      clearTimeout(timer);
      waiting.delete(retry);
      gate.dispose();
      unhook();
      unsharp();
      term.dispose();
    },
  };
}

/** 우클릭(button 2) mousedown/mouseup 을 xterm 보다 먼저 잡아 마우스 보고(ESC[<2;..M)가 PTY 로 안 가게 한다. contextmenu 는 막지 않는다(메뉴용). */
export function guardRightMouse(root: HTMLElement | undefined): () => void {
  const stop = (e: MouseEvent) => { if (e.button === 2) e.stopPropagation(); };
  root?.addEventListener("mousedown", stop, true);
  root?.addEventListener("mouseup", stop, true);
  return () => { root?.removeEventListener("mousedown", stop, true); root?.removeEventListener("mouseup", stop, true); };
}

/** S-131·S-133: 콘솔 안 키와 붙여넣기. 돌려주는 함수로 해제한다. */
function hookInput(term: Terminal): () => void {
  const paste = async (raw: string) => {
    const text = sanitizePaste(raw);
    if (!text) return;
    if (term.modes.bracketedPasteMode || pasteLineCount(text) < 2) return term.paste(text);
    const c = await askPasteCheck(pasteLineCount(text));
    if (c === "lines") term.paste(text);
    else if (c === "oneLine") term.paste(joinOneLine(text));
    term.focus();
  };
  term.attachCustomKeyEventHandler((ev) => {
    if (ev.type === "keydown" && imeKeyBlocked(ev)) return false; // 조합 중 키는 xterm 이 또 보내지 않게(확정 글자는 compositionend 한 번)
    // S-374: Alt as Meta 가 꺼져 있으면 Alt+글자를 Esc 접두 없이 보낸다(설정은 그때그때 읽어 켜진 콘솔에도 즉시)
    const plain = altPlain(ev, useSettings.getState().s.altAsMeta !== false);
    if (plain !== null) {
      if (ev.type === "keydown") { term.input(plain, true); ev.preventDefault(); }
      return false;
    }
    const a = mapKey(ev, { hasSelection: term.hasSelection(), altScreen: term.buffer.active.type === "alternate" });
    if (!a) return true;
    if (ev.type !== "keydown") return false;
    if (a.action === "copy") void navigator.clipboard?.writeText(term.getSelection()).catch(() => {});
    else if (a.action === "selectAll") term.selectAll();
    else if (a.action === "clear") {
      if (a.data === "scrollback") term.write("[3J"); // 대체 화면: 화면은 두고 스크롤백만(ED 3)
      else term.clear();
    } else if (a.action === "send") term.input(a.data!, true);
    // paste: 키는 xterm 이 ^V 로 보내지 않게만 막는다(preventDefault 안 함 → 브라우저가 paste 이벤트를 내고 아래에서 받는다)
    return false;
  });
  // 붙여넣기는 xterm 보다 먼저(capture) 받아 정리·질문을 거친다. Ctrl+V·Ctrl+Shift+V·우클릭 붙여넣기 모두 이 이벤트
  // 1-3: 우클릭은 메뉴만. 우클릭 직후 브라우저가 내는 진짜 paste 는 버린다(메뉴 Paste 는 합성 이벤트, Ctrl+V 는 우클릭 뒤 시간이 지남)
  term.options.rightClickSelectsWord = false;
  let rightAt = 0;
  const onRight = (e: MouseEvent) => { if (e.button === 2 || e.type === "contextmenu") rightAt = Date.now(); };
  const root = term.element;
  const unguard = guardRightMouse(root);
  root?.addEventListener("mousedown", onRight, true);
  root?.addEventListener("contextmenu", onRight, true);
  const ta = term.textarea;
  const onPaste = (e: ClipboardEvent) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (isStrayPaste(e.isTrusted, Date.now(), rightAt)) return;
    void paste(e.clipboardData?.getData("text/plain") ?? "");
  };
  ta?.addEventListener("paste", onPaste, true);
  fixImeSpot(term); // 커서를 숨긴 Claude 에서도 조합 글자를 입력 줄에(rec_1026_235106)
  const unIme = ta ? hookIme(ta, (d) => term.input(d, true), () => { const h = (term as unknown as { _core?: { _compositionHelper?: { _isSendingComposition?: boolean } } })._core?._compositionHelper; if (h) h._isSendingComposition = false; }) : () => {}; // 조합 끝 Space 순서(perf-real ⑥)
  return () => { unguard(); unIme(); ta?.removeEventListener("paste", onPaste, true); root?.removeEventListener("mousedown", onRight, true); root?.removeEventListener("contextmenu", onRight, true); };
}

/**
 * 보드 줌은 부모의 CSS scale 이라 xterm 이 마우스 좌표(화면 px)를 셀 크기(CSS px)로 그대로 나눠 50%·200%에서 엉뚱한 글자를 잡는다
 * (실측: 줌 2배에서 C..가 아니라 E..부터 선택됨). xterm 의 MouseService 두 메서드를 감싸 화면 좌표를 요소 안쪽 좌표로 되돌린다.
 * 배율은 요소 getBoundingClientRect().width / offsetWidth 로 그때그때 잰다. xterm 내부(_core._mouseService)에 기대므로 버전 올릴 때 e2e S-107 로 확인.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fixScaledMouse(term: Terminal): void {
  const ms = (term as unknown as { _core?: { _mouseService?: Record<string, unknown> } })._core?._mouseService as
    | { getCoords: (...a: any[]) => unknown; getMouseReportCoords: (...a: any[]) => unknown }
    | undefined;
  if (!ms) return;
  const unscale = (e: { clientX: number; clientY: number }, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const sx = el.offsetWidth ? r.width / el.offsetWidth : 1;
    const sy = el.offsetHeight ? r.height / el.offsetHeight : 1;
    if (Math.abs(sx - 1) < 0.005 && Math.abs(sy - 1) < 0.005) return e;
    // 요소 왼쪽 위에서의 거리를 배율로 나눈다. xterm 은 이 값에서 rect.left 를 다시 빼므로 rect.left 를 더해 돌려준다
    return { clientX: r.left + (e.clientX - r.left) / sx, clientY: r.top + (e.clientY - r.top) / sy };
  };
  const getCoords = ms.getCoords.bind(ms);
  const report = ms.getMouseReportCoords.bind(ms);
  ms.getCoords = (e: { clientX: number; clientY: number }, el: HTMLElement, ...rest: any[]) => getCoords(unscale(e, el), el, ...rest);
  ms.getMouseReportCoords = (e: { clientX: number; clientY: number }, el: HTMLElement) => report(unscale(e, el), el);
}

/** 보드 줌(CSS scale)에서 캔버스를 화면 크기대로 그린다. dpr 에 줌 배율을 곱해 xterm 에 알린다.
 * 안 하면 100% 로 그린 그림을 90% 로 줄여 글자가 흐리다(사용자 지적 222번). 배율은 0.3초마다 잰다(줌은 ResizeObserver 에 안 잡힌다).
 * xterm 내부(_core._coreBrowserService)에 기대므로 버전 올릴 때 e2e 로 확인. */
// ponytail: 0.3초 폴링. 보드 줌 변경 알림을 받게 되면 구독으로 바꾼다
export function sharpOnZoom(term: Terminal, el: HTMLElement): () => void {
  const cbs = (term as unknown as { _core?: { _coreBrowserService?: { _onDprChange?: { fire: (n: number) => void } } } })._core?._coreBrowserService;
  if (!cbs?._onDprChange) return () => {};
  let k = 1;
  Object.defineProperty(cbs, "dpr", { configurable: true, get: () => window.devicePixelRatio * k });
  const check = () => {
    const w = el.getBoundingClientRect().width;
    if (!el.offsetWidth || !w) return;
    const z = Math.round((w / el.offsetWidth) * 100) / 100;
    if (z !== k) { k = z; cbs._onDprChange!.fire(window.devicePixelRatio * k); }
  };
  check();
  const iv = setInterval(check, 300);
  return () => clearInterval(iv);
}

/** 흐린 글씨 한 줄(S-070 안내·S-071 종료 코드·S-165·S-072). 커서가 줄 중간이면 줄을 바꾼 뒤 쓴다. */
export function writeDim(term: Terminal, s: string): void {
  const lead = term.buffer.active.cursorX > 0 ? "\r\n" : "";
  term.write(`${lead}\x1b[2m${s}\x1b[0m\r\n`);
}

interface Props {
  program?: string;
  args?: string[];
  cwd?: string;
}

/** 노드 없이 터미널 하나만(`?term`·`?load16` 시험용). 콘솔 노드는 board/ConsoleNode + console/session. */
export default function TerminalView({ program, args, cwd }: Props) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const { term, dispose } = createTerminal(host.current!);
    let id: number | null = null;
    let dead = false;
    const subs = [
      term.onData((d) => id !== null && void ptyWrite(id, d)),
      term.onResize(({ cols, rows }) => id !== null && void ptyResize(id, cols, rows)),
    ];
    ptySpawn({
      program,
      args,
      cwd,
      cols: term.cols,
      rows: term.rows,
      onData: (b) => term.write(b),
      onExit: () => {},
    }).then((n) => {
      if (dead) return void ptyKill(n);
      id = n;
      debugTerms.set(n, term);
    });
    return () => {
      dead = true;
      subs.forEach((s) => s.dispose());
      if (id !== null) {
        debugTerms.delete(id);
        void ptyKill(id);
      }
      dispose();
    };
  }, [program, args, cwd]);

  return <div ref={host} style={{ width: "100%", height: "100%", overflow: "hidden" }} />;
}
