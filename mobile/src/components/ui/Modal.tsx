import React from 'react';
import { Modal as RNModal, type ModalProps } from 'react-native';

const ANY_ORIENTATION: ModalProps['supportedOrientations'] = ['portrait', 'portrait-upside-down', 'landscape'];

/**
 * RN's Modal, free to rotate. On iPhone a <Modal> without supportedOrientations
 * is portrait only, so opening any sheet in landscape spun the app back to
 * portrait. Import this instead of react-native's.
 */
export default function Modal(props: ModalProps) {
  return <RNModal supportedOrientations={ANY_ORIENTATION} {...props} />;
}
