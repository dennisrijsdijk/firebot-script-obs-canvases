import OBSWebSocket from "obs-websocket-js";
import IPCFrontend from "./ipc-frontend";
import globals from "./globals";
import ipcFrontend from "./ipc-frontend";

class OBSRemote {
    abort: boolean = false;
    connected: boolean = false;
    obs: OBSWebSocket = new OBSWebSocket();
    private _reconnectTimeout: NodeJS.Timeout | null = null;
    private _frontendCommunicatorEvents: Partial<Record<keyof BackendCommunicatorCommands, string>> = {};

    async connect(host: string, port: number, password: string, forceReconnect = false): Promise<void> {
        if (forceReconnect && this.connected) {
            await this.disconnect();
            this.abort = false;
        }

        if (this._reconnectTimeout) {
            clearTimeout(this._reconnectTimeout);
            this._reconnectTimeout = null;
        }

        if (this.connected) {
            globals.logger.warn("Already connected to OBS, skipping connect");
            return;
        }

        globals.logger.debug(`Connecting to OBS at ${host}:${port}...`);

        this.obs.removeAllListeners();

        this.setupEventListeners(host, port, password);

        try {
            await this.obs.connect(`ws://${host}:${port}`, password);
            this.connected = true;
            globals.logger.info("Successfully connected to OBS");
            const supportsCanvases = await this.getObsSupportsCanvases();
            globals.logger.info(`OBS Canvas Support: ${supportsCanvases}`);
        } catch (error) {
            globals.logger.error("Failed to connect to OBS:", error);
            globals.logger.warn("Attempting to reconnect in 10 seconds...");
            clearTimeout(this._reconnectTimeout);
            this._reconnectTimeout = setTimeout(() => this.connect(host, port, password), 1e4);
        }
    }

    async disconnect(unsubscribeIpc: boolean = false): Promise<void> {
        this.abort = true;
        await this.obs.disconnect();
        if (unsubscribeIpc) {
            for (const [key, value] of Object.entries(this._frontendCommunicatorEvents)) {
                ipcFrontend.off(key as keyof BackendCommunicatorCommands, value);
            }
            this._frontendCommunicatorEvents = {};
        }
        this.connected = false;
    }

    setupEventListeners(host: string, port: number, password: string): void {
        this.obs.on("ConnectionClosed", () => {
            if (!this.connected) {
                return;
            }

            this.connected = false;

            if (this.abort) {
                globals.logger.debug("OBS connection closed (abort=true), not attempting to reconnect");
                return;
            }

            try {
                globals.logger.warn("OBS connection closed, attempting to reconnect in 10 seconds...");
                clearTimeout(this._reconnectTimeout);
                this._reconnectTimeout = setTimeout(() => this.connect(host, port, password), 1e4);
            } catch { }
        });

        if (Object.keys(this._frontendCommunicatorEvents).length === 0) {
            this._frontendCommunicatorEvents["obsSupportsCanvases"] = ipcFrontend.on("obsSupportsCanvases", async () => {
                const supportsCanvases = await this.getObsSupportsCanvases();
                return supportsCanvases;
            });
        }
    }

    async getObsSupportsCanvases(): Promise<boolean | null> {
        if (!this.connected) {
            globals.logger.warn("Not connected to OBS, cannot check for canvas support");
            return null;
        }

        try {
            const versionInfo = await this.obs.call("GetVersion");
            return versionInfo.availableRequests.includes("GetCanvasList");
        } catch (error) {
            globals.logger.error("Failed to check OBS canvas support:", error);
            return null;
        }
    }
}

export default new OBSRemote();