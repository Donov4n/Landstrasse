import Deferred from '../../../util/deferred';

import type Subscriptions from './subscriptions';
import type { EventHandler } from '../../../types/Connection';
import type { WampDict, WampID, WampURI, WampList } from '../../../types/messages/MessageTypes';

type SubscriptionHandler = EventHandler<WampList, WampDict>;

class Subscription {
    #requestId: WampID;
    #parent: Subscriptions;

    public unsubscribedDeferred = new Deferred<void>();

    public readonly handler: SubscriptionHandler;

    public get id(): WampID {
        return this.#parent.id;
    }

    public get uri(): WampURI {
        return this.#parent.uri;
    }

    public get unsubscribed(): Promise<void> {
        return this.unsubscribedDeferred.promise;
    }

    constructor(handler: SubscriptionHandler, requestId: WampID, parent: Subscriptions) {
        this.#requestId = requestId;
        this.#parent = parent;
        this.handler = handler;

        this.#parent.add(requestId, this);
    }

    public async unsubscribe(): Promise<void> {
        return this.#parent.unsubscribe(this.#requestId);
    }
}

export default Subscription;
