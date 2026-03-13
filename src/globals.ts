import { EffectManager } from "@crowbartools/firebot-custom-scripts-types/types/modules/effect-manager";
import { FrontendCommunicator } from "@crowbartools/firebot-custom-scripts-types/types/modules/frontend-communicator";
import { Logger } from "@crowbartools/firebot-custom-scripts-types/types/modules/logger";

class Globals {
    effectManager: EffectManager;
    frontendCommunicator: FrontendCommunicator;
    logger: Logger;
}

export default new Globals();