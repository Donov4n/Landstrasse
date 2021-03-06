import AbstractProcessor from './AbstractProcessor';
import PendingMap from '../util/map';
import { LogLevel } from '../util/logger';
import { WampID, EWampMessageID } from '../types/messages/MessageTypes';

import type { WampMessage } from '../types/Protocol';
import type { WampDict, WampList, WampURI } from '../types/messages/MessageTypes';
import type {
    PublishOptions,
    WampPublishedMessage,
    WampPublishMessage,
} from '../types/messages/PublishMessage';

class Publisher extends AbstractProcessor {
    public static getFeatures(): WampDict {
        return {
            publisher: {
                features: {
                    subscriber_blackwhite_listing: true,
                    publisher_exclusion: true,
                    publisher_identification: true,
                    sharded_subscription: true,
                },
            },
        };
    }

    private _publicationRequests = new PendingMap<WampPublishedMessage>(
        EWampMessageID.PUBLISH,
        EWampMessageID.PUBLISHED,
    );

    public async publish<A extends WampList, K extends WampDict>(
        topic: WampURI,
        args?: A,
        kwArgs?: K,
        options?: PublishOptions,
    ): Promise<WampID | undefined> {
        if (this._closed) {
            throw new Error('Publisher already closed.');
        }

        const requestId = this.idGenerators.session.id();
        const message: WampPublishMessage = [EWampMessageID.PUBLISH, requestId, options || {}, topic, args || [], kwArgs || {}];
        const request = this._publicationRequests.add(requestId);
        this.logger.log(LogLevel.DEBUG, `Publishing \`${topic}\` (request id: ${requestId}).`, args, kwArgs, options);

        try {
            await this.sender(message);
        } catch (err) {
            this._publicationRequests.reject(requestId, err);
            throw err;
        }

        if (!options?.acknowledge) {
            return Promise.resolve(undefined);
        }

        const [,, publicationId] = await request;
        return publicationId;
    }

    //
    // - Handlers.
    //

    protected onMessage(msg: WampMessage): boolean {
        const [handled, success, error] = this._publicationRequests.handle(msg);
        if (handled && !success) {
            this.violator(error);
        }
        return handled;
    }

    protected onClose(): void {
        this._publicationRequests.close();
    }
}

export default Publisher;
