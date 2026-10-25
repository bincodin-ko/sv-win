import { tm } from "../../i18n";
// 5묶음 E5 S-1920: Markdown 스튜디오 등록(Tools › Markdown, 키 D, 레일 Browse markdown docs 는 E1 이 이미 이 id 로 연다)
import { registerStudio } from "../registry";
import MarkdownStudio from "./MarkdownStudio";

registerStudio({ id: "markdown", title: "Markdown", order: 1, Component: MarkdownStudio, tools: { label: tm("Markdown") } });
