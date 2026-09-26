import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Slot } from 'expo-router';


export default function App() {
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1 }}>
        <Slot />
        <StatusBar style="light" />
      </View>
    </SafeAreaProvider>
  );
}
