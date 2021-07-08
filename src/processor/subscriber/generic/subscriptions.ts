import Subscription from './subscription';
import Deferred from '../../../util/deferred';
import Logger, { LogLevel } from '../../../util/logger';

import type { WampDict, WampID, WampList, WampURI } from '../../../types/messages/MessageTypes';
import type { EventDetails } from '../../../types/messages/SubscribeMessage';

type UnsubscribeCallback = (subscriptions: Subscriptions) => Promise<void>;

class Subscriptions {
    readonly #id: WampID;
    readonly #uri: WampURI;

    #unsubscribeCallback: UnsubscribeCallback;

    private subscriptions = new Map<WampID, Subscription>();

    private unsubscribed = false;
    public unsubscribedDeferred = new Deferred<void>();

    public get id() {
        return this.#id;
    }

    public get uri() {
        return this.#uri;
    }

    constructor(
        id: WampID,
        uri: WampURI,
        unsubscribeCallback: UnsubscribeCallback,
        private logger: Logger,
    ) {
        this.#id = id;
        this.#uri = uri;
        this.#unsubscribeCallback = unsubscribeCallback;

        this.reinitCatch();
    }

    public add(requestId: WampID, subscription: Subscription): void {
        if (this.unsubscribed) {
            throw new Error('Subscriptions are already closed.');
        }
        this.subscriptions.set(requestId, subscription);
    }

    public trigger(args: WampList, kwArgs: WampDict, details: EventDetails): void {
        if (this.unsubscribed) {
            return;
        }

        this.logger.log(
            LogLevel.DEBUG,
            `Event received for subscription "${this.uri}".`,
            args, kwArgs, details,
        );

        this.subscriptions.forEach((subscription: Subscription) => {
            subscription.handler(args, kwArgs, details);
        });
    }

    public async unsubscribe(requestId: WampID): Promise<void> {
        if (this.unsubscribed) {
            return;
        }

        const subscription = this.subscriptions.get(requestId);
        if (!subscription) {
            throw new Error('Unexpected unsubscribe (unable to find the related subscription).');
        }

        this.logger.log(LogLevel.DEBUG, `Unsubscribing ${requestId} from "${this.uri}".`);
        this.subscriptions.delete(requestId);

        if (this.subscriptions.size === 0) {
            this.unsubscribedDeferred.promise.then(
                () => { subscription.unsubscribedDeferred.resolve(); },
                (err) => { subscription.unsubscribedDeferred.reject(err); },
            );
            await this.#unsubscribeCallback(this);
        } else {
            subscription.unsubscribedDeferred.resolve();
        }

        return subscription.unsubscribed;
    }

    //
    // - Internal
    //

    private reinitCatch(): void {
        this.unsubscribedDeferred = new Deferred<void>();
        this.unsubscribedDeferred.promise.then(
            () => {
                this.unsubscribed = true;

                // This can happen in one of two cases, which is why the loop is necessary
                // First, when the last subscriber unsubscribes, then this array is empty
                // Second: when the router sends actively a UNSUBSCRIBED message to indicate that
                // the subscription was revoked.
                this.subscriptions.forEach((subscription: Subscription) => {
                    subscription.unsubscribedDeferred.resolve();
                });
                this.subscriptions.clear();
            },
            () => { this.reinitCatch(); },
        );
    }
}

export default Subscriptions;
