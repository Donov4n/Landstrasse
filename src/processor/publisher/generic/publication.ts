import Deferred from '../../../util/deferred';

import type { WampID } from '../../../types/messages/MessageTypes';

class Publication {
    private readonly _requestId: WampID;

    private _resolved = false;

    private publishedDeferred = new Deferred<WampID | null>();

    public get published(): Promise<WampID | null> {
        return this.publishedDeferred.promise;
    }

    constructor(requestId: WampID, expectAck: boolean) {
        this._requestId = requestId;

        if (!expectAck) {
            this.publishedDeferred.resolve(null);
            this._resolved = true;
        }
    }

    public fail(msg: string): void {
        if (!this._resolved) {
            this._resolved = true;
            this.publishedDeferred.reject(msg);
        }
    }

    public acknowledge(publicationId: WampID): void {
        if (this._resolved) {
            throw new Error(`Unexpected acknowledge for publication ${this._requestId}.`);
        }
        this._resolved = true;
        this.publishedDeferred.resolve(publicationId);
    }
}

export default Publication;
