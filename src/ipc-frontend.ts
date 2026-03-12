import globals from "./globals";

class IPCFrontend {
    on<T extends keyof BackendCommunicatorCommands>(event: T, callback: (...args: BackendCommunicatorCommands[T]["args"]) => Promise<BackendCommunicatorCommands[T]["returns"]>): string {
        if (!globals.frontendCommunicator) {
            throw new Error("FrontendCommunicator is not initialized");
        }

        return globals.frontendCommunicator.onAsync(`dennisontheinternet:obs-canvas:${event}`, async (args: BackendCommunicatorCommands[T]["args"]) => callback(...args));
    }

    off<T extends keyof BackendCommunicatorCommands>(event: T, eventHandlerId: string): void {
        if (!globals.frontendCommunicator) {
            throw new Error("FrontendCommunicator is not initialized");
        }

        globals.frontendCommunicator.off(`dennisontheinternet:obs-canvas:${event}`, eventHandlerId);
    }

    async send<T extends keyof FrontendCommunicatorCommands>(command: T, ...args: FrontendCommunicatorCommands[T]["args"]): Promise<FrontendCommunicatorCommands[T]["returns"]> {
        if (!globals.frontendCommunicator) {
            throw new Error("FrontendCommunicator is not initialized");
        }

        return await globals.frontendCommunicator.fireEventAsync(`dennisontheinternet:obs-canvas:${command}`, args);
    }
}

export default new IPCFrontend();