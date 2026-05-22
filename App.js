import './global.css';
import React from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Weather from './src/Weather';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: '#071927' }}
        edges={['left', 'right']}
      >
        <StatusBar
          barStyle="light-content"
          backgroundColor="#071927"
          translucent={false}
        />
        <Weather />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

export default App;
