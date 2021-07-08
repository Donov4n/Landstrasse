import Deferred from '../../../util/deferred';

import type { CallHandler } from '../../../types/Connection';
import type { WampDict, WampID, WampList, WampURI } from '../../../types/messages/MessageTypes';

type UnregisterCallback = (registration: Registration) => Promise<void>;
type RegistrationHandler = CallHandler<WampList, WampDict, WampList, WampDict>;

class Registration {
    readonly #id: WampID;
    readonly #uri: WampURI;

    #unregisterCallback: UnregisterCallback;

    public readonly handler: RegistrationHandler;

    public unregisteredDeferred = new Deferred<void>();

    public get id(): WampID {
        return this.#id;
    }

    public get uri(): WampURI {
        return this.#uri;
    }

    public get unregistered(): Promise<void> {
        return this.unregisteredDeferred.promise;
    }

    constructor(
        id: WampID,
        uri: WampURI,
        handler: RegistrationHandler,
        unregisterCallback: UnregisterCallback,
    ) {
        this.#id = id;
        this.#uri = uri;
        this.#unregisterCallback = unregisterCallback;
        this.handler = handler;

        this.reinitCatch();
    }

    public async unregister(): Promise<void> {
        await this.#unregisterCallback(this);

        return this.unregistered;
    }

    //
    // - Internal
    //

    private reinitCatch(err?: any) {
        if (err !== 'closing') {
            this.unregisteredDeferred = new Deferred<void>();
            this.unregisteredDeferred.promise.catch((e) => this.reinitCatch(e));
        }
    }
}

export default Registration;
