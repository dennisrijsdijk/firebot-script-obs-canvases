import { UIExtension } from "@crowbartools/firebot-custom-scripts-types/types/modules/ui-extension-manager";
import obsCanvasService from "./obs-canvas-service";

const extension: UIExtension = {
    id: "obs-canvas-extension",
    providers: {
        factories: [
            obsCanvasService
        ]
    }
}

export default extension;