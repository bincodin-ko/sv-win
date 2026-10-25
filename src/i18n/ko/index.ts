// 사전 9개를 한 객체로 합친다. 같은 키는 뒤 파일이 이기지만 ko.test.ts 가 값이 다르면 실패시킨다.
import common from "./common";
import settings from "./settings";
import shell from "./shell";
import board from "./board";
import console_ from "./console";
import cards from "./cards";
import studio from "./studio";
import features from "./features";
import commands from "./commands";

export default { ...common, ...settings, ...shell, ...board, ...console_, ...cards, ...studio, ...features, ...commands } as Record<string, string>;
