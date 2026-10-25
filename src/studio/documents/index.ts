// E6: Documents 스튜디오 등록(Tools 메뉴에는 없다 — 레일 Generate PDF·칩 Docs·`open documents` 로 연다, S-1970)
import { registerStudio } from "../registry";
import DocumentsStudio from "./DocumentsStudio";

registerStudio({ id: "documents", title: "Documents", order: 3, Component: DocumentsStudio });
