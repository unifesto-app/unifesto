import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  ChatCircleDots,
  type Icon,
  Microphone,
  MicrophoneSlash,
  PaperPlaneRight,
  PhoneDisconnect,
  VideoCamera,
  VideoCameraSlash,
  X,
} from '@unifesto/unicon/react-native';
import { useRouter } from 'expo-router';
// Import @livekit/react-native before livekit-client so its DOMException
// polyfill is installed first. Globals are also registered at the app entry
// (entry.js) — this ordering is defence-in-depth.
import {
  AudioSession,
  LiveKitRoom,
  VideoTrack,
  useTracks,
  useLocalParticipant,
  useChat,
  isTrackReference,
} from '@livekit/react-native';
import { Track } from 'livekit-client';
import { GlassFill, LIQUID_GLASS } from '../components/ui/CardSurface';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import { Button } from '../components/ui';
import { joinSession } from '../lib/api/sessions';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, cosmosFor, cosmosRadius, useCosmos } from '../theme/cosmos';

// The call canvas is dark in any app theme (video reads best on black), so the
// room uses the dark cosmos set; the joining states and the chat follow the app.
const NIGHT = cosmosFor('dark');
/** Names over a video frame. */
const WHITE = '#ffffff';

/**
 * In-app live room for a UNIFESTO_LIVE session, powered by LiveKit.
 *
 * We ask the backend for a join credential (which enforces the paid-registrant
 * + join-window gate) and connect with the resulting per-user token + server
 * URL. Nothing shareable is ever exposed — no URL, and the token names this
 * user and expires when the session's join window closes.
 */
export default function LiveSessionScreen({ sessionId }: { sessionId: string }) {
  const c = useCosmos();
  const router = useRouter();

  const [conn, setConn] = useState<{
    serverUrl: string;
    token: string;
    canPublish: boolean;
  } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await joinSession(sessionId);
        if (!active) return;
        if (result.mode === 'livekit') {
          setConn({
            serverUrl: result.serverUrl,
            token: result.token,
            canPublish: result.canPublish,
          });
        } else {
          setError('This session is hosted on an external platform.');
        }
      } catch (err: any) {
        if (active)
          setError(err?.message || 'You can join closer to the start time.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [sessionId]);

  // Manage the OS audio session for the duration of the call.
  useEffect(() => {
    let started = false;
    if (conn) {
      AudioSession.startAudioSession()
        .then(() => {
          started = true;
        })
        .catch(() => {});
    }
    return () => {
      if (started) AudioSession.stopAudioSession().catch(() => {});
    };
  }, [conn]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <CosmosBackdrop horizon={false} />
        <ActivityIndicator color={c.text} />
        <Text style={[styles.msg, { color: c.soft }]}>
          Joining the live room…
        </Text>
      </View>
    );
  }

  if (error || !conn) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <CosmosBackdrop horizon={false} />
        <View style={[styles.errorCard, { backgroundColor: c.raised }]}>
          <Text style={[styles.msg, { color: c.soft, marginTop: 0 }]}>
            {error || 'Could not join the room.'}
          </Text>
          <Button label="Go back" variant="secondary" onPress={() => router.back()} style={{ marginTop: spacing[4], alignSelf: 'center' }} />
        </View>
      </View>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={conn.serverUrl}
      token={conn.token}
      connect
      audio={conn.canPublish}
      video={conn.canPublish}
      onDisconnected={() => router.back()}
      onError={(e) => setError(e?.message || 'Connection error')}
    >
      <RoomView canPublish={conn.canPublish} onLeave={() => router.back()} />
    </LiveKitRoom>
  );
}

