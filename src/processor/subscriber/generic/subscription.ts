import Deferred from '../../../util/deferred';

import type Subscriptions from './subscriptions';
import type { EventHandler } from '../../../types/Connection';
import type { WampDict, WampID, WampURI, WampList } from '../../../types/messages/MessageTypes';

type SubscriptionHandler = EventHandler<WampList, WampDict>;

class Subscription {
    private readonly _requestId: WampID;
    private readonly _parent: Subscriptions;

    public unsubscribedDeferred = new Deferred<void>();

    public readonly handler: SubscriptionHandler;

    public get id(): WampID {
        return this._parent.id;
    }

    public get uri(): WampURI {
        return this._parent.uri;
    }

    public get unsubscribed(): Promise<void> {
        return this.unsubscribedDeferred.promise;
    }

    constructor(handler: SubscriptionHandler, requestId: WampID, parent: Subscriptions) {
        this._requestId = requestId;
        this._parent = parent;
        this.handler = handler;

        this._parent.add(requestId, this);
    }

    public async unsubscribe(): Promise<void> {
        return this._parent.unsubscribe(this._requestId);
    }
}

export default Subscription;
