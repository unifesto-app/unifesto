import React from 'react';
import { Platform, StyleSheet, View, type ModalProps } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import Modal from './Modal';

/**
 * A full-screen layer that sits above everything, native modal routes included.
 *
 * iOS: an RN <Modal> rendered at the root presents from the root controller, so
 * over a native `presentation: 'modal'` route (event-registration) it can fail
 * to show at all. FullWindowOverlay draws in its own window instead.
 * Android keeps <Modal>: it is a Dialog window (already on top) and owns the back button.
 * Takes Modal's props so hosts swap one tag; iOS ignores the animation/presentation ones.
 */
export function TopLayer(props: ModalProps) {
  if (Platform.OS !== 'ios') return <Modal {...props} />;
  if (props.visible === false) return null;
  return (
    <FullWindowOverlay>
      <View style={StyleSheet.absoluteFill}>{props.children}</View>
    </FullWindowOverlay>
  );
}
