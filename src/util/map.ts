import Deferred from './deferred';
import { EWampMessageID } from '../types/messages/MessageTypes';

import type { WampID } from '../types/messages/MessageTypes';
import type { WampMessage } from '../types/Protocol';

class PendingMap<TSucMsg extends WampMessage> {
    private _pendings = new Map<WampID, Deferred<TSucMsg>>();
    private _closed = false;

    constructor(
        private initMsg: EWampMessageID,
        private successMsg: EWampMessageID,
        private emptyRequest?: (msg: TSucMsg) => [boolean, string],
    ) {}

    public add(id: WampID): Promise<TSucMsg> {
        const deferred = new Deferred<TSucMsg>();
        this._pendings.set(id, deferred);
        return deferred.promise;
    }

    public reject(pendingId: WampID, err?: any): void {
        const deferred = this._pendings.get(pendingId);
        if (!deferred) {
            return;
        }
        this._pendings.delete(pendingId);
        deferred.reject(err);
    }

    public close(): void {
        this._closed = true;
        this._pendings.forEach((pending) => {
            pending.reject('closing');
        });
        this._pendings.clear();
    }

    //
    // - Handlers.
    //

    public handle(msg: WampMessage): [boolean, boolean, string] {
        if (this._closed) {
            return [false, true, ''];
        }

        if (msg[0] === this.successMsg) {
            const requestId = msg[1];
            if (requestId === 0 && !!this.emptyRequest) {
                const [success, error] = this.emptyRequest(msg as TSucMsg);
                return [true, success, error];
            }

            const pendingRequest = this.getAndDelete(requestId as WampID);
            if (!pendingRequest) {
                return [true, false, `Unexpected ${EWampMessageID[this.successMsg]}.`];
            }

            pendingRequest.resolve(msg as TSucMsg);
            return [true, true, ''];
        }

        if (msg[0] === EWampMessageID.ERROR && msg[1] === this.initMsg) {
            const requestId = msg[2];
            const pendingRequest = this.getAndDelete(requestId);
            if (!pendingRequest) {
                return [true, false, `Unexpected ${EWampMessageID[this.initMsg]} error.`];
            }

            pendingRequest.reject(new Error(msg[4]));
            return [true, true, ''];
        }

        return [false, true, ''];
    }

    private getAndDelete(id: WampID): Deferred<TSucMsg> | null {
        const val = this._pendings.get(id);
        this._pendings.delete(id);
        return val || null;
    }
}

export default PendingMap;
