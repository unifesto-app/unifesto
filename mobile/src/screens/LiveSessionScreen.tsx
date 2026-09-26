import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
import { useTheme } from '../context/ThemeContext';
import { GlassFill, LIQUID_GLASS } from '../components/ui/CardSurface';
import { joinSession } from '../lib/api/sessions';

/**
 * In-app live room for a UNIFESTO_LIVE session, powered by LiveKit.
 *
 * We ask the backend for a join credential (which enforces the paid-registrant
 * + join-window gate) and connect with the resulting per-user token + server
 * URL. Nothing shareable is ever exposed — no URL, and the token names this
 * user and expires when the session's join window closes.
 */
export default function LiveSessionScreen({ sessionId }: { sessionId: string }) {
  const { colors } = useTheme();
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
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.msg, { color: colors.textSecondary }]}>
          Joining the live room…
        </Text>
      </View>
    );
  }

  if (error || !conn) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.msg, { color: colors.text }]}>
          {error || 'Could not join the room.'}
        </Text>
        <TouchableOpacity style={styles.leaveBtn} onPress={() => router.back()}>
          <Text style={styles.leaveText}>Go back</Text>
        </TouchableOpacity>
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
          <Text style={styles.waiting}>Waiting for video…</Text>
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
              icon={isMicrophoneEnabled ? 'mic' : 'mic-off'}
              label={isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
              onPress={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
            />
            <CallControl
              icon={isCameraEnabled ? 'videocam' : 'videocam-off'}
              label={isCameraEnabled ? 'Turn camera off' : 'Turn camera on'}
              onPress={() => localParticipant.setCameraEnabled(!isCameraEnabled)}
            />
          </>
        )}
        <CallControl icon="chatbubble-ellipses" label="Open chat" onPress={() => setChatOpen(true)} />
        <CallControl icon="call" label="Leave session" onPress={onLeave} danger />
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
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.chatHeader}>
          <Text style={styles.chatTitle}>Chat</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.chatList}
          contentContainerStyle={{ padding: 16, gap: 12 }}
        >
          {chatMessages.length === 0 && (
            <Text style={styles.waiting}>No messages yet. Say hello 👋</Text>
          )}
          {chatMessages.map((m) => (
            <View key={m.id ?? `${m.timestamp}-${m.from?.identity}`}>
              <Text style={styles.chatFrom}>
                {m.from?.name || m.from?.identity || 'Someone'}
              </Text>
              <Text style={styles.chatMessage}>{m.message}</Text>
            </View>
          ))}
        </ScrollView>

        <View style={styles.chatInputRow}>
          <TextInput
            style={styles.chatInput}
            value={draft}
            onChangeText={setDraft}
            placeholder="Message…"
            placeholderTextColor="#888"
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
          <TouchableOpacity style={styles.chatSend} onPress={handleSend}>
            <Ionicons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// The call canvas is always dark, so the glass carries a fixed dark tint whatever the app theme.
const CONTROL_TINT = 'rgba(42, 42, 42, 0.55)';

/** Round call control: Liquid Glass on iOS 26+, flat dark disc elsewhere; Leave stays solid red. */
function CallControl({
  icon,
  label,
  onPress,
  danger = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
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
        danger ? styles.leaveCtrl : glass ? { backgroundColor: 'transparent' } : null,
        { transform: [{ scale: pressed ? 0.94 : 1 }] },
      ]}
    >
      {glass ? <GlassFill radius={28} tint={CONTROL_TINT} interactive /> : null}
      <Ionicons name={icon} size={24} color="#fff" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  msg: { marginTop: 12, fontSize: 15, textAlign: 'center' },
  grid: {
    flexGrow: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  waiting: { color: '#888', fontSize: 15 },
  tile: {
    width: '47%',
    aspectRatio: 3 / 4,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#161616',
  },
  screenTile: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  video: { flex: 1 },
  tileName: {
    position: 'absolute',
    bottom: 6,
    left: 8,
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 3,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    paddingVertical: 20,
    backgroundColor: '#111',
  },
  ctrl: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaveCtrl: { backgroundColor: '#d11' },
  leaveBtn: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#2a2a2a',
  },
  leaveText: { color: '#fff', fontWeight: '600' },
  chatContainer: { flex: 1, backgroundColor: '#0a0a0a' },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingTop: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333',
  },
  chatTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  chatList: { flex: 1 },
  chatFrom: { color: '#9aa', fontSize: 12, fontWeight: '600', marginBottom: 2 },
  chatMessage: { color: '#fff', fontSize: 15 },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#333',
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#1c1c1c',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 15,
  },
  chatSend: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3491ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
