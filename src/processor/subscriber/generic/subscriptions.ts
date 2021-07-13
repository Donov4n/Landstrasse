import Subscription from './subscription';
import Deferred from '../../../util/deferred';
import Logger, { LogLevel } from '../../../util/logger';

import type { WampDict, WampID, WampList, WampURI } from '../../../types/messages/MessageTypes';
import type { EventDetails } from '../../../types/messages/SubscribeMessage';

type UnsubscribeCallback = (subscriptions: Subscriptions) => Promise<void>;

class Subscriptions {
    private readonly _id: WampID;
    private readonly _uri: WampURI;

    private _subscriptions = new Map<WampID, Subscription>();

    private _unsubscribeCallback: UnsubscribeCallback;

    private _unsubscribed = false;

    public unsubscribedDeferred = new Deferred<void>();

    public get id() {
        return this._id;
    }

    public get uri() {
        return this._uri;
    }

    constructor(
        id: WampID,
        uri: WampURI,
        unsubscribeCallback: UnsubscribeCallback,
        private logger: Logger,
    ) {
        this._id = id;
        this._uri = uri;
        this._unsubscribeCallback = unsubscribeCallback;

        this.reinitCatch();
    }

    public add(requestId: WampID, subscription: Subscription): void {
        if (this._unsubscribed) {
            throw new Error('Subscriptions are already closed.');
        }
        this._subscriptions.set(requestId, subscription);
    }

    public trigger(args: WampList, kwArgs: WampDict, details: EventDetails): void {
        if (this._unsubscribed) {
            return;
        }

        this.logger.log(
            LogLevel.DEBUG,
            `Event received for subscription "${this.uri}".`,
            args, kwArgs, details,
        );

        this._subscriptions.forEach((subscription: Subscription) => {
            subscription.handler(args, kwArgs, details);
        });
    }

    public async unsubscribe(requestId: WampID): Promise<void> {
        if (this._unsubscribed) {
            return;
        }

        const subscription = this._subscriptions.get(requestId);
        if (!subscription) {
            throw new Error('Unexpected unsubscribe (unable to find the related subscription).');
        }

        this.logger.log(LogLevel.DEBUG, `Unsubscribing ${requestId} from "${this.uri}".`);
        this._subscriptions.delete(requestId);

        if (this._subscriptions.size === 0) {
            this.unsubscribedDeferred.promise.then(
                () => { subscription.unsubscribedDeferred.resolve(); },
                (err) => { subscription.unsubscribedDeferred.reject(err); },
            );
            await this._unsubscribeCallback(this);
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
                this._unsubscribed = true;

                // This can happen in one of two cases, which is why the loop is necessary
                // First, when the last subscriber unsubscribes, then this array is empty
                // Second: when the router sends actively a UNSUBSCRIBED message to indicate that
                // the subscription was revoked.
                this._subscriptions.forEach((subscription: Subscription) => {
                    subscription.unsubscribedDeferred.resolve();
                });
                this._subscriptions.clear();
            },
            () => { this.reinitCatch(); },
        );
    }
}

export default Subscriptions;
