import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AccessToken,
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  RoomServiceClient,
  S3Upload,
  WebhookReceiver,
  type WebhookEvent,
} from 'livekit-server-sdk';
import { LIVEKIT_CLIENT_OPTIONS } from '../common/http/outbound-timeouts';

/**
 * LiveKit integration for UNIFESTO_LIVE sessions.
 *
 * The join credential is a per-user JWT signed locally with the API secret —
 * never a URL. It names one identity, scopes to one room, carries grants (a
 * host may publish + administer; everyone may publish/subscribe in these
 * interactive sessions), and expires. Forwarding it is pointless: it identifies
 * a specific user and dies when the join window closes.
 *
 * Rooms auto-create on first join, so there is no room-provisioning call and
 * nothing to persist — the room name is derived deterministically from the
 * session id.
 */
@Injectable()
export class LivekitService {
  private readonly logger = new Logger(LivekitService.name);

  private get apiKey(): string {
    return process.env.LIVEKIT_API_KEY!;
  }
  private get apiSecret(): string {
    return process.env.LIVEKIT_API_SECRET!;
  }
  /** wss:// URL of the LiveKit server (Cloud or self-hosted). */
  get serverUrl(): string | undefined {
    return process.env.LIVEKIT_URL;
  }

  /** https:// host for REST calls (egress). Derived from the ws(s) URL. */
  private get httpUrl(): string {
    return (process.env.LIVEKIT_URL ?? '').replace(/^ws/, 'http');
  }

  get isConfigured(): boolean {
    return Boolean(
      process.env.LIVEKIT_API_KEY &&
        process.env.LIVEKIT_API_SECRET &&
        process.env.LIVEKIT_URL,
    );
  }

  /**
   * Egress records on LiveKit's infra, so it can't use our instance IAM role —
   * it needs explicit S3 credentials. Recording is therefore only available when
   * those are set (separate from the main config).
   */
  get isRecordingConfigured(): boolean {
    return Boolean(
      this.isConfigured &&
        process.env.LIVEKIT_S3_ACCESS_KEY &&
        process.env.LIVEKIT_S3_SECRET &&
        process.env.AWS_REGION &&
        process.env.S3_BUCKET_NAME,
    );
  }

  private egressClient(): EgressClient {
    return new EgressClient(
      this.httpUrl,
      this.apiKey,
      this.apiSecret,
      LIVEKIT_CLIENT_OPTIONS,
    );
  }

  private webhookReceiver(): WebhookReceiver {
    return new WebhookReceiver(this.apiKey, this.apiSecret);
  }

  private assertConfigured() {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException(
        'In-app live sessions are not configured on this environment',
      );
    }
  }

  /** Deterministic room name for a session — no storage needed. */
  roomName(sessionId: string): string {
    return `sess_${sessionId}`;
  }

  /**
   * Mint a per-user join token. `role: "host"` additionally gets room-admin
   * (mute/remove others). In a broadcast session only the host may publish;
   * interactive sessions let everyone publish. Signed locally — no round-trip.
   */
  async mintToken(params: {
    room: string;
    identity: string;
    name: string;
    role: 'host' | 'viewer';
    interactive: boolean;
    ttlSeconds: number;
  }): Promise<string> {
    this.assertConfigured();
    const isHost = params.role === 'host';
    const canPublish = isHost || params.interactive;
    const at = new AccessToken(this.apiKey, this.apiSecret, {
      identity: params.identity,
      name: params.name,
      ttl: params.ttlSeconds,
    });
    at.addGrant({
      roomJoin: true,
      room: params.room,
      canPublish,
      canSubscribe: true,
      canPublishData: canPublish,
      roomAdmin: isHost,
    });
    try {
      return await at.toJwt();
    } catch (err) {
      this.logger.error(`LiveKit token mint failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Could not start the live room.');
    }
  }

  /**
   * Start recording a room to S3 (composite of everyone). Returns the egress id
   * (to stop it) and the S3 object key we expect the file at. Only available
   * when S3 egress credentials are configured.
   */
  async startRecording(
    room: string,
    sessionId: string,
  ): Promise<{ egressId: string; filepath: string }> {
    if (!this.isRecordingConfigured) {
      throw new ServiceUnavailableException(
        'Recording is not configured on this environment',
      );
    }
    // Egress can only attach to a room that exists. If the organiser starts
    // recording before anyone has joined, the room isn't there yet — so ensure
    // it first (no-op if it already exists).
    await this.ensureRoom(room);

    const filepath = `sessions/${sessionId}/${Date.now()}.mp4`;
    const output = new EncodedFileOutput({
      fileType: EncodedFileType.MP4,
      filepath,
      output: {
        case: 's3',
        value: new S3Upload({
          accessKey: process.env.LIVEKIT_S3_ACCESS_KEY,
          secret: process.env.LIVEKIT_S3_SECRET,
          region: process.env.AWS_REGION,
          bucket: process.env.S3_BUCKET_NAME,
        }),
      },
    });
    const info = await this.egressClient().startRoomCompositeEgress(
      room,
      output,
    );
    return { egressId: info.egressId, filepath };
  }

  async stopRecording(egressId: string): Promise<void> {
    if (!this.isConfigured) return;
    try {
      await this.egressClient().stopEgress(egressId);
    } catch (err) {
      // The egress may already have stopped (e.g. room ended) — not fatal.
      this.logger.warn(`stopEgress(${egressId}) failed: ${(err as Error).message}`);
    }
  }

  /** Ensure a room exists (idempotent). Needed before egress can attach. */
  async ensureRoom(room: string): Promise<void> {
    if (!this.isConfigured) return;
    try {
      await new RoomServiceClient(
        this.httpUrl,
        this.apiKey,
        this.apiSecret,
        LIVEKIT_CLIENT_OPTIONS,
      ).createRoom({ name: room });
    } catch (err) {
      // Already exists (or a transient error) — recording will still attach.
      this.logger.warn(`createRoom(${room}) failed: ${(err as Error).message}`);
    }
  }

  /** Disconnect everyone and close the room (used when a session is ended). */
  async endRoom(room: string): Promise<void> {
    if (!this.isConfigured) return;
    try {
      await new RoomServiceClient(
        this.httpUrl,
        this.apiKey,
        this.apiSecret,
        LIVEKIT_CLIENT_OPTIONS,
      ).deleteRoom(room);
    } catch (err) {
      // No active room (nobody joined / already closed) is fine.
      this.logger.warn(`deleteRoom(${room}) failed: ${(err as Error).message}`);
    }
  }

  /** Disconnect one participant (a removed co-host). Not in the room is fine. */
  async removeParticipant(room: string, identity: string): Promise<void> {
    if (!this.isConfigured) return;
    try {
      await new RoomServiceClient(
        this.httpUrl,
        this.apiKey,
        this.apiSecret,
        LIVEKIT_CLIENT_OPTIONS,
      ).removeParticipant(room, identity);
    } catch (err) {
      this.logger.warn(`removeParticipant(${room}, ${identity}) failed: ${(err as Error).message}`);
    }
  }

  /** Public URL for an S3 object key in our bucket. */
  s3Url(key: string): string {
    return `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  }

  /** Validate and parse a LiveKit webhook. Throws if the signature is invalid. */
  async receiveWebhook(body: string, authHeader?: string): Promise<WebhookEvent> {
    return this.webhookReceiver().receive(body, authHeader);
  }
}
