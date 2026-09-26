// App-wide default font: make every <Text>/<TextInput> render in DM Sans
// unless it explicitly opts into another family (icon fonts, Plus Jakarta Sans for
// headings via `font('heading')`, or a specific DM Sans weight via `font()`).
//
// RN Text does not inherit fontFamily from ancestors, so a style that sets only
// a fontSize falls back to the system font. Rather than annotate every style in
// every screen, we wrap Text.render once and inject the right DM Sans face,
// mapping any fontWeight to its static family (our weights live in the family
// name, not in fontWeight — see fontHelpers).

import React from 'react';
import { Text, TextInput, StyleSheet } from 'react-native';
import { getFontFamily } from './fontHelpers';

let patched = false;

export function applyGlobalFont(): void {
  if (patched) return;
  patched = true;

  [Text, TextInput].forEach((Component: any) => {
    const original = Component?.render;
    if (typeof original !== 'function') return;

    Component.render = function patchedRender(...args: any[]) {
      const element = original.apply(this, args);
      if (!element || !element.props) return element;

      const flat = StyleSheet.flatten(element.props.style) || {};
      // Respect an explicitly chosen family (icon fonts, logo, DMSans-* weights).
      if (flat.fontFamily) return element;

      const family = getFontFamily((flat.fontWeight ?? 'normal') as any);
      // Set the weight-specific family and neutralise fontWeight so Android
      // doesn't add synthetic ("fake") bold on top of an already-bold face.
      return React.cloneElement(element, {
        style: [element.props.style, { fontFamily: family, fontWeight: 'normal' }],
      });
    };
  });
}
