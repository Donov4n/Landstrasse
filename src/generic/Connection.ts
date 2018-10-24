import { WampURI, EWampMessageID } from '../types/messages/MessageTypes';
import { WampHelloMessage, HelloMessageDetails } from '../types/messages/HelloMessage';
import { PublishOptions } from '../types/messages/PublishMessage';
import { WampMessage, WampChallengeMessage } from '../types/Protocol';
import {
  IConnection,
  ConnectionOptions,
  CallResult,
  CallHandler,
  IRegistration,
  ISubscription,
  EventHandler,
  IPublication,
  ConnectionOpenError,
  ConnectionCloseError,
  ConnectionCloseInfo,
  LogLevel,
} from "../types/Connection";

import { ITransport, ETransportEventType } from '../types/Transport';
import { Deferred } from 'queueable';
import { ConnectionStateMachine, EMessageDirection, EConnectionState } from './ConnectionStateMachine';

export class Connection implements IConnection {
    private transport: ITransport;
    private onOpen: Deferred<void>;
    private onClose: Deferred<ConnectionCloseInfo>;
    private state: ConnectionStateMachine;
    constructor(private connectionOptions: ConnectionOptions) {
      this.connectionOptions.logFunction = this.connectionOptions.logFunction || console.log;
      this.connectionOptions.transportOptions = this.connectionOptions.transportOptions || {};
    }

    public Open(): Promise<void> {
      if (!!this.transport) {
        return Promise.reject("Transport already opened or opening")
      }
      this.transport = new this.connectionOptions.transport(
        this.connectionOptions.serializer,
        this.connectionOptions.transportOptions,
      );
      this.state = new ConnectionStateMachine();
      setTimeout(() => {
        this.runConnection().then(() => console.log('Main loop exited'));
      }, 0);
      this.onOpen = new Deferred();
      return this.onOpen.promise;
    }

    public OnClose(): Promise<ConnectionCloseInfo> {
      if (!this.onClose) {
        this.onClose = new Deferred();
      }
      return this.onClose.promise;
    };

    public Close(): Promise<ConnectionCloseInfo> {
      if (!this.transport) {
        return Promise.reject("transport is not open");
      }
      this.transport.Send([
        EWampMessageID.GOODBYE,
        {
          message: "client shutdown",
        },
        "wamp.close.normal",
      ]);
      return this.OnClose();
    }

    public async Call<A, K, RA, RK>(uri: WampURI, args: A, kwargs: K, opts: any): Promise<CallResult<RA, RK>> {
      throw new Error("not implemented yet");
    }
    public async Register<A, K, RA, RK>(uri: WampURI, handler: CallHandler<A, K, RA, RK>, opts: any): Promise<IRegistration> {
      throw new Error("not implemented yet");
    }
    public async Subscribe<A, K>(uri: WampURI, handler: EventHandler<A, K>, opts: any): Promise<ISubscription> {
      throw new Error("not implemented yet");
    }
    public async Publish<A, K>(uri: WampURI, args: A, kwargs: K, opts: PublishOptions): Promise<IPublication> {
      throw new Error("not implemented yet");
    }

    private async runConnection(): Promise<void> {
      const endpoint = this.connectionOptions.endpoint;
      for await (const event of this.transport.Open(endpoint)) {
        console.log(`Got event from transport: ${event.type}`);
        switch (event.type) {
          case ETransportEventType.OPEN: {
            this.sendHello();
          }
          break;
          case ETransportEventType.MESSAGE: {
            if (this.state.getState() === EConnectionState.ESTABLISHED) {
              await this.processMessage(event.message);
            }
            await this.processSessionMessage(event.message);
          }
          break;
          case ETransportEventType.CLOSE: {
            this.transport = null;
            this.state = null;
            if (!!this.onClose) {
              if (event.wasClean) {
                this.onClose.resolve({
                  code: event.code,
                  reason: event.reason,
                  wasClean: event.wasClean,
                });
              } else {
                this.onClose.reject(new ConnectionCloseError(event.reason, event.code));
              }
              this.onClose = null;
            }
          }
          break;
          case ETransportEventType.ERROR: {

          }
          break;
        }
        if (event.type === ETransportEventType.CLOSE) {
          break; // exit loop.
        }
      }
    }

    private sendHello(): void {
      console.log(`Sending hello!`);
      const details: HelloMessageDetails = {
        roles: {
          callee: {},
          caller: {},
          publisher: {},
          subscriber: {},
        },
        agent: "kraftfahrstrasse pre-alpha",
      };

      if(!!this.connectionOptions.authProvider) {
        details.authid = this.connectionOptions.authProvider.AuthID();
        details.authmethods = [this.connectionOptions.authProvider.AuthMethod()];
      }

      const msg: WampHelloMessage = [
        EWampMessageID.HELLO,
        this.connectionOptions.realm,
        details,
      ];
      this.transport.Send(msg);
      this.state.update([EMessageDirection.SENT, EWampMessageID.HELLO]);
    }

    private async processSessionMessage(msg: WampMessage): Promise<void> {
      this.state.update([EMessageDirection.RECEIVED, msg[0]]);
      switch (this.state.getState()) {
        case EConnectionState.CHALLENGING: {
          const challengeMsg = msg as WampChallengeMessage;
          const signature = await this.connectionOptions.authProvider.ComputeChallenge(challengeMsg[2]);
          this.transport.Send([
            EWampMessageID.AUTHENTICATE,
            signature.signature,
            signature.details || {},
          ]);
          this.state.update([EMessageDirection.SENT, EWampMessageID.AUTHENTICATE]);
        }
        break;
        case EConnectionState.ESTABLISHED: {
          //TODO: Extract authentication and session ID from the message
          this.onOpen.resolve();
          this.onOpen = null;
        }
        break;
        case EConnectionState.CLOSING: {
          // We received a GOODBYE message from the server, so reply with goodbye and shutdown the transport.
          this.transport.Send([
            EWampMessageID.GOODBYE,
            {
              "message": "clean close",
            },
            "wamp.close.goodbye_and_out",
          ]);
          this.state.update([EMessageDirection.SENT, EWampMessageID.GOODBYE]);
          this.transport.Close(1000, "wamp.close.normal");
        }
        break;
        case EConnectionState.CLOSED: {
          // Clean close finished, actually close the transport, so onClose and close Callbacks will be created
          this.transport.Close(1000, "wamp.close.normal");
        }
        break;
        case EConnectionState.ERROR: {
          // protocol violation, so close the transport not clean (i.e. code 3000)
          // and if we encountered the error, send an ABORT message to the server
          if (msg[0] !== EWampMessageID.ABORT) {
            this.transport.Send([
              EWampMessageID.ABORT,
              {
                "message": "protocol violation"
              },
              "wamp.error.protocol_violation"
            ]);
            this.transport.Close(3000, "wamp.error.protocol_violation");
            if (!!this.onOpen) {
              this.onOpen.reject(new ConnectionOpenError("protcol violation"));
              this.onOpen = null;
            }
          } else {
            this.transport.Close(3000, msg[2]);
            if (!!this.onOpen) {
              this.onOpen.reject(new ConnectionOpenError(msg[2], msg[1]));
              this.onOpen = null;
            }
          }
        }
        break;
      }
    }

    private async processMessage(msg: WampMessage): Promise<void> {
      if (msg[0] === EWampMessageID.GOODBYE) {
        this.state.update([EMessageDirection.RECEIVED, msg[0]]);
        return;
      }
      this.connectionOptions.logFunction(LogLevel.DEBUG, new Date(), "connection", `Received message: ${JSON.stringify(msg)}`);
    }
}
