import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { WebSocket } from 'ws';

interface SubscribeMsg {
  subscribe: string; // claimId
}

/** WS /claims/:id (§8, all roles): live status. A single socket subscribes to one or more
 * claimIds by sending {"subscribe": claimId}; every guarded transition (transition.service.ts)
 * broadcasts to whoever's subscribed to that claim. */
@Injectable()
@WebSocketGateway({ path: '/claims' })
export class ClaimsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private subscriptions = new Map<string, Set<WebSocket>>();

  handleConnection(client: WebSocket) {
    client.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as SubscribeMsg;
        if (msg.subscribe) this.subscribe(msg.subscribe, client);
      } catch {
        // ignore malformed messages
      }
    });
  }

  handleDisconnect(client: WebSocket) {
    for (const sockets of this.subscriptions.values()) sockets.delete(client);
  }

  @SubscribeMessage('subscribe')
  subscribe(claimId: string, client: WebSocket) {
    if (!this.subscriptions.has(claimId)) this.subscriptions.set(claimId, new Set());
    this.subscriptions.get(claimId)!.add(client);
  }

  @OnEvent('claim.status-changed')
  handleStatusChanged(payload: { claimId: string; status: string }) {
    const sockets = this.subscriptions.get(payload.claimId);
    if (!sockets) return;
    const message = JSON.stringify({ claimId: payload.claimId, status: payload.status });
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) socket.send(message);
    }
  }
}
