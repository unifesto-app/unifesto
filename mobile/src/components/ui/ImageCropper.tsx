import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';
import { TopLayer } from './TopLayer';

/**
 * Full-screen "move and scale" cropper with a fixed-ratio frame. expo-image-picker's
 * built-in editor can't do this on iOS (it only crops square), so non-square images
 * (4:3 covers and banners) are framed here instead.
 *
 * Needs <ImageCropHost /> mounted once near the root; call `openImageCropper`.
 * Pure JS gestures (PanResponder), no extra native module.
 */

export interface CropRect {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

interface CropRequest {
  uri: string;
  width: number;
  height: number;
  aspect: number;
  resolve: (rect: CropRect | null) => void;
}

let open: ((req: CropRequest) => void) | null = null;

/** Resolves with the chosen rect in image pixels, or null if cancelled. */
export function openImageCropper(uri: string, width: number, height: number, aspect: number): Promise<CropRect | null> {
  return new Promise((resolve) => {
    if (!open) {
      resolve(null);
      return;
    }
    open({ uri, width, height, aspect, resolve });
  });
}

const MAX_ZOOM = 5;
const BG = '#000';
const DIM = 'rgba(0,0,0,0.62)';

export function ImageCropHost() {
  const [req, setReq] = useState<CropRequest | null>(null);

  useEffect(() => {
    open = (r) => setReq(r);
    return () => {
      open = null;
    };
  }, []);

  const finish = (rect: CropRect | null) => {
    req?.resolve(rect);
    setReq(null);
  };

  return (
    <TopLayer visible={!!req} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => finish(null)}>
      {req ? <Cropper key={req.uri} req={req} onDone={finish} /> : null}
    </TopLayer>
  );
}

function distance(touches: readonly { pageX: number; pageY: number }[]) {
  const [a, b] = touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

function Cropper({ req, onDone }: { req: CropRequest; onDone: (rect: CropRect | null) => void }) {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();

  const frameW = screenW - spacing[4] * 2;
  const frameH = frameW / req.aspect;
  // Scale at which the image exactly covers the frame (zoom 1).
  const base = Math.max(frameW / req.width, frameH / req.height);
  const baseW = req.width * base;
  const baseH = req.height * base;

  // Live transform, kept in refs (gesture math) and mirrored into Animated values (render).
  const t = useRef({ x: 0, y: 0, zoom: 1 });
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  const clamp = (x: number, y: number, zoom: number) => {
    const z = Math.min(MAX_ZOOM, Math.max(1, zoom));
    const maxX = (baseW * z - frameW) / 2;
    const maxY = (baseH * z - frameH) / 2;
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)), zoom: z };
  };

  const apply = (next: { x: number; y: number; zoom: number }) => {
    t.current = next;
    tx.setValue(next.x);
    ty.setValue(next.y);
    scale.setValue(next.zoom);
  };

  const pan = useMemo(() => {
    // Baseline for the current gesture segment; reset whenever the finger count changes.
    let start = { x: 0, y: 0, zoom: 1, dist: 0, dx: 0, dy: 0, touches: 0 };
    const begin = (touches: readonly { pageX: number; pageY: number }[], dx: number, dy: number) => {
      start = { ...t.current, dist: touches.length >= 2 ? distance(touches) : 0, dx, dy, touches: touches.length };
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e, g) => begin(e.nativeEvent.touches, g.dx, g.dy),
      onPanResponderMove: (e, g) => {
        const touches = e.nativeEvent.touches;
        if (touches.length !== start.touches) begin(touches, g.dx, g.dy);
        const zoom = touches.length >= 2 && start.dist > 0 ? start.zoom * (distance(touches) / start.dist) : start.zoom;
        apply(clamp(start.x + (g.dx - start.dx), start.y + (g.dy - start.dy), zoom));
      },
      onPanResponderTerminationRequest: () => false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameW, frameH, baseW, baseH]);

  const done = () => {
    const { x, y, zoom } = t.current;
    const s = base * zoom; // display px per image px
    const width = Math.min(req.width, Math.round(frameW / s));
    const height = Math.min(req.height, Math.round(frameH / s));
    const originX = ((req.width * s) / 2 - frameW / 2 - x) / s;
    const originY = ((req.height * s) / 2 - frameH / 2 - y) / s;
    onDone({
      originX: Math.max(0, Math.min(req.width - width, Math.round(originX))),
      originY: Math.max(0, Math.min(req.height - height, Math.round(originY))),
      width,
      height,
    });
  };

  const top = Math.max(insets.top + 64, (screenH - frameH) / 2 - 20);

  return (
    <View style={styles.root} {...pan.panHandlers}>
      {/* Image, centred on the frame and transformed around its centre. */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: spacing[4] + (frameW - baseW) / 2,
          top: top + (frameH - baseH) / 2,
          width: baseW,
          height: baseH,
          transform: [{ translateX: tx }, { translateY: ty }, { scale }],
        }}
      >
        <Image source={{ uri: req.uri }} style={{ width: baseW, height: baseH }} />
      </Animated.View>

      {/* Dim everything outside the frame. */}
      <View pointerEvents="none" style={[styles.dim, { top: 0, left: 0, right: 0, height: top }]} />
      <View pointerEvents="none" style={[styles.dim, { top: top + frameH, left: 0, right: 0, bottom: 0 }]} />
      <View pointerEvents="none" style={[styles.dim, { top, left: 0, width: spacing[4], height: frameH }]} />
      <View pointerEvents="none" style={[styles.dim, { top, right: 0, width: spacing[4], height: frameH }]} />

      {/* Frame + rule-of-thirds guides. */}
      <View pointerEvents="none" style={[styles.frame, { top, left: spacing[4], width: frameW, height: frameH }]}>
        <View style={[styles.guideV, { left: frameW / 3 }]} />
        <View style={[styles.guideV, { left: (frameW * 2) / 3 }]} />
        <View style={[styles.guideH, { top: frameH / 3 }]} />
        <View style={[styles.guideH, { top: (frameH * 2) / 3 }]} />
      </View>

      <Text pointerEvents="none" style={[styles.hint, { top: insets.top + spacing[4] }]}>
        Drag to move, pinch to zoom
      </Text>

      <View style={[styles.bar, { paddingBottom: insets.bottom + spacing[4] }]}>
        <Pressable hitSlop={12} onPress={() => onDone(null)}>
          <Text style={styles.action}>Cancel</Text>
        </Pressable>
        <Pressable hitSlop={12} onPress={done}>
          <Text style={[styles.action, styles.primary]}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG, overflow: 'hidden' },
  dim: { position: 'absolute', backgroundColor: DIM },
  frame: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)' },
  guideV: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.35)' },
  guideH: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.35)' },
  hint: { position: 'absolute', left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontSize: typography.fontSize.sm, ...font() },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[6],
    paddingTop: spacing[4],
  },
  action: { color: '#fff', fontSize: typography.fontSize.lg, ...font() },
  primary: { ...font('medium') },
});
