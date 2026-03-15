import { RequestBatchRequest } from "obs-websocket-js";
import globals from "./globals";
import { OBSRemote } from "./obs-remote";

export class OBSTransform {
    private obsRemote: OBSRemote;
    constructor(obs: OBSRemote) {
        this.obsRemote = obs;
    }

    getOffsetMultipliersFromAlignment(alignment: number) {
        return [
            alignment % 4, // X position, 0 if center, 1 if left, 2 if right
            Math.floor(alignment / 4) // Y position, 0 if center, 1 if top, 2 if bottom
        ].map(offset =>
            // Convert to usable offset multiplier
            [0.5, 0, 1][offset]
        )
    }

    transformWebsocketRequest(
        sceneUuid: string,
        sceneItemId: number,
        sceneItemTransform: Record<string, number>
    ): RequestBatchRequest {
        return {
            requestType: "SetSceneItemTransform",
            requestData: {
                sceneUuid,
                sceneItemId,
                sceneItemTransform
            }
        }
    }

    getLerpedCallsArray(
        sceneUuid: string,
        sceneItemId: number,
        transformStart: Record<string, number>,
        transformEnd: Record<string, number>,
        duration: number,
        easeIn = false,
        easeOut = false,
    ): RequestBatchRequest[] {
if (!duration) {
        return [
            this.transformWebsocketRequest(
                sceneUuid,
                sceneItemId,
                transformEnd && Object.keys(transformEnd).length
                    ? transformEnd
                    : transformStart
            )
        ];
    }

    const calls: RequestBatchRequest[] = [];
    const interval = 1 / 60;

    calls.push(this.transformWebsocketRequest(sceneUuid, sceneItemId, transformStart));
    if (!transformEnd || !Object.keys(transformEnd).length) {
        return calls;
    }

    let time = 0;
    do {
        const delay = Math.min(interval * 1000, duration - time);
        const frame: Record<string, number> = {};

        calls.push({
            requestType: "Sleep",
            requestData: { sleepMillis: delay }
        });

        time += delay;
        Object.keys(transformEnd).forEach((key) => {
            if (transformStart[key] === transformEnd[key]) {
                return;
            }
            let ratio = time / duration;
            if (easeIn && easeOut) {
                ratio = ratio < 0.5 ? 2 * ratio * ratio : -1 + (4 - 2 * ratio) * ratio;
            } else if (easeIn) {
                ratio = ratio * ratio;
            } else if (easeOut) {
                ratio = ratio * (2 - ratio);
            }

            frame[key] = transformStart[key] + (transformEnd[key] - transformStart[key]) * ratio;

            if (key === "rotation") {
                frame[key] = frame[key] % 360;
            }
        });

        calls.push(this.transformWebsocketRequest(sceneUuid, sceneItemId, frame));
    } while (time < duration);
    return calls;
    }

    async transformSceneItem(
        sceneUuid: string,
        sceneItemId: number,
        duration: number,
        transformStart: Record<string, number>,
        transformEnd: Record<string, number>,
        easeIn: boolean,
        easeOut: boolean,
        alignment?: number
    ) {
        try {
            const currentTransform = (await this.obsRemote.obs.call("GetSceneItemTransform", {
                sceneUuid,
                sceneItemId
            })).sceneItemTransform;

            // If anchor change, update transformStart to account
            const currentAlignment = Number(currentTransform.alignment);
            if (!isNaN(alignment) && alignment !== currentAlignment) {
                const [currentXOffset, currentYOffset] = this.getOffsetMultipliersFromAlignment(currentAlignment);
                const [endXOffset, endYOffset] = this.getOffsetMultipliersFromAlignment(alignment);

                transformStart.alignment = alignment;
                if (!transformStart.hasOwnProperty("positionX")) {
                    const posX = Number(currentTransform.positionX);
                    const width = Number(currentTransform.width);
                    transformStart.positionX = posX + width * (endXOffset - currentXOffset);
                }
                if (!transformEnd.hasOwnProperty("positionX")) {
                    transformEnd.positionX = transformStart.positionX;
                }
                if (!transformStart.hasOwnProperty("positionY")) {
                    const posY = Number(currentTransform.positionY);
                    const height = Number(currentTransform.height);
                    transformStart.positionY = posY + height * (endYOffset - currentYOffset);
                }
                if (!transformEnd.hasOwnProperty("positionY")) {
                    transformEnd.positionY = transformStart.positionY;
                }
            }

            Object.keys(transformEnd).forEach((key) => {
                if (!transformStart.hasOwnProperty(key)) {
                    transformStart[key] = Number(currentTransform[key]);
                }
                if (transformEnd[key] === transformStart[key]) {
                    delete transformEnd[key];
                }
            });

            const calls = this.getLerpedCallsArray(sceneUuid, sceneItemId, transformStart, transformEnd, duration, easeIn, easeOut);
            await this.obsRemote.obs.callBatch(calls);
        } catch (error) {
            globals.logger.error("Failed to transform scene item", error);
        }
    }
}