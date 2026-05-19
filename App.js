import './global.css';
import React from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Weather from './src/Weather';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'light-content'}
        backgroundColor="#071927"
        translucent={false}
      />
      <Weather />
    </SafeAreaProvider>
  );
}

export default App;
