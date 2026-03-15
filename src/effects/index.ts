import { Effects } from "@crowbartools/firebot-custom-scripts-types/types/effects";
import setSourceColor from "./set-source-color";
import setSourceText from "./set-source-text";
import toggleSourceFilter from "./toggle-source-filter";
import toggleSourceVisibility from "./toggle-source-visibility";
import transformSource from "./transform-source";

const effects: Effects.EffectType<any>[] = [
    setSourceColor,
    setSourceText,
    toggleSourceFilter,
    toggleSourceVisibility,
    transformSource
];

export default effects;