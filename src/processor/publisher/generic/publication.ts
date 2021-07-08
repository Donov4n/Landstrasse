import Deferred from '../../../util/deferred';

import type { WampID } from '../../../types/messages/MessageTypes';

class Publication {
    #requestId: WampID;

    private resolved = false;

    private publishedDeferred = new Deferred<WampID | null>();

    public get published(): Promise<WampID | null> {
        return this.publishedDeferred.promise;
    }

    constructor(requestId: WampID, expectAck: boolean) {
        this.#requestId = requestId;

        if (!expectAck) {
            this.publishedDeferred.resolve(null);
            this.resolved = true;
        }
    }

    public fail(msg: string): void {
        if (!this.resolved) {
            this.resolved = true;
            this.publishedDeferred.reject(msg);
        }
    }

    public acknowledge(publicationId: WampID): void {
        if (this.resolved) {
            throw new Error(`Unexpected acknowledge for publication ${this.#requestId}.`);
        }
        this.resolved = true;
        this.publishedDeferred.resolve(publicationId);
    }
}

export default Publication;
