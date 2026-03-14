import { Effects } from "@crowbartools/firebot-custom-scripts-types/types/effects";
import setSourceColor from "./set-source-color";
import setSourceText from "./set-source-text";
import toggleSourceFilter from "./toggle-source-filter";

const effects: Effects.EffectType<any>[] = [
    setSourceColor,
    setSourceText,
    toggleSourceFilter
];

export default effects;