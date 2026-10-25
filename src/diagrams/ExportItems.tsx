// E3 S-2037: 생성된 조각 우클릭 메뉴에 더하는 항목. diagramId 가 있고 명세 파일이 있을 때만 그린다
import { useEffect, useState } from "react";
import { t } from "../i18n";
import { Item } from "../board/menus/menuKit";
import { diagramGet } from "../lib/ipc";
import { showNotice } from "../lib/notice";
import { exportExcalidraw } from "./exportExcalidraw";
import { exportPng } from "./exportPng";
import { parseSpec, type DiagramSpec } from "./spec";

const run = (p: Promise<boolean>) => void p.catch((e) => { console.error("diagram export failed", e); showNotice(t("Couldn't export the diagram.")); });

export default function ExportItems({ diagramId, onDone }: { diagramId: string; onDone: () => void }) {
  const [spec, setSpec] = useState<DiagramSpec | null>(null);
  useEffect(() => {
    let on = true;
    void diagramGet(diagramId).then((j) => on && setSpec(parseSpec(j))).catch(() => undefined);
    return () => void (on = false);
  }, [diagramId]);
  if (!spec) return null;
  return (
    <>
      <Item label={t("Export diagram as PNG")} onClick={() => { onDone(); run(exportPng(spec)); }} />
      <Item label={t("Export as Excalidraw")} onClick={() => { onDone(); run(exportExcalidraw(spec)); }} />
    </>
  );
}
