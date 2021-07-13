import { ETransportEventType } from './types/Transport';
import SerializationError from './error/SerializationError';

import type { WampMessage } from './types/Protocol';
import type { SerializerInterface } from './types/Serializer';
import type { TransportInterface, TransportEvent } from './types/Transport';

class WebSocketTransport implements TransportInterface {
    protected webSocket: WebSocket | null = null;

    private callback: ((ev: TransportEvent) => void) | null = null;

    constructor(private serializer: SerializerInterface) {}

    public get isOpen(): boolean {
        return !!this.webSocket;
    }

    public open(endpoint: string, cb: (ev: TransportEvent) => void) {
        if (this.webSocket) {
            cb({ type: ETransportEventType.ERROR, error: 'Transport already opened!' });
            return;
        }

        this.webSocket = new WebSocket(endpoint, this.serializer.protocolId);
        this.callback = cb;

        if (this.serializer.isBinary) {
            this.webSocket.binaryType = 'arraybuffer';
        }

        this.webSocket.onopen = () => {
            cb({ type: ETransportEventType.OPEN });
        };

        this.webSocket.onmessage = (ev) => {
            try {
                const message = this.serializer.unserialize(ev.data);
                cb({ type: ETransportEventType.MESSAGE, message });
            } catch (error) {
                cb({ type: ETransportEventType.ERROR, error });
            }
        };

        this.webSocket.onclose = (ev: CloseEvent) => {
            this.webSocket!.onclose = null;
            this.webSocket!.onerror = null;
            this.callback = null;
            this.webSocket = null;

            cb({
                type: ETransportEventType.CLOSE,
                code: ev.code,
                reason: ev.reason,
                message: 'Received close event.',
                wasClean: ev.wasClean,
            });
        };

        this.webSocket.onerror = (err: any) => {
            this.webSocket!.onclose = null;
            this.webSocket!.onerror = null;
            this.callback = null;
            this.webSocket = null;

            cb({
                type: ETransportEventType.ERROR,
                error: `Transport critical error${err.error ? `: ${err.error}` : ''}.`,
            });
        };
    }

    public close(code: number, reason: string, message: string = ''): void {
        if (!this.webSocket || !this.callback) {
            return;
        }

        this.webSocket.onclose = null;
        this.webSocket.onerror = null;

        this.webSocket.close(code, reason);
        this.callback({
            type: ETransportEventType.CLOSE,
            code,
            reason,
            message,
            wasClean: true,
        });

        this.callback = null;
        this.webSocket = null;
    }

    public async send(msg: WampMessage): Promise<void> {
        let payload;
        try {
            payload = this.serializer.serialize(msg);
        } catch (err) {
            throw new SerializationError(err);
        }
        return this.webSocket!.send(payload);
    }
}

export default WebSocketTransport;
