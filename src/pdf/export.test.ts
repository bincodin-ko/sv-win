import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportPdf } from "./exportPdf";
import { copyMarkdown, exportMarkdown } from "./exportText";
import { previewPdf } from "./preview";
import { useSettings } from "../settings/useSettings";

// E2 S-1851~S-1853: 가짜 ipc(window.__fake*) 위에서 흐름을 시험한다. 실제 Edge·파일은 건드리지 않는다.
type W = Record<string, unknown>;
const w = window as unknown as W;
const base = { title: "A/B: plan", repo: "symvibe", date: "2026-10-24", md: "# x\n\nhello" };

beforeEach(() => {
  for (const k of ["__fakePdf", "__fakeSavePath", "__fakeFiles", "__fakeFsLog"]) delete w[k];
  useSettings.setState({ s: { ...useSettings.getState().s, pdfPaper: "letter", pdfDir: "" } });
  URL.createObjectURL = vi.fn(() => "blob:fake-1");
});

describe("exportPdf (S-1851)", () => {
  it("저장 창을 취소하면 아무것도 안 한다", async () => {
    w.__fakeSavePath = null;
    expect(await exportPdf(base)).toBeNull();
    expect((w.__fakePdf as { calls?: unknown[] } | undefined)?.calls ?? []).toHaveLength(0);
  });
  it("저장하면 pdf_export 호출·마지막 폴더 기억·토스트 Saved <이름>", async () => {
    w.__fakeSavePath = "C:/out dir/A-B- plan.pdf";
    const toast = vi.fn();
    expect(await exportPdf({ ...base, toast })).toBe("C:/out dir/A-B- plan.pdf");
    const call = (w.__fakePdf as { calls: { outPath: string; paper: string; html: string }[] }).calls[0]!;
    expect(call.outPath).toBe("C:/out dir/A-B- plan.pdf");
    expect(call.paper).toBe("letter");
    expect(call.html).toContain("hello");
    expect(useSettings.getState().s.pdfDir).toBe("C:/out dir");
    expect(toast.mock.calls[0]![0].message).toBe("Saved A-B- plan.pdf");
    toast.mock.calls[0]![0].open();
    toast.mock.calls[0]![0].reveal();
    expect(w.__fakeFsLog).toEqual(["open C:/out dir/A-B- plan.pdf", "reveal C:/out dir/A-B- plan.pdf"]);
  });
  it("Windows 백슬래시 경로도 폴더·파일 이름을 자른다", async () => {
    w.__fakeSavePath = "C:\\x\\y.pdf";
    const toast = vi.fn();
    await exportPdf({ ...base, toast });
    expect(useSettings.getState().s.pdfDir).toBe("C:\\x");
    expect(toast.mock.calls[0]![0].message).toBe("Saved y.pdf");
  });
  it("용지 설정 a4 를 따른다", async () => {
    useSettings.setState({ s: { ...useSettings.getState().s, pdfPaper: "a4" } });
    w.__fakeSavePath = "C:/o/x.pdf";
    await exportPdf(base);
    expect((w.__fakePdf as { calls: { paper: string }[] }).calls[0]!.paper).toBe("a4");
  });
  it("실패 문구는 그대로 던지고 폴더 기억은 바꾸지 않는다", async () => {
    w.__fakeSavePath = "C:/o/x.pdf";
    w.__fakePdf = { error: "PDF export failed: boom" };
    await expect(exportPdf(base)).rejects.toBe("PDF export failed: boom");
    expect(useSettings.getState().s.pdfDir).toBe("");
  });
});

describe("previewPdf (S-1852)", () => {
  it("blob URL 을 돌려주고 같은 HTML 은 캐시", async () => {
    expect(await previewPdf({ ...base, title: "cache" })).toBe("blob:fake-1");
    expect(await previewPdf({ ...base, title: "cache" })).toBe("blob:fake-1");
    expect((w.__fakePdf as { calls: unknown[] }).calls).toHaveLength(1);
  });
  it("Edge 가 없으면 null, 다른 오류는 던진다", async () => {
    w.__fakePdf = { error: "Microsoft Edge was not found. Export Markdown instead." };
    expect(await previewPdf({ ...base, title: "noedge" })).toBeNull();
    w.__fakePdf = { error: "PDF export failed: x" };
    await expect(previewPdf({ ...base, title: "other" })).rejects.toBe("PDF export failed: x");
  });
});

describe("Markdown 내보내기 (S-1853)", () => {
  it("저장 창 → export_write, 취소하면 아무것도 안 함", async () => {
    w.__fakeSavePath = null;
    expect(await exportMarkdown("t", "# hi")).toBeNull();
    w.__fakeSavePath = "C:/o/t.md";
    expect(await exportMarkdown("t", "# 한글")).toBe("C:/o/t.md");
    const f = (w.__fakeFiles as Record<string, { bytes: number[] }>)["C:/o/t.md"]!;
    expect(new TextDecoder().decode(new Uint8Array(f.bytes))).toBe("# 한글");
  });
  it("copyMarkdown 은 클립보드에", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await copyMarkdown("abc");
    expect(writeText).toHaveBeenCalledWith("abc");
  });
});
