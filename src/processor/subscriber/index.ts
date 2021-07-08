import AbstractProcessor from '../AbstractProcessor';
import Subscription from './generic/subscription';
import Subscriptions from './generic/subscriptions';
import PendingMap from '../../util/map';
import { LogLevel } from '../../util/logger';
import { EWampMessageID } from '../../types/messages/MessageTypes';

import type { EventHandler } from '../../types/Connection';
import type { WampMessage } from '../../types/Protocol';
import type { WampDict, WampID, WampList, WampURI } from '../../types/messages/MessageTypes';
import type {
    SubscribeOptions,
    WampSubscribedMessage,
    WampSubscribeMessage,
    WampUnsubscribedMessage,
    WampUnsubscribeMessage,
} from '../../types/messages/SubscribeMessage';

class Subscriber extends AbstractProcessor {
    public static getFeatures(): WampDict {
        return {
            subscriber: {
                features: {
                    publisher_identification: true,
                    publication_trustlevels: true,
                    pattern_based_subscription: true,
                    sharded_subscription: true,
                    event_history: true,
                },
            },
        };
    }

    private subscriptions = new Map<WampID, Subscriptions>();

    private subscriptionRequests = new PendingMap<WampSubscribedMessage>(
        EWampMessageID.SUBSCRIBE,
        EWampMessageID.SUBSCRIBED,
    );

    private unsubscriptionRequests = new PendingMap<WampUnsubscribedMessage>(
        EWampMessageID.UNSUBSCRIBE,
        EWampMessageID.UNSUBSCRIBED,
        ([,, details]) => {
            if (!details) {
                return [false, 'Invalid unsubscription (missing subscription details).'];
            }
            const id = details.subscription;

            const subscriptions = this.subscriptions.get(id);
            if (!subscriptions) {
                return [false, `Unexpected unsubscription (unknown subscription id ${id}).`];
            }

            this.subscriptions.delete(id);
            subscriptions.unsubscribedDeferred.resolve();

            return [true, ''];
        },
    );

    public async subscribe<A extends WampList, K extends WampDict>(
        topic: WampURI,
        handler: EventHandler<A, K>,
        options?: SubscribeOptions,
    ): Promise<Subscription> {
        if (this.closed) {
            throw new Error('Subscriber closed.');
        }

        const requestId = this.idGenerators.session.id();
        const message: WampSubscribeMessage = [EWampMessageID.SUBSCRIBE, requestId, options || {}, topic];
        const request = this.subscriptionRequests.add(requestId);
        this.logger.log(LogLevel.DEBUG, `Subscribing to "${topic}" (request id: ${requestId}).`, options);

        try {
            await this.sender(message);
        } catch (err) {
            this.subscriptionRequests.reject(requestId, err);
            throw err;
        }

        const [,, subscriptionId] = await request;
        let subscriptions = this.subscriptions.get(subscriptionId)!;
        if (!subscriptions) {
            subscriptions = new Subscriptions(
                subscriptionId,
                topic,
                async (subscriptions) => await this.unsubscribe(subscriptions),
                this.logger,
            );
            this.subscriptions.set(subscriptionId, subscriptions);
        }

        return new Subscription(handler as any, requestId, subscriptions);
    }

    private async unsubscribe(subscriptions: Subscriptions): Promise<void> {
        if (this.closed) {
            throw new Error('Subscriber closed.');
        }

        const requestId = this.idGenerators.session.id();
        const message: WampUnsubscribeMessage = [EWampMessageID.UNSUBSCRIBE, requestId, subscriptions.id];
        const request = this.unsubscriptionRequests.add(requestId);

        try {
            try {
                await this.sender(message);
            } catch (err) {
                this.unsubscriptionRequests.reject(requestId, err);
                throw err;
            }

            await request;
            this.subscriptions.delete(subscriptions.id);
            subscriptions.unsubscribedDeferred.resolve();
        } catch (e) {
            subscriptions.unsubscribedDeferred.reject(e);
        }
    }

    //
    // - Handlers.
    //

    protected onMessage(msg: WampMessage): boolean {
        const handled = [this.subscriptionRequests, this.unsubscriptionRequests].some(
            (pendingRequests) => {
                const [handled, success, error] = pendingRequests.handle(msg);
                if (handled && !success) {
                    this.violator(error);
                }
                return handled;
            }
        );
        if (handled) {
            return true;
        }

        if (msg[0] === EWampMessageID.EVENT) {
            const [, subscriptionId, publicationId, details, args, kwArgs] = msg;
            const subscriptions = this.subscriptions.get(subscriptionId);
            if (!subscriptions) {
                this.violator('Unexpected event (unable to find the related subscriptions).');
                return true;
            }

            const actualDetails = { ...(details || {}) };
            actualDetails.publicationId = publicationId;
            if (!details.topic) {
                actualDetails.topic = subscriptions.uri;
            }

            subscriptions.trigger(args || [], kwArgs || {}, details);

            return true;
        }

        return handled;
    }

    protected onClose(): void {
        this.subscriptionRequests.close();
        this.unsubscriptionRequests.close();

        this.subscriptions.forEach((subscriptions: Subscriptions) => {
            subscriptions.unsubscribedDeferred.reject('Subscriber closing.');
        });
        this.subscriptions.clear();
    }
}

export default Subscriber;
