import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ConfirmCloseHost } from "../console/ConfirmClose";
import { getSession, requestClose } from "../console/session";
import { requestHistory } from "./guardedHistory";
import { closeMax, toggleMax, useMax } from "../console/maximize";
import { sessionKey } from "../console/sessionKey";
import { isImeEvent } from "../commandbar/ime";
import ConsoleNode from "./ConsoleNode";
import NodeFrame from "./kinds/NodeFrame";
import Unsupported from "./kinds/Unsupported";
import { getKind, placeNew } from "./kinds/registry";
import { tools } from "./toolsRegistry";
import { inking } from "./ink/pen";
import Wires from "./Wires";
import StyleInspector from "./shapes/StyleInspector";
import { computeGuides, type Seg } from "./guides";
import GroupHalo from "./GroupHalo";
import { dragHalos, dropTarget, membersOf } from "./groups";
import GuideLines from "./GuideLines";
import EmptyBoard from "./EmptyBoard";
import { boardHasKeyboard, boardKey, overlayOpen, routeKey } from "./keys";
import { useLive } from "../livestatus/useLive";
import { jumpToNext } from "../shell/needsYou";
import type { Keymap } from "./keymap";
import { useUi } from "../ui/useUi";
import { openStudioByKey } from "../studio/useStudio";
import { connectCard, connectToggle } from "./connect";
import { wiredTargets } from "./wired";
import { usePasteImage } from "../images/insert";
import { useSettings } from "../settings/useSettings";
import NodeMenu from "./menus/NodeMenu";
import RunCard from "../diagrams/RunCard";
import { placeShape } from "./shapes/place";
import { pickFolder } from "../lib/ipc";
import { defaultAgent } from "../agents/api";
import RadialMenu from "./menus/RadialMenu";
import LeftRail from "./rail/LeftRail";
import SpawnFlyout from "./rail/SpawnFlyout";
import { arrowDelta, bounds, boxSelect, clickSelect, normBox, type Rect } from "./selection";
import SelectionBox from "./SelectionBox";
import { useScope } from "./BoardScope";
import { isHub } from "../shell/hubPath";
import { useShell } from "../shell/useShell";
import type { BoardStore } from "./boards";
import { isConsole } from "./store";
import RightRail from "./rail/RightRail";
import ZoomControls from "./ZoomControls";
import { fitBounds, panBy, zoomAt, zoomStep, type Bounds, type View } from "./viewport";
import { TIDY_KEY, tidyBoard } from "./tidy";
import { flushAll } from "./persist";
import { showNotice } from "../lib/notice";
import { t as tt } from "../i18n";
import { escTaken } from "../voice/keys";
import { voiceBusy } from "../voice/listen";
import { bump } from "../perf/renderCount";
import { useLowSpec } from "../perf/lowSpec";

const GRID = 24;
const kindDef = getKind;
function GuidesHost({ store, segs, size }: { store: BoardStore; segs: Seg[]; size: { w: number; h: number } }) {
  return <GuideLines segs={segs} view={store((s) => s.viewport)} size={size} />; // 가이드가 있는 동안만 뷰포트를 구독
}
function KindBody({ kind, id }: { kind: string; id: string }) {
  const C = getKind(kind)!.Component;
  return <C id={id} />;
}

/** Fit to content(S-008·S-044): 모든 노드가 보이게. 레일 버튼·고리·Shift+1 공용 */
function fitAll(el: HTMLElement, useBoard: BoardStore) {
  const { nodes, setViewport } = useBoard.getState();
  const list = Object.values(nodes);
  const x0 = Math.min(...list.map((n) => n.x)), y0 = Math.min(...list.map((n) => n.y));
  const x1 = Math.max(...list.map((n) => n.x + n.w)), y1 = Math.max(...list.map((n) => n.y + n.h));
  setViewport(fitBounds(list.length ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null, { w: el.clientWidth, h: el.clientHeight }));
}
type Menu = { kind: "ring"; at: { x: number; y: number }; world: { x: number; y: number } } | { kind: "node"; at: { x: number; y: number }; ids: string[]; term: Element | null };

export default function Board({ renderNode }: { renderNode?: (id: string) => React.ReactNode }) {
  bump("Board");
  const { wsId, store: useBoard, visible } = useScope();
  const sc = { wsId, store: useBoard };
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  usePasteImage(useBoard, visibleRef);
  const ref = useRef<HTMLDivElement>(null);
  // P1: 뷰포트(팬·줌)는 React 가 아니라 DOM 에 직접 쓴다. Board 는 viewport 를 구독하지 않는다(휠 1번마다 노드 전부 다시 그리던 병목)
  const low = useLowSpec();
  const worldRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const pend = useRef<View | null>(null); // 휠이 쌓은, 아직 저장소에 안 넣은 뷰포트(rAF 당 1번 반영)
  const applyView = useRef<(v: View, gesture: boolean) => void>(() => {});
  const nodes = useBoard((s) => s.nodes);
  const maxKey = useMax((s) => s.key);
  const maxId = maxKey && JSON.parse(maxKey)[0] === wsId && nodes[JSON.parse(maxKey)[1]] ? (JSON.parse(maxKey)[1] as string) : null; // 1-4: 크게 보는 콘솔
  const maxRef = useRef<string | null>(null);
  maxRef.current = maxId;
  const groups = useBoard((s) => s.groups) ?? [];
  const selection = useBoard((s) => s.selection);
  const [guides, setGuides] = useState<Seg[]>([]);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [flyout, setFlyout] = useState(false);
  const tool = useBoard((s) => s.tool);
  const toolDef = tools().find((t) => t.id === tool);
  const Layer = toolDef?.layer; // 도구 가로채기 층(S-868 자리): 있는 동안 노드 선택·끌기·고리 메뉴는 쉰다
  const layerOn = !!Layer;
  const empty = Object.keys(nodes).length === 0;
  useLayoutEffect(() => {
    const el = ref.current!, w = worldRef.current!, g = gridRef.current; // g = 점 격자 층(저사양이면 없음)
    let timer: ReturnType<typeof setTimeout> | undefined;
    const mod = (a: number, n: number) => ((a % n) + n) % n;
    const apply = (v: View, gesture: boolean) => {
      w.style.transform = maxRef.current ? "none" : `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`; // 크게 보기: transform 이 있으면 fixed 가 보드 안에 갇힌다
      if (g) { // 격자 층: 한 칸씩 크게 잡고 팬은 translate 만(다시 칠하지 않고 합성만). 크기는 줌이 바뀔 때만 달라진다
        const s = GRID * v.zoom;
        g.style.left = g.style.top = `${-s}px`;
        g.style.width = `calc(100% + ${2 * s}px)`;
        g.style.height = `calc(100% + ${2 * s}px)`;
        g.style.backgroundSize = `${s}px ${s}px`;
        g.style.transform = `translate(${mod((el.clientWidth - s) / 2 + v.x, s)}px, ${mod((el.clientHeight - s) / 2 + v.y, s)}px)`;
      }
      if (gesture) { // 제스처 중에만 will-change(끝나면 떼어 선명하게)
        w.style.willChange = "transform";
        clearTimeout(timer);
        timer = setTimeout(() => (w.style.willChange = ""), 150);
      }
    };
    applyView.current = apply;
    let prev = useBoard.getState().viewport;
    apply(prev, false);
    const un = useBoard.subscribe((s) => {
      if (s.viewport === prev) return;
      prev = s.viewport;
      pend.current = null; // 다른 길(맞춤·키·되돌리기)이 뷰포트를 바꾸면 쌓인 휠은 버린다
      apply(prev, true);
    });
    return () => { un(); clearTimeout(timer); };
  }, [useBoard, low]);
  useLayoutEffect(() => { applyView.current(useBoard.getState().viewport, false); }, [maxId, useBoard]);
  useEffect(() => { if (maxKey && JSON.parse(maxKey)[0] === wsId && !nodes[JSON.parse(maxKey)[1]]) closeMax(); }, [maxKey, wsId, nodes]); // 크게 보던 콘솔이 지워지면 해제
  // 1-4: Ctrl+Shift+Enter = 선택(또는 포커스) 콘솔 크게/복귀, Esc = 복귀(터미널 안에서 누른 Esc 는 프로그램 몫이라 건드리지 않는다)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!visibleRef.current || isImeEvent(e)) return;
      const st = useBoard.getState();
      if (e.key === "Escape" && maxRef.current && !e.ctrlKey && !e.altKey && !e.metaKey && !overlayOpen() && !(e.target as Element | null)?.closest?.(".xterm")) {
        e.preventDefault(); e.stopPropagation(); closeMax(); return;
      }
      if (e.key !== "Enter" || !e.ctrlKey || !e.shiftKey || e.altKey || e.metaKey || overlayOpen()) return;
      const inNode = (e.target as Element | null)?.closest?.("[data-node-id]") as HTMLElement | null;
      const id = maxRef.current ?? (inNode?.dataset.nodeId && isConsole(st.nodes[inNode.dataset.nodeId]) ? inNode.dataset.nodeId : st.selection.length === 1 && isConsole(st.nodes[st.selection[0]!]) ? st.selection[0] : null);
      if (!id) return;
      e.preventDefault(); e.stopPropagation(); toggleMax(sessionKey(wsId, id));
    };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, [useBoard, wsId]);
  useEffect(() => void useBoard.getState().loadPrefs(), []);
  // S-1225·S-1237: 탭 전환(숨김)·카드 삭제가 연결 모드를 끝낸다
  const connect = useUi((s) => s.connect);
  const mine = connect?.wsId === wsId ? connect.cardId : null;
  useEffect(() => { if (mine && (!visible || !nodes[mine])) useUi.setState({ connect: null }); }, [mine, visible, !!(mine && nodes[mine])]);
  const wiredNow = new Set(mine && nodes[mine] ? wiredTargets(nodes, groups, nodes[mine]!).consoles : []);

  useEffect(() => {
    const el = ref.current!;
    const st = () => useBoard.getState();
    const size = () => ({ w: el.clientWidth, h: el.clientHeight });
    const center = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect();
      return { x: cx - r.left - r.width / 2, y: cy - r.top - r.height / 2 };
    };
    let raf = 0;
    const flush = () => {
      raf = 0;
      const p = pend.current;
      pend.current = null;
      if (p) st().setViewport(p);
    };
    const onWheel = (e: WheelEvent) => {
      // S-011: 콘솔 본문 위 휠은 터미널(스크롤백)이 받는다. Ctrl+휠은 콘솔 위에서도 보드 줌(터미널엔 안 보냄)
      if ((e.target as Element | null)?.closest?.("[data-wheel-own]")) {
        if (!e.ctrlKey) return;
        e.stopPropagation();
      }
      e.preventDefault(); // Ctrl+휠 페이지 확대 방지(passive:false)
      const viewport = pend.current ?? st().viewport;
      const next = e.ctrlKey ? zoomAt(viewport, center(e.clientX, e.clientY), Math.exp(-e.deltaY * 0.0025))
        : e.shiftKey && e.deltaX === 0 ? panBy(viewport, -e.deltaY, 0) : panBy(viewport, -e.deltaX, -e.deltaY);
      pend.current = next;
      applyView.current(next, true); // 화면은 바로, 저장소는 프레임당 1번
      if (!raf) raf = requestAnimationFrame(flush);
    };
    // A6 편집 키(S-022~S-031). 처리했으면 true
    const editKey = (e: KeyboardEvent): boolean => {
      const { nodes, selection: sel, copy, duplicate, select, moveBy, tool, setTool } = st();
      if (e.ctrlKey && !e.altKey && !e.metaKey) {
        const k = boardKey(e).toLowerCase();
        if (k === "z") return void requestHistory(e.shiftKey ? "redo" : "undo", sc), true;
        if (k === "g") { // B7 S-500·S-501: 묶기 / 해체
          if (!e.shiftKey) return st().createGroup(sel), true;
          for (const g of new Set(sel.flatMap((id) => { const n = nodes[id]; return isConsole(n) && n.groupId ? [n.groupId] : []; }))) st().dissolveGroup(g);
          return true;
        }
        if (k === TIDY_KEY.key && e.shiftKey === TIDY_KEY.shift) return tidyBoard(useBoard), true; // U3 S-2647: 콘솔 안에서는 boardHasKeyboard 가 막는다
        if (e.shiftKey) return false;
        if (k === "s") return void flushAll().then(() => showNotice(tt("Saved"), 2000)).catch(() => {}), true; // U3 S-2649
        if (k === "y") return void requestHistory("redo", sc), true;
        if (k === "a") return select(Object.keys(nodes)), true;
        if (k === "c") return copy(sel), true;
        if (k === "x") return copy(sel), sel.length > 0 && void requestClose(sel, sc), true;
        if (k === "v") return false; // 붙여넣기는 paste 이벤트(images/insert.ts usePasteImage): 이미지면 이미지 노드, 아니면 기존 paste()
        if (k === "d") return duplicate(sel), true;
        return false;
      }
      if (e.ctrlKey || e.altKey || e.metaKey) return false;
      if (e.key === "F2") return sel.length === 1 && isConsole(nodes[sel[0]!]) && (window.dispatchEvent(new CustomEvent("symvibe:rename-console", { detail: { id: sel[0] } })), true); // U3 S-2648: 받는 쪽은 ConsoleNode(U4)
      if (e.key === "Delete" || e.key === "Backspace") return sel.length > 0 && (void requestClose(sel, sc), true);
      if (e.key === "Escape" && inking.on) return false; // C6 S-862: 그리는 도중 Esc 는 펜 층이 그 획만 버린다
      if (e.key === "Escape") { // 하나만: 선택 해제 → 도구를 Select 로 (열린 메뉴·대화상자는 위에서 걸러짐)
        if (sel.length) select([]);
        else if (tool !== "select") setTool("select");
        return false;
      }
      const d = arrowDelta(e.key, e.shiftKey);
      return !!d && sel.length > 0 && (moveBy(sel, d.dx, d.dy), true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (!visibleRef.current || !boardHasKeyboard(e.target)) return; // 숨은 보드는 키를 받지 않는다
      if (e.key === "Escape" && (escTaken.has(e) || voiceBusy())) return; // F3 S-2273: 음성 취소가 먼저
      if (overlayOpen()) return; // 열린 메뉴·대화상자가 먼저(S-031)
      if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.metaKey) { // S-1229: 연결 모드 → Mission Map → Memory → Loops → Usage, 한 번에 하나
        const u = useUi.getState();
        const close = connectCard(wsId) ? () => useUi.setState({ connect: null }) : u.mission.open ? u.closeMission : u.memory.open ? u.closeMemory : u.loops.open ? u.closeLoops : u.usage.open ? u.closeUsage : null;
        if (close) return close(), e.preventDefault();
      }
      const { viewport, setViewport, selection: sel } = st();
      // S-047: 실행 중 콘솔이 정확히 1개 선택이면 글자 키는 그 콘솔로(포커스만 옮기면 이어지는 keypress 가 거기로 간다), V·T = 도구
      const route = routeKey({ boardFocused: true, key: boardKey(e), ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey, shift: e.shiftKey, selected: sel.length, selectedRunningConsole: sel.length === 1 && !!getSession(wsId, sel[0]!)?.isRunning(), needsYouAvailable: useSettings.getState().s.liveStatus === true && useLive.getState().needs.length > 0 }, useSettings.getState().s.keymap as Keymap | undefined);
      if (route === "toConsole" && e.code === "Space" && useSettings.getState().s.holdSpace !== false) return; // F3 S-2260: Space 는 음성(톡 치면 아무 일도 없음)
      if (route === "toConsole") return void el.querySelector<HTMLElement>(`[data-node-id="${sel[0]}"] .xterm-helper-textarea`)?.focus();
      if (route === "needsYou") return void (jumpToNext() && e.preventDefault()); // B16 S-689
      if (isHub(useShell.getState().activeRepo) && ["git", "memory", "loops", "skills", "markdown"].includes(route)) return; // H5 S-2876: 폴더 없는 Hub 는 route 로 막는다(키는 바꿀 수 있다)
      if (route === "git") return (useUi.getState().gitOpen ? useUi.getState().closeGit() : useUi.getState().openGit()), e.preventDefault();
      if (route === "memory" || route === "loops") return useUi.getState()[route === "memory" ? "toggleMemory" : "toggleLoops"](), e.preventDefault();
      if (route === "skills" || route === "markdown") return void openStudioByKey(route), e.preventDefault(); // S-1806: 못 열면 이유를 스레드에 남긴다
      if (route === "none" && boardKey(e).toLowerCase() === "x" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) return useUi.getState().toggleMission(), e.preventDefault(); // S-1228: X 는 못 바꾼다
      if (route !== "none") return st().setTool(route), e.preventDefault();
      if (e.ctrlKey && !e.altKey && !e.metaKey) {
        if (e.key === "=" || e.key === "+") setViewport(zoomStep(viewport, 1));
        else if (e.key === "-") setViewport(zoomStep(viewport, -1));
        else if (e.key === "0") setViewport(zoomAt(viewport, { x: 0, y: 0 }, 1 / viewport.zoom));
        else if (!editKey(e)) return;
        e.preventDefault();
      } else if (e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && e.code === "Digit1") {
        fitAll(el, useBoard);
        e.preventDefault();
      } else if (editKey(e)) e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false, capture: true }); // 캡처: 자식이 전파를 막아도 먼저 본다
    window.addEventListener("keydown", onKey, true); // 캡처: 대화상자가 Esc 로 먼저 닫히기 전에 본다
    (el as any).__fit = (b: Bounds) => st().setViewport(fitBounds(b, size()));
    return () => {
      el.removeEventListener("wheel", onWheel, { capture: true });
      window.removeEventListener("keydown", onKey, true);
      cancelAnimationFrame(raf);
      flush();
    };
  }, [useBoard]);

  // 가운데 버튼 끌기 = 팬(노드 위에서 시작해도). 왼쪽 버튼 = 선택·노드 끌기·선택 상자(S-020~S-025)
  const drag = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    setMenu(null);
    setFlyout(false);
    if (e.button === 1 || (e.button === 0 && spaceDown.current && !layerOn)) { // 가운데 버튼·Space+왼쪽 = 어디서든 팬
      e.preventDefault();
      drag.current = { x: e.clientX, y: e.clientY };
      setGrabbing(true);
      ref.current!.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0 || layerOn) return;
    const t = e.target as Element;
    if (t.closest("button, input, textarea, select")) return;
    const st = useBoard.getState();
    const toWorld = (cx: number, cy: number) => {
      const r = ref.current!.getBoundingClientRect(), z = st.viewport.zoom;
      return { x: (cx - r.left - r.width / 2 - st.viewport.x) / z, y: (cy - r.top - r.height / 2 - st.viewport.y) / z };
    };
    const nodeEl = t.closest("[data-node-id]") as HTMLElement | null;
    if (connectCard(wsId)) { // S-1226: 연결 모드 — 콘솔은 토글, 다른 노드·빈 곳은 아무 일 없음(선택·끌기·선택 상자도 없다)
      const id = nodeEl?.dataset.nodeId;
      if (id && isConsole(st.nodes[id])) connectToggle(useBoard, wsId, id);
      return;
    }
    if (st.tool === "spawn" && !nodeEl) { // S-041: 무장된 에이전트를 클릭 지점에 놓고 Select 로. 무장이 없으면 flyout
      if (!st.armedAgent) return setFlyout(true);
      st.spawnAgent(st.armedAgent, toWorld(e.clientX, e.clientY));
      return st.setTool("select");
    }
    const placing = tools().find((d) => d.id === st.tool)?.onPlace;
    if (placing && !nodeEl) { // S-804: 놓기 도구는 한 번 놓고 Select 로
      placing(useBoard, toWorld(e.clientX, e.clientY));
      return st.setTool("select");
    }
    const cleanup = () => { setGuides([]); setMarquee(null); };
    const track = (move: (m: PointerEvent) => void, up: () => void) => {
      const end = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        up();
        cleanup();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    };
    const x0 = e.clientX, y0 = e.clientY;
    const far = (m: PointerEvent) => Math.hypot(m.clientX - x0, m.clientY - y0) >= 3;

    if (nodeEl) {
      const id = nodeEl.dataset.nodeId!;
      const n = st.nodes[id];
      const bodyDrag = isConsole(n) ? false : getKind(n?.kind ?? "")?.bodyDrag ?? true; // S-809: 머리줄만 끌리는 종류(콘솔 포함)는 본문 클릭이 자기 몫(S-020)
      if (!n || (!bodyDrag && !t.closest("[data-node-handle]"))) return;
      const wasSel = st.selection.includes(id);
      let sel = st.selection;
      if (e.shiftKey) sel = clickSelect(sel, id, true);
      else if (!wasSel) sel = [id];
      st.select(sel);
      if (!sel.includes(id)) return; // Shift 로 뺐으면 끌기 없음
      const noNativeDrag = (d: Event) => d.preventDefault(); // 선택된 글자 위에서 끌면 브라우저 기본 끌기가 pointercancel 로 노드 끌기를 끊는다
      window.addEventListener("dragstart", noNativeDrag, true);
      const orig = Object.fromEntries(sel.map((i) => [i, { x: st.nodes[i]!.x, y: st.nodes[i]!.y }]));
      let moved = false;
      let halos: ReturnType<typeof dragHalos> = {};
      track(
        (m) => {
          if (!moved && !far(m)) return;
          const s2 = useBoard.getState();
          if (!moved) { moved = true; s2.commit(); halos = dragHalos(s2.nodes, s2.groups ?? [], sel); } // 끌기 1번 = 1단계
          const z = s2.viewport.zoom;
          for (const i of sel) s2.updateNode(i, { x: orig[i]!.x + (m.clientX - x0) / z, y: orig[i]!.y + (m.clientY - y0) / z });
          const now = useBoard.getState().nodes;
          const mv = bounds(sel.flatMap((i) => (now[i] ? [now[i]!] : [])));
          const others = Object.values(now).filter((o) => !sel.includes(o.id));
          setGuides(mv ? computeGuides(mv, others) : []);
        },
        () => {
          if (!moved && !e.shiftKey && wasSel && sel.length > 1) useBoard.getState().select([id]);
          window.removeEventListener("dragstart", noNativeDrag, true);
          if (!moved) return;
          // B7 S-504: 놓은 자리의 중심이 할로 안이면 들어가고 밖이면 빠진다(통째로 끈 그룹은 그대로). 끌기 시작 commit 에 포함
          const s3 = useBoard.getState();
          for (const i of sel) {
            const n = s3.nodes[i];
            if (!isConsole(n) || (n.groupId && !halos[n.groupId])) continue;
            const to = dropTarget({ x: n.x + n.w / 2, y: n.y + n.h / 2 }, s3.groups ?? [], halos);
            if (to !== (n.groupId ?? null)) s3.setGroupOf(i, to);
          }
        },
      );
      return;
    }
    // 빈 캔버스: Shift+끌기 = 선택 상자(기존 선택에 더한다), 그냥 끌기 = 화면 이동(4px 넘어야), 안 움직인 클릭 = 선택 해제
    const base = e.shiftKey ? st.selection : [];
    (document.activeElement as HTMLElement | null)?.blur?.(); // S-047: 빈 캔버스 클릭 = 보드가 키보드를 되찾음
    if (!e.shiftKey) st.select([]);
    const w0 = toWorld(x0, y0);
    if (!e.shiftKey) {
      const v0 = st.viewport;
      track(
        (m) => {
          if (!panOn.current && Math.hypot(m.clientX - x0, m.clientY - y0) <= 4) return;
          panOn.current = true;
          setGrabbing(true);
          useBoard.getState().setViewport(panBy(v0, m.clientX - x0, m.clientY - y0));
        },
        () => { panOn.current = false; setGrabbing(false); },
      );
      return;
    }
    track(
      (m) => {
        if (!far(m) && !marqueeOn.current) return;
        marqueeOn.current = true;
        const w1 = toWorld(m.clientX, m.clientY);
        const box = normBox(w0, w1);
        const r = ref.current!.getBoundingClientRect();
        setMarquee(normBox({ x: x0 - r.left, y: y0 - r.top }, { x: m.clientX - r.left, y: m.clientY - r.top }));
        useBoard.getState().select(boxSelect(Object.values(useBoard.getState().nodes), box, base, e.shiftKey));
      },
      () => { marqueeOn.current = false; },
    );
  };
  const marqueeOn = useRef(false);
  const panOn = useRef(false);
  const [grabbing, setGrabbing] = useState(false);
  const spaceDown = useRef(false);
  useEffect(() => {
    const k = (down: boolean) => (e: KeyboardEvent) => { if (e.code === "Space") spaceDown.current = down; };
    const [d, u, b] = [k(true), k(false), () => (spaceDown.current = false)];
    window.addEventListener("keydown", d, true);
    window.addEventListener("keyup", u, true);
    window.addEventListener("blur", b);
    return () => { window.removeEventListener("keydown", d, true); window.removeEventListener("keyup", u, true); window.removeEventListener("blur", b); };
  }, []);
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const { viewport, setViewport } = useBoard.getState();
    setViewport(panBy(viewport, e.clientX - drag.current.x, e.clientY - drag.current.y));
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = () => { drag.current = null; setGrabbing(false); };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const t = e.target as Element;
    if (t.closest('[role="menu"], [data-testid="rail"], [data-testid="zoom-pct"]') || layerOn) return;
    const r = ref.current!.getBoundingClientRect();
    const st = useBoard.getState();
    const at = { x: e.clientX - r.left, y: e.clientY - r.top };
    setFlyout(false);
    const id = (t.closest("[data-node-id]") as HTMLElement | null)?.dataset.nodeId;
    if (id) {
      const ids = st.selection.includes(id) ? st.selection : [id];
      if (ids !== st.selection) st.select(ids);
      return setMenu({ kind: "node", at, ids, term: t.closest(".xterm") });
    }
    const z = st.viewport.zoom;
    setMenu({ kind: "ring", at, world: { x: (at.x - r.width / 2 - st.viewport.x) / z, y: (at.y - r.height / 2 - st.viewport.y) / z } });
  };

  return (
    <div
      ref={ref}
      data-testid="board"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={onContextMenu}
      style={{
        cursor: toolDef?.onPlace || tool === "spawn" ? "crosshair" : layerOn ? undefined : grabbing ? "grabbing" : "grab",
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "var(--panel)",
      }}
    >
      {!low && <div data-testid="grid" ref={gridRef} aria-hidden style={{ position: "absolute", pointerEvents: "none", backgroundImage: "radial-gradient(circle, var(--bd-3) 1px, transparent 1.5px)", willChange: "transform" }} />}
      <div data-testid="world" ref={worldRef} style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0, transformOrigin: "0 0" }}>
        {groups.map((g) => <GroupHalo key={g.id} group={g} members={membersOf(nodes, g.id)} />)}
        <Wires />
        {Object.values(nodes).map((n) => (
          <div
            key={n.id}
            data-node-id={n.id}
            data-selected={selection.includes(n.id)}
            {...(wiredNow.has(n.id) ? { "data-wired": "true" } : {})}
            onDoubleClick={(e) => !(e.target as Element).closest("input, textarea, [contenteditable]") && (ref.current as any).__fit({ x: n.x, y: n.y, w: n.w, h: n.h })}
            style={{ position: "absolute", left: n.x, top: n.y, width: n.w, height: n.h, zIndex: n.z, ...(maxId === n.id ? { position: "fixed", left: 0, top: 0, width: "100vw", height: "100vh", zIndex: 9700 } : null), pointerEvents: getKind(n.kind)?.hitShape ? "none" : undefined, outline: maxId === n.id ? "none" : wiredNow.has(n.id) ? "3px solid var(--accent)" : selection.includes(n.id) ? "2px solid var(--accent)" : undefined, outlineOffset: 2, borderRadius: 10 }}
          >
            {renderNode?.(n.id) ?? (n.kind === "console" ? <ConsoleNode id={n.id} /> : kindDef(n.kind) ? <KindBody kind={n.kind} id={n.id} /> : <Unsupported kind={n.kind} />)}
            {selection.includes(n.id) && getKind(n.kind)?.resizable && <NodeFrame id={n.id} def={getKind(n.kind)!} />}
          </div>
        ))}
      </div>
      {Layer && <Layer />}
      {guides.length > 0 && <GuidesHost store={useBoard} segs={guides} size={{ w: ref.current?.clientWidth ?? 0, h: ref.current?.clientHeight ?? 0 }} />}
      {marquee && <SelectionBox box={marquee} />}
      {empty && <EmptyBoard />}
      <LeftRail onFit={() => fitAll(ref.current!, useBoard)} onSpawnClick={() => setFlyout((f) => !f)} flyout={flyout && <SpawnFlyout onClose={() => setFlyout(false)} />} />
      {menu?.kind === "node" && <NodeMenu at={menu.at} ids={menu.ids} term={menu.term} onClose={() => setMenu(null)} />}
      {menu?.kind === "ring" && (
        <RadialMenu at={{ x: Math.min(Math.max(menu.at.x, 130), (ref.current?.clientWidth ?? 1000) - 130), y: Math.min(Math.max(menu.at.y, 130), (ref.current?.clientHeight ?? 800) - 130) }}
          onClose={() => setMenu(null)}
          onPlaceKind={(k) => void placeNew(useBoard, k, undefined, menu.world)}
          onPlaceShape={(c) => placeShape(useBoard, c, menu.world)}
          onSpawn={(id) => useBoard.getState().spawnAgent(id, menu.world)}
          onSpawnInFolder={() => void pickFolder().then(async (cwd) => { if (cwd) { const st = useBoard.getState(); st.spawnAgent(st.armedAgent ?? (await defaultAgent()), menu.world, { cwd }); } })}
          onSpawnGroup={() => useUi.getState().openComposer(6, { at: menu.at, world: menu.world })}
          onPaste={() => useBoard.getState().paste(menu.world)}
          onSelectAll={() => useBoard.getState().select(Object.keys(useBoard.getState().nodes))}
          onFit={() => fitAll(ref.current!, useBoard)}
          onTidy={() => tidyBoard(useBoard)}
          onZoom100={() => { const { viewport, setViewport } = useBoard.getState(); setViewport(zoomAt(viewport, { x: 0, y: 0 }, 1 / viewport.zoom)); }} />
      )}
      <RunCard />
      <StyleInspector />
      <RightRail />
      <ZoomControls />
      {visible && <ConfirmCloseHost />}
    </div>
  );
}
