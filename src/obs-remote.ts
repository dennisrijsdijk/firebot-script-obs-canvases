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
            this._frontendCommunicatorEvents["getCanvasedSourceData"] = ipcFrontend.on("getCanvasedSourceData", async () => {
                return this.getCanvasedSourceData();
            });

            this._frontendCommunicatorEvents["getColorSources"] = ipcFrontend.on("getColorSources", async () => {
                return this.getAllColorSources();
            });

            this._frontendCommunicatorEvents["getSourcesWithFilters"] = ipcFrontend.on("getSourcesWithFilters", async () => {
                return this.getSourcesWithFilters();
            });

            this._frontendCommunicatorEvents["getTextSources"] = ipcFrontend.on("getTextSources", async () => {
                return this.getAllTextSources();
            });

            this._frontendCommunicatorEvents["obsSupportsCanvases"] = ipcFrontend.on("obsSupportsCanvases", async () => {
                return this.getObsSupportsCanvases();
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
            const response = await this.obs.call("GetCanvasList") as { canvases: Array<OBSCanvas> };
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
                        sceneUuid: scene.sceneUuid
                    }
                });
            }
        }

        try {
            const response = await this.obs.callBatch(sceneItemsRequestBatch, { executionType: RequestBatchExecutionType.SerialRealtime, haltOnFailure: false });
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
                requestId: source.inputUuid,
                requestData: {
                    sourceUuid: source.inputUuid
                }
            }));

            const response = await this.obs.callBatch(filtersRequestBatch, { executionType: RequestBatchExecutionType.SerialRealtime, haltOnFailure: false });

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

                const source = sources.find(s => s.inputUuid === res.requestId);

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

    async getAllColorSources(): Promise<Array<OBSSource> | null> {
        const sources = await this.getAllSources(false);
        return sources?.filter(source => source.unversionedInputKind === "color_source") || null;
    }

    async setColorSourceSettings(inputUuid: string, settings: OBSColorSourceSettings): Promise<void> {
        if (!this.connected) {
            return;
        }

        try {
            await this.obs.call("SetInputSettings", {
                inputUuid,
                inputSettings: {
                    color: settings.color
                }
            });
        } catch (error) {
            globals.logger.error("Failed to set color source settings:", error);
        }
    }

    async getSourcesWithFilters(): Promise<Array<OBSSource> | null> {
        const sources = await this.getAllSources(true);
        return sources?.filter(source => source.filters != null && source.filters.length > 0) || null;
    }

    async setFilterEnabledBatch(pendingActions: Array<{ sourceUuid: string; filterName: string; enabled: boolean }>): Promise<void> {
        if (!this.connected) {
            return;
        }

        const filterToggleBatch: RequestBatchRequest[] = pendingActions.map(action => ({
            requestType: "SetSourceFilterEnabled",
            requestData: {
                sourceUuid: action.sourceUuid,
                filterName: action.filterName,
                filterEnabled: action.enabled
            }
        }));

        try {
            await this.obs.callBatch(filterToggleBatch, { executionType: RequestBatchExecutionType.Parallel, haltOnFailure: false });
        } catch (error) {
            globals.logger.error("Failed to toggle filters:", error);
        }
    }

    async getCanvasedSourceData(): Promise<Array<OBSCanvasedSourceData> | null> {
        if (!this.connected) {
            return null;
        }

        const canvasedSourceData: Array<OBSCanvasedSourceData> = [];

        const canvasedScenes = await this.getCanvasedSceneList();
        if (canvasedScenes == null) {
            return null;
        }

        const sceneItemsRequestBatch: RequestBatchRequest[] = [];

        for (const canvas of canvasedScenes) {
            const canvasData: OBSCanvasedSourceData = {
                canvasName: canvas.canvasName,
                canvasUuid: canvas.canvasUuid,
                scenes: []
            };
            for (const scene of canvas.scenes) {
                canvasData.scenes.push({
                    sceneName: scene.sceneName,
                    sceneUuid: scene.sceneUuid,
                    sources: []
                });
                sceneItemsRequestBatch.push({
                    requestType: "GetSceneItemList",
                    requestId: scene.sceneUuid,
                    requestData: {
                        sceneUuid: scene.sceneUuid
                    }
                });
            }
            canvasedSourceData.push(canvasData);
        }

        try {
            const response = await this.obs.callBatch(sceneItemsRequestBatch, { executionType: RequestBatchExecutionType.SerialRealtime, haltOnFailure: false });
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
                    const canvas = canvasedSourceData.find(c => c.scenes.find(s => s.sceneUuid === res.requestId));
                    const scene = canvas?.scenes.find(s => s.sceneUuid === res.requestId);
                    if (!scene) {
                        continue;
                    }

                    const source: OBSSource = {
                        inputKind: item.isGroup ? "group" : item.sourceType,
                        inputKindCaps: 0,
                        inputName: item.sourceName,
                        inputUuid: item.sourceUuid,
                        sceneItemId: item.sceneItemId,
                        unversionedInputKind: item.isGroup ? "group" : item.sourceType
                    }
                    scene.sources.push(source);

                    if (item.isGroup) {
                        const groupSceneItemsResponse = await this.obs.call("GetGroupSceneItemList", { sceneUuid: item.sourceUuid });
                        if (groupSceneItemsResponse?.sceneItems) {
                            for (const groupSceneItem of groupSceneItemsResponse.sceneItems as Array<OBSSceneItem>) {
                                const groupSource: OBSSource = {
                                    inputKind: groupSceneItem.isGroup ? "group" : groupSceneItem.sourceType,
                                    inputKindCaps: 0,
                                    inputName: groupSceneItem.sourceName,
                                    inputUuid: groupSceneItem.sourceUuid,
                                    groupName: item.sourceName,
                                    groupUuid: item.sourceUuid,
                                    sceneItemId: groupSceneItem.sceneItemId,
                                    unversionedInputKind: groupSceneItem.isGroup ? "group" : groupSceneItem.sourceType
                                }
                                scene.sources.push(groupSource);
                            }
                        }
                    }
                }
            }

            return canvasedSourceData;
        } catch (error) {
            globals.logger.error("Failed to get groups:", error);
            return null;
        }
    }

    async batchGetNewSourceVisibilities(sources: Array<OBSSourceVisibilityData>): Promise<Array<{ sceneUuid: string; sceneItemId: number; visible: boolean }> | null> {
        if (!this.connected) {
            return null;
        }

        const sanitizedSources = sources.map(source => ({
            sceneUuid: source.groupUuid || source.sceneUuid,
            sceneItemId: source.sceneItemId,
            visible: source.action
        }));

        const toggleSources = sanitizedSources.filter(s => s.visible === "toggle");

        const visibilityRequestBatch: RequestBatchRequest[] = toggleSources.map((source, index) => ({
            requestType: "GetSceneItemEnabled",
            requestId: `${index}`,
            requestData: {
                sceneUuid: source.sceneUuid,
                sceneItemId: source.sceneItemId
            }
        }));

        try {
            const response = await this.obs.callBatch(visibilityRequestBatch, { executionType: RequestBatchExecutionType.SerialRealtime, haltOnFailure: false });
            for (const res of response) {
                if (res.requestStatus.result === false) {
                    globals.logger.warn(`Failed to get visibility for scene item ${res.requestId}:`, res.requestStatus.code, res.requestStatus.comment);
                    continue;
                }

                // typeguard
                if (res.requestType !== "GetSceneItemEnabled") {
                    globals.logger.warn(`Unexpected response type for visibility request batch: ${res.requestType}`);
                    continue;
                }

                const source = toggleSources[parseInt(res.requestId)];
                if (!source) {
                    globals.logger.warn(`Could not find source for visibility response with requestId ${res.requestId}`);
                    continue;
                }

                source.visible = !res.responseData.sceneItemEnabled;
            }
        } catch (error) {
            globals.logger.error("Failed to get source visibilities:", error);
            return null;
        }

        return sanitizedSources as Array<{ sceneUuid: string; sceneItemId: number; visible: boolean }>;
    }

    async batchSetSourceVisibilities(sources: Array<{ sceneUuid: string; sceneItemId: number; visible: boolean }>): Promise<void> {
        if (!this.connected) {
            return;
        }

        const visibilityToggleBatch: RequestBatchRequest[] = sources.map(source => ({
            requestType: "SetSceneItemEnabled",
            requestData: {
                sceneUuid: source.sceneUuid,
                sceneItemId: source.sceneItemId,
                sceneItemEnabled: source.visible
            }
        }));

        try {
            await this.obs.callBatch(visibilityToggleBatch, { executionType: RequestBatchExecutionType.Parallel, haltOnFailure: false });
        } catch (error) {
            globals.logger.error("Failed to set source visibilities:", error);
        }
    }
}

export default new OBSRemote();