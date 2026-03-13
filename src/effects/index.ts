import { Effects } from "@crowbartools/firebot-custom-scripts-types/types/effects";
import setSourceColor from "./set-source-color";
import setSourceText from "./set-source-text";

const effects: Effects.EffectType<any>[] = [
    setSourceColor,
    setSourceText
];

export default effects;