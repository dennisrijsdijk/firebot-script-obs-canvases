import { Firebot } from "@crowbartools/firebot-custom-scripts-types";
import globals from "./globals";
import obsRemote from "./obs-remote";
import uiExtension from "./ui";

interface Params {
  obsHost: string;
  obsPort: number;
  obsPassword: string;
}

const script: Firebot.CustomScript<Params> = {
  getScriptManifest: () => {
    return {
      name: "OBS Control (Canvases)",
      description: "Firebot script to leverage OBS Websocket Canvas Support (OBS 32.1.0 or higher required)",
      author: "DennisOnTheInternet",
      version: "1.0",
      firebotVersion: "5",
      startupOnly: true
    };
  },
  getDefaultParameters: () => {
    return {
      obsHost: {
        type: "string",
        default: "localhost",
        description: "OBS Host",
        secondaryDescription: "Enter the hostname or IP address of your OBS instance",
        title: "OBS Host",
      },
      obsPort: {
        type: "number",
        default: 4455,
        description: "OBS Port",
        secondaryDescription: "Enter the port number for your OBS instance",
        title: "OBS Port",
      },
      obsPassword: {
        type: "string",
        default: "",
        description: "OBS Password",
        secondaryDescription: "Enter the password for your OBS instance",
        title: "OBS Password",
      },
    };
  },
  run: (runRequest) => {
    globals.frontendCommunicator = runRequest.modules.frontendCommunicator;
    const logger = runRequest.modules.logger;
    globals.logger = {
      debug: (msg, ...meta) => logger.debug(`[OBS Canvas Script] ${msg}`, ...meta),
      info: (msg, ...meta) => logger.info(`[OBS Canvas Script] ${msg}`, ...meta),
      warn: (msg, ...meta) => logger.warn(`[OBS Canvas Script] ${msg}`, ...meta),
      error: (msg, ...meta) => logger.error(`[OBS Canvas Script] ${msg}`, ...meta),
    };

    runRequest.modules.uiExtensionManager.registerUIExtension(uiExtension);

    obsRemote.connect(runRequest.parameters.obsHost, runRequest.parameters.obsPort, runRequest.parameters.obsPassword);
  },
  parametersUpdated: (params) => {
    obsRemote.connect(params.obsHost, params.obsPort, params.obsPassword, true);
  },
  stop: () => {
    obsRemote.abort = true;
    obsRemote.disconnect(true);
  }
};

export default script;
