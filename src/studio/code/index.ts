import { tm } from "../../i18n";
import { registerStudio } from "../registry";
import CodeStudio from "./CodeStudio";

registerStudio({ id: "code", title: "Code", order: 0, Component: CodeStudio, tools: { label: tm("Code") } });