/** Inner view — must live under <LiveKitRoom> to use the room hooks. */
function RoomView({
  canPublish,
  onLeave,
}: {
  canPublish: boolean;
  onLeave: () => void;
}) {
  // Keep only real published tracks — placeholder refs (participant present but
  // camera off) have no track to render. Include screen shares so shared
  // screens are visible, and split them out to show them prominently.
  const allTracks = useTracks(
    [Track.Source.Camera, Track.Source.ScreenShare],
    { onlySubscribed: false },
  ).filter(isTrackReference);
  const screenShares = allTracks.filter(
    (t) => t.source === Track.Source.ScreenShare,
  );
  const cameras = allTracks.filter((t) => t.source === Track.Source.Camera);

  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } =
    useLocalParticipant();

  const [chatOpen, setChatOpen] = useState(false);

  return (
    <View style={styles.fill}>
      <ScrollView contentContainerStyle={styles.grid}>
        {allTracks.length === 0 && (
          <Text style={[styles.waiting, { color: NIGHT.muted }]}>Waiting for video…</Text>
        )}

        {/* Screen shares span the full width so they're readable. */}
        {screenShares.map((ref) => (
          <View
            key={`${ref.participant.identity}-screen`}
            style={styles.screenTile}
          >
            <VideoTrack
              trackRef={ref}
              objectFit="contain"
              style={styles.video}
            />
            <Text style={styles.tileName} numberOfLines={1}>
              {(ref.participant.isLocal ? 'You' : ref.participant.name || 'Guest') +
                ' — screen'}
            </Text>
          </View>
        ))}

        {cameras.map((ref) => (
          <View
            key={`${ref.participant.identity}-camera`}
            style={styles.tile}
          >
            <VideoTrack trackRef={ref} objectFit="cover" style={styles.video} />
            <Text style={styles.tileName} numberOfLines={1}>
              {ref.participant.isLocal ? 'You' : ref.participant.name || 'Guest'}
            </Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.controls}>
        {canPublish && (
          <>
            <CallControl
              icon={isMicrophoneEnabled ? Microphone : MicrophoneSlash}
              label={isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
              onPress={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
            />
            <CallControl
              icon={isCameraEnabled ? VideoCamera : VideoCameraSlash}
              label={isCameraEnabled ? 'Turn camera off' : 'Turn camera on'}
              onPress={() => localParticipant.setCameraEnabled(!isCameraEnabled)}
            />
          </>
        )}
        <CallControl icon={ChatCircleDots} label="Open chat" onPress={() => setChatOpen(true)} />
        <CallControl icon={PhoneDisconnect} label="Leave session" onPress={onLeave} danger />
      </View>

      <ChatPanel visible={chatOpen} onClose={() => setChatOpen(false)} />
    </View>
  );
}

/** In-room text chat, backed by LiveKit's data channel. */
function ChatPanel({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const c = useCosmos();
  const { chatMessages, send } = useChat();
  const [draft, setDraft] = useState('');

  async function handleSend() {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    try {
      await send(text);
    } catch {
      // Sending failed (not connected yet) — drop silently.
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.chatContainer, { backgroundColor: c.bg }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <CosmosBackdrop horizon={false} />
        <View style={[styles.chatHeader, { borderBottomColor: c.border }]}>
          <Text style={[styles.chatTitle, { color: c.text }]} accessibilityRole="header">Chat</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close chat">
            <X size={26} color={c.text} weight="bold" />
          </Pressable>
        </View>

        <ScrollView
          style={styles.chatList}
          contentContainerStyle={{ padding: 16, gap: 12 }}
        >
          {chatMessages.length === 0 && (
            <Text style={[styles.waiting, { color: c.muted }]}>No messages yet. Say hello 👋</Text>
          )}
          {chatMessages.map((m) => (
            <View key={m.id ?? `${m.timestamp}-${m.from?.identity}`}>
              <Text style={[styles.chatFrom, { color: c.muted }]}>
                {m.from?.name || m.from?.identity || 'Someone'}
              </Text>
              <Text style={[styles.chatMessage, { color: c.text }]}>{m.message}</Text>
            </View>
          ))}
        </ScrollView>

        <View style={[styles.chatInputRow, { borderTopColor: c.border }]}>
          <TextInput
            style={[styles.chatInput, { backgroundColor: c.card, borderColor: c.input, color: c.text }]}
            value={draft}
            onChangeText={setDraft}
            placeholder="Message…"
            placeholderTextColor={c.muted}
            selectionColor={c.text}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
          <Pressable
            style={({ pressed }) => [styles.chatSend, { backgroundColor: c.primary, opacity: pressed ? 0.85 : 1 }]}
            onPress={handleSend}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            <PaperPlaneRight size={20} color={c.primaryFg} weight="fill" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// The glass carries a fixed dark tint whatever the app theme.
const CONTROL_TINT = 'rgba(42, 42, 42, 0.55)';

/** Round call control: Liquid Glass on iOS 26+, flat dark disc elsewhere; Leave stays solid red. */
function CallControl({
  icon: IconGlyph,
  label,
  onPress,
  danger = false,
}: {
  icon: Icon;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const glass = LIQUID_GLASS && !danger;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      // Scale, not opacity: opacity breaks Liquid Glass.
      style={({ pressed }) => [
        styles.ctrl,
        danger ? { backgroundColor: NIGHT.danger } : glass ? { backgroundColor: 'transparent' } : null,
        { transform: [{ scale: pressed ? 0.94 : 1 }] },
      ]}
    >
      {glass ? <GlassFill radius={28} tint={CONTROL_TINT} interactive /> : null}
      <IconGlyph size={24} color={danger ? NIGHT.primaryFg : NIGHT.text} weight="fill" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: NIGHT.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorCard: { alignSelf: 'stretch', borderRadius: cosmosCardRadius, padding: spacing[6] },
  msg: { marginTop: 12, fontSize: typography.fontSize.base, lineHeight: 22, textAlign: 'center', ...cosmosFont.body },
  grid: {
    flexGrow: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  waiting: { fontSize: typography.fontSize.base, ...cosmosFont.body },
  tile: {
    width: '47%',
    aspectRatio: 3 / 4,
    borderRadius: cosmosRadius,
    overflow: 'hidden',
    backgroundColor: NIGHT.raised,
  },
  screenTile: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: cosmosRadius,
    overflow: 'hidden',
    backgroundColor: NIGHT.bg,
  },
  video: { flex: 1 },
  tileName: {
    position: 'absolute',
    bottom: 6,
    left: 8,
    color: WHITE,
    fontSize: 12,
    ...cosmosFont.strong,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 3,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    paddingVertical: 20,
    backgroundColor: NIGHT.card,
  },
  ctrl: {
    width: 56,
    height: 56,
    borderRadius: 28,
    // A soft silver disc on the dark bar (the old #2a2a2a).
    backgroundColor: NIGHT.input,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatContainer: { flex: 1 },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingTop: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  chatTitle: { fontSize: 17, lineHeight: 24, ...cosmosFont.display },
  chatList: { flex: 1 },
  chatFrom: { fontSize: 12, marginBottom: 2, ...cosmosFont.strong },
  chatMessage: { fontSize: typography.fontSize.base, lineHeight: 22, ...cosmosFont.body },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  chatInput: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: typography.fontSize.base,
    ...cosmosFont.body,
  },
  chatSend: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
