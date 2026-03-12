import { AngularJsFactory } from "@crowbartools/firebot-custom-scripts-types/types/modules/ui-extension-manager";

const factory: AngularJsFactory = {
    name: "obsCanvasService",
    function: (backendCommunicator: any): OBSCanvasService => {
        async function queryBackend<T extends keyof BackendCommunicatorCommands>(command: T, ...args: BackendCommunicatorCommands[T]["args"]): Promise<BackendCommunicatorCommands[T]["returns"]> {
            return await backendCommunicator.fireEventAsync(`dennisontheinternet:obs-canvas:${command}`, args);
        }

        return {
            getObsSupportsCanvases: async (): Promise<boolean | null> => {
                return await queryBackend("obsSupportsCanvases");
            }
        }
    }
}

export default factory;