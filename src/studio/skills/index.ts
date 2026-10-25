import { tm } from "../../i18n";
// 5묶음 E7: Skills 스튜디오 등록(Tools › Skills). repo 없이도 열린다(requestOpenStudio 가 skills 만 건너뛴다).
import { registerStudio } from "../registry";
import SkillsStudio from "./SkillsStudio";

registerStudio({ id: "skills", title: "Skills", order: 40, Component: SkillsStudio, tools: { label: tm("Skills") } });
