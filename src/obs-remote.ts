import OBSWebSocket, { RequestBatchExecutionType, RequestBatchRequest } from "obs-websocket-js";
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
                return this.getObsSupportsCanvases();
            });

            this._frontendCommunicatorEvents["getTextSources"] = ipcFrontend.on("getTextSources", async () => {
                return this.getAllTextSources();
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

    async getCanvases(): Promise<Array<OBSCanvas> | null> {
        if (!this.connected) {
            return null;
        }

        try {
            // @ts-expect-error - Old version of obs-websocket-js doesn't have GetCanvasList typed
            const response: OBSCanvasesResponse = await this.obs.call("GetCanvasList");
            return response.canvases;
        } catch (error) {
            globals.logger.error("Failed to get canvases:", error);
            return null;
        }
    }

    async getCanvasedSceneList(): Promise<Array<CanvasWithScenes> | null> {
        const canvases = await this.getCanvases() as Array<CanvasWithScenes> | null;
        if (canvases == null) {
            return null;
        }

        try {
            for (const canvas of canvases) {
                // @ts-expect-error - Old version of obs-websocket-js doesn't have canvasUuid for GetSceneList
                const response = await this.obs.call("GetSceneList", { canvasUuid: canvas.canvasUuid });
                canvas.scenes = response.scenes as Array<OBSScene>;
            }
            return canvases;
        } catch (error) {
            globals.logger.error("Failed to get canvased scene list:", error);
            return null;
        }
    }

    async getAllGroups(): Promise<Array<OBSSource> | null> {
        if (!this.connected) {
            return null;
        }

        const canvasedScenes = await this.getCanvasedSceneList();
        if (canvasedScenes == null) {
            return null;
        }

        const sceneItemsRequestBatch: RequestBatchRequest[] = [];

        for (const canvas of canvasedScenes) {
            for (const scene of canvas.scenes) {
                sceneItemsRequestBatch.push({
                    requestType: "GetSceneItemList",
                    requestData: {
                        sceneName: scene.sceneName,
                        // @ts-expect-error - Old version of obs-websocket-js doesn't have canvasUuid for GetSceneItemList
                        canvasUuid: canvas.canvasUuid
                    }
                });
            }
        }

        try {
            const response = await this.obs.callBatch(sceneItemsRequestBatch, { executionType: RequestBatchExecutionType.Parallel, haltOnFailure: false });
            const groups: Array<OBSSource> = [];
            for (const res of response) {
                if (res.requestStatus.result === false) {
                    globals.logger.warn(`Failed to get scene items for scene ${res.requestId}:`, res.requestStatus.code, res.requestStatus.comment);
                    continue;
                }

                // typeguard
                if (res.requestType !== "GetSceneItemList") {
                    globals.logger.warn(`Unexpected response type for scene items request batch: ${res.requestType}`);
                    continue;
                }

                for (const item of res.responseData.sceneItems as Array<OBSSceneItem>) {
                    if (!item.isGroup || groups.findIndex(g => g.inputUuid === item.sourceUuid) !== -1) {
                        continue;
                    }

                    groups.push({
                        inputKind: "group",
                        inputKindCaps: 0,
                        inputName: item.sourceName,
                        inputUuid: item.sourceUuid,
                        unversionedInputKind: "group"
                    });
                }
            }

            return groups;
        } catch (error) {
            globals.logger.error("Failed to get groups:", error);
            return null;
        }
    }

    async getAllSources(includeScenesAndGroups: boolean): Promise<Array<OBSSource> | null> {
        if (!this.connected) {
            return null;
        }

        try {
            const inputs = await this.obs.call("GetInputList");
            if (inputs?.inputs == null) {
                return null;
            }

            const sources = inputs.inputs as Array<OBSSource>;

            if (includeScenesAndGroups) {
                const sceneCanvases = await this.getCanvasedSceneList();

                if (sceneCanvases) {
                    for (const canvas of sceneCanvases) {
                        for (const scene of canvas.scenes) {
                            sources.push({
                                inputKind: "scene",
                                inputKindCaps: 0,
                                inputName: scene.sceneName,
                                inputUuid: scene.sceneUuid,
                                unversionedInputKind: "scene"
                            })
                        }
                    }
                }

                sources.push(...(await this.getAllGroups() ?? []));
            }

            const filtersRequestBatch: RequestBatchRequest[] = sources.map((source, index) => ({
                requestType: "GetSourceFilterList",
                requestId: `${index}`,
                requestData: {
                    sourceUuid: source.inputUuid
                }
            }));

            const response = await this.obs.callBatch(filtersRequestBatch, { executionType: RequestBatchExecutionType.Parallel, haltOnFailure: false });

            for (const res of response) {
                if (res.requestStatus.result === false) {
                    globals.logger.warn(`Failed to get filters for source ${res.requestId}:`, res.requestStatus.code, res.requestStatus.comment);
                    continue;
                }

                // typeguard
                if (res.requestType !== "GetSourceFilterList") {
                    globals.logger.warn(`Unexpected response type for filters request batch: ${res.requestType}`);
                    continue;
                }

                const source = sources[parseInt(res.requestId)];

                if (!source) {
                    continue;
                }

                source.filters = (res.responseData.filters as Array<{ filterEnabled: boolean; filterName: string }>).map(filter => ({
                    filterEnabled: filter.filterEnabled,
                    filterName: filter.filterName
                }));
            }

            return sources;
        } catch (error) {
            globals.logger.error("Failed to get sources:", error);
            return null;
        }
    }

    async getAllTextSources(): Promise<Array<OBSSource> | null> {
        const sources = await this.getAllSources(false);
        return sources?.filter(source => source.unversionedInputKind === "text_gdiplus" || source.unversionedInputKind === "text_ft2_source") || null;
    }

    async setFreeType2TextSourceSettings(inputUuid: string, settings: OBSTextSourceSettings): Promise<void> {
        if (!this.connected) {
            return;
        }

        try {
            await this.obs.call("SetInputSettings", {
                inputUuid,
                inputSettings: {
                    text: settings.text,
                    from_file: settings.textSource === "file",
                    text_file: settings.file
                }
            });
        } catch (error) {
            globals.logger.error("Failed to set FT2 text source settings:", error);
        }
    }

    async setGDIPlusTextSourceSettings(inputUuid: string, settings: OBSTextSourceSettings): Promise<void> {
        if (!this.connected) {
            return;
        }

        try {
            await this.obs.call("SetInputSettings", {
                inputUuid,
                inputSettings: {
                    text: settings.text,
                    read_from_file: settings.textSource === "file",
                    file: settings.file
                }
            });
        } catch (error) {
            globals.logger.error("Failed to set GDI+ text source settings:", error);
        }
    }

    async setTextSourceSettings(inputUuid: string, settings: OBSTextSourceSettings): Promise<void> {
        if (!this.connected) {
            return;
        }

        const sourceSettings = await this.obs.call("GetInputSettings", { inputUuid });
        if (sourceSettings.inputKind.startsWith("text_ft2_source")) {
            await this.setFreeType2TextSourceSettings(inputUuid, settings);
        } else if (sourceSettings.inputKind.startsWith("text_gdiplus")) {
            await this.setGDIPlusTextSourceSettings(inputUuid, settings);
        } else {
            globals.logger.warn(`Attempted to set text source settings for unsupported source kind ${sourceSettings.inputKind}`);
        }
    }
}

export default new OBSRemote();