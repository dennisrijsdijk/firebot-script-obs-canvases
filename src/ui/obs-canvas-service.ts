import { AngularJsFactory } from "@crowbartools/firebot-custom-scripts-types/types/modules/ui-extension-manager";

const factory: AngularJsFactory = {
    name: "obsCanvasService",
    function: (backendCommunicator: any): OBSCanvasService => {
        async function queryBackend<T extends keyof BackendCommunicatorCommands>(command: T, ...args: BackendCommunicatorCommands[T]["args"]): Promise<BackendCommunicatorCommands[T]["returns"]> {
            return await backendCommunicator.fireEventAsync(`dennisontheinternet:obs-canvas:${command}`, args);
        }

        return {
            getCanvasedSourceData: async (): Promise<Array<OBSCanvasedSourceData> | null> => {
                return queryBackend("getCanvasedSourceData");
            },
            getColorSources: async (): Promise<Array<OBSSource> | null> => {
                return queryBackend("getColorSources");
            },
            getSourcesWithFilters: async (): Promise<Array<OBSSource> | null> => {
                return queryBackend("getSourcesWithFilters");
            },
            getTextSources: async (): Promise<Array<OBSSource> | null> => {
                return queryBackend("getTextSources");
            },
            getObsSupportsCanvases: async (): Promise<boolean | null> => {
                return queryBackend("obsSupportsCanvases");
            },
        }
    }
}

export default factory;