import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  Linking,
  PermissionsAndroid,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Geolocation from 'react-native-geolocation-service';
import notifee, { AndroidImportance, TriggerType } from '@notifee/react-native';

const WEATHER_CACHE_KEY = 'wx:weather';
const COORDS_CACHE_KEY = 'wx:coords';
const RAIN_START_TIME_KEY = 'wx:rain_start_time';
const RAIN_NOTIFICATION_STATE_KEY = 'wx:rain_notification_state';

const RAIN_ALERT_NOTIFICATION_ID = 'namma-weather-rain-alert';
const RAIN_ALERT_CHANNEL_ID = 'weather-alerts';

const RAIN_STOP_THRESHOLD = 20;
const WEATHER_REFRESH_MS = 15 * 60 * 1000;
const MIN_REAL_RAIN_MM = 0.3;

const WMO_MAP = {
  0: { label: 'Dombu', emoji: '☀️', art: 'sunny' },
  1: { label: 'Kammi Dombu (Modda)', emoji: '🌤️', art: 'sunny' },
  2: { label: 'Onthe Mugal', emoji: '⛅', art: 'cloudy' },
  3: { label: 'Modda', emoji: '☁️', art: 'cloudy' },
  45: { label: 'Maindu', emoji: '🌫️', art: 'fog' },
  48: { label: 'Maindu', emoji: '🌫️', art: 'fog' },

  51: { label: 'Churu Dombu Barsa', emoji: '🌦️', art: 'rain' },
  53: { label: 'Dombu Barsa', emoji: '🌦️', art: 'rain' },
  55: { label: 'Joru Dombu Barsa', emoji: '🌧️', art: 'rain' },
  56: { label: 'Chali DombuBarsa', emoji: '🌧️', art: 'rain' },
  57: { label: 'Jor Chali Dombu Barsa', emoji: '🌧️', art: 'rain' },

  61: { label: 'Panit Barsa', emoji: '🌧️', art: 'rain' },
  63: { label: 'Barsa', emoji: '🌧️', art: 'rain' },
  65: { label: 'Bolla Barsa', emoji: '🌧️', art: 'rain' },
  66: { label: 'Chali Barsa', emoji: '🌧️', art: 'rain' },
  67: { label: 'Masth Chali Barsa', emoji: '🌧️', art: 'rain' },

  71: { label: 'Panit Ice', emoji: '🌨️', art: 'snow' },
  73: { label: 'Hima', emoji: '🌨️', art: 'snow' },
  75: { label: 'Joru Hima', emoji: '❄️', art: 'snow' },
  77: { label: 'Chimma Hima', emoji: '❄️', art: 'snow' },

  80: { label: 'Onthe barsa barpund', emoji: '🌦️', art: 'rain' },
  81: { label: 'Barsa Barondhu undu', emoji: '🌦️', art: 'rain' },
  82: { label: 'Joru Barsa Barondhu undu', emoji: '⛈️', art: 'storm' },

  85: { label: 'Chimma Barsa', emoji: '🌨️', art: 'snow' },
  86: { label: 'Masth Chimma Barsa', emoji: '🌨️', art: 'snow' },

  95: { label: 'Tedil Boka Barsa', emoji: '⛈️', art: 'storm' },
  96: { label: 'Tedil Boka onthe Barsa', emoji: '⛈️', art: 'storm' },
  99: { label: 'Tedil Boka Joru Barsa', emoji: '⛈️', art: 'storm' },
};
const RAIN_CODES = [
  51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 85, 86, 95, 96, 99,
];

const ART_EMOJI = {
  sunny: '☀️',
  cloudy: '⛅',
  fog: '🌫️',
  rain: '🌧️',
  storm: '⛈️',
  snow: '❄️',
};

const isRainCode = code => RAIN_CODES.includes(Number(code));

const hasRealRain = value => Number(value || 0) >= MIN_REAL_RAIN_MM;

const isActualRainNow = (code, rainAmount) =>
  isRainCode(code) && hasRealRain(rainAmount);

const isRealFutureRain = item => {
  const chance = Number(item.rainChance ?? 0);
  const precipMm = Number(item.precipMm ?? 0);
  const codeRain = isRainCode(item.code);

  return chance >= 70 || precipMm >= 0.2 || codeRain;
};

const getWeatherInfo = code =>
  WMO_MAP[Number(code)] || { label: 'Modda', emoji: '☁️', art: 'cloudy' };

const getSafeWeatherInfo = (code, rainAmount = 0) => {
  if (isRainCode(code) && !hasRealRain(rainAmount)) {
    return WMO_MAP[3];
  }

  return getWeatherInfo(code);
};

const getHourlyWeatherInfo = item => {
  const chance = Number(item.rainChance ?? 0);
  const precipMm = Number(item.precipMm ?? 0);

  if (chance >= 70 || precipMm >= 0.2 || isRainCode(item.code)) {
    return getWeatherInfo(item.code);
  }

  return getSafeWeatherInfo(item.code, precipMm);
};

const toClockTime = ts =>
  new Date(ts).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

const formatTime = dt => {
  if (!dt) return '--';

  return new Date(dt).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const formatHour = dt => {
  let h = new Date(dt).getHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}${ap}`;
};

const toNumberOrNull = value => {
  const n = Number(value);
  return value === null || value === undefined || Number.isNaN(n) ? null : n;
};

const formatOptional = (value, digits = 0) => {
  const n = toNumberOrNull(value);
  if (n === null) return '--';
  return n.toFixed(digits);
};

const cleanLocationName = value => {
  if (!value || typeof value !== 'string') return null;

  const cleaned = value.replace(/\s+/g, ' ').trim();
  const lowered = cleaned.toLowerCase();

  if (
    !cleaned ||
    lowered === 'unknown' ||
    lowered === 'null' ||
    lowered === 'undefined'
  ) {
    return null;
  }

  return cleaned;
};

const pickFirstLocationName = (...values) => {
  for (const value of values) {
    const cleaned = cleanLocationName(value);
    if (cleaned) return cleaned;
  }

  return null;
};

const getNearestHourlyIndex = times => {
  if (!Array.isArray(times) || !times.length) return 0;

  const now = Date.now();
  let bestIndex = 0;
  let bestDiff = Infinity;

  times.forEach((time, index) => {
    const diff = Math.abs(new Date(time).getTime() - now);

    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = index;
    }
  });

  return bestIndex;
};

const getAQIInfo = value => {
  const n = toNumberOrNull(value);

  if (n === null) {
    return {
      value: '--',
      label: 'Unavailable',
      color: '#8A9BB0',
      message: 'AQI data not available now',
    };
  }

  const aqi = Math.round(n);

  if (aqi <= 50) {
    return {
      value: aqi,
      label: 'Good',
      color: '#4DFFB4',
      message: 'Air quality is healthy',
    };
  }

  if (aqi <= 100) {
    return {
      value: aqi,
      label: 'Moderate',
      color: '#FFD166',
      message: 'Acceptable air quality',
    };
  }

  if (aqi <= 150) {
    return {
      value: aqi,
      label: 'Sensitive',
      color: '#FFB347',
      message: 'Sensitive people be careful',
    };
  }

  if (aqi <= 200) {
    return {
      value: aqi,
      label: 'Unhealthy',
      color: '#FF6B6B',
      message: 'Avoid long outdoor activity',
    };
  }

  if (aqi <= 300) {
    return {
      value: aqi,
      label: 'Very Unhealthy',
      color: '#C084FC',
      message: 'Outdoor activity not recommended',
    };
  }

  return {
    value: aqi,
    label: 'Hazardous',
    color: '#FF4D6D',
    message: 'Stay indoors if possible',
  };
};

const getUVInfo = value => {
  const n = toNumberOrNull(value);

  if (n === null) {
    return {
      value: '--',
      label: 'Unavailable',
      color: '#8A9BB0',
      message: 'UV data not available now',
    };
  }

  const uv = Number(n.toFixed(1));

  if (uv <= 2) {
    return {
      value: uv,
      label: 'Low',
      color: '#4DFFB4',
      message: 'Safe for normal outdoor time',
    };
  }

  if (uv <= 5) {
    return {
      value: uv,
      label: 'Moderate',
      color: '#FFD166',
      message: 'Use sunscreen if outside longer',
    };
  }

  if (uv <= 7) {
    return {
      value: uv,
      label: 'High',
      color: '#FFB347',
      message: 'Use sunscreen and sunglasses',
    };
  }

  if (uv <= 10) {
    return {
      value: uv,
      label: 'Very High',
      color: '#FF6B6B',
      message: 'Avoid direct afternoon sun',
    };
  }

  return {
    value: uv,
    label: 'Extreme',
    color: '#FF4D6D',
    message: 'Stay shaded as much as possible',
  };
};

const createWeatherNotificationChannel = async () => {
  if (Platform.OS === 'android') {
    return notifee.createChannel({
      id: RAIN_ALERT_CHANNEL_ID,
      name: 'Weather Alerts',
      importance: AndroidImportance.HIGH,
    });
  }

  return RAIN_ALERT_CHANNEL_ID;
};

const cancelRainNotification = async () => {
  try {
    await notifee.cancelNotification(RAIN_ALERT_NOTIFICATION_ID);

    if (typeof notifee.cancelTriggerNotification === 'function') {
      await notifee.cancelTriggerNotification(RAIN_ALERT_NOTIFICATION_ID);
    }
  } catch {}
};

const findRainStopSlot = hourlyList => {
  if (!Array.isArray(hourlyList) || !hourlyList.length) return null;

  return (
    hourlyList.find(item => {
      const chance = Number(item.rainChance ?? 0);
      const precipMm = Number(item.precipMm ?? 0);

      return chance < RAIN_STOP_THRESHOLD && !hasRealRain(precipMm);
    }) || null
  );
};

const buildRainStopLabel = stopTime => {
  if (!stopTime) return 'Rain may continue today';

  const now = Date.now();
  const stopMs = Number(stopTime);
  const diffMs = stopMs - now;

  if (diffMs <= 0) return 'Stops soon';

  const minutes = Math.max(1, Math.round(diffMs / 60000));

  if (minutes <= 5) return `Stops in ~${minutes} min`;

  if (minutes < 60) {
    const rounded = Math.max(5, Math.round(minutes / 5) * 5);
    return `Stops in ~${rounded} min`;
  }

  const hours = Math.round(minutes / 60);

  if (hours <= 1) return 'Stops in ~1 hr';
  if (hours <= 2) return 'Stops in ~2 hrs';
  if (hours <= 3) return `Stops in ~${hours} hrs`;

  return `Stops around ${toClockTime(stopMs)}`;
};

const buildRainStopNotificationLabel = stopTime => {
  if (!stopTime) return 'Eni Barsa Borondhu Ippundu';

  const now = Date.now();
  const stopMs = Number(stopTime);
  const diffMs = stopMs - now;

  if (diffMs <= 0) return 'Bega Untundu';

  const minutes = Math.max(1, Math.round(diffMs / 60000));

  if (minutes <= 5) return `~${minutes} min d Untundu`;

  if (minutes < 60) {
    const rounded = Math.max(5, Math.round(minutes / 5) * 5);
    return `~${rounded} min d Untundu`;
  }

  const hours = Math.round(minutes / 60);

  if (hours <= 1) return '~1 gante d Untundu';
  if (hours <= 2) return '~2 gante d Untundu';
  if (hours <= 3) return `~${hours} gante d Untundu`;

  return `${toClockTime(stopMs)} ganteg Untundu`;
};

const predictRain = (hourlyList, currentActualCode, currentPrecipitation) => {
  if (!hourlyList?.length) return { state: 'no_rain' };

  const currentPrecipitationAmount = Number(currentPrecipitation || 0);

  const actuallyRainingNow = isActualRainNow(
    currentActualCode,
    currentPrecipitationAmount,
  );

  if (actuallyRainingNow) {
    const stopSlot = findRainStopSlot(hourlyList);
    const stopTime = stopSlot ? new Date(stopSlot.time).getTime() : null;

    return {
      state: 'raining_now',
      stopTime,
      stopTimeLabel: buildRainStopLabel(stopTime),
    };
  }

  const now = Date.now();

  const firstRainSlot = hourlyList.find(item => {
    const itemTime = new Date(item.time).getTime();

    if (itemTime <= now + 5 * 60 * 1000) {
      return false;
    }

    return isRealFutureRain(item);
  });

  if (!firstRainSlot) return { state: 'no_rain' };

  const startIndex = hourlyList.indexOf(firstRainSlot);

  const stopAfterRain = hourlyList.find((item, index) => {
    if (index <= startIndex) return false;

    const chance = Number(item.rainChance ?? 0);
    const precipMm = Number(item.precipMm ?? 0);

    return chance < RAIN_STOP_THRESHOLD && !hasRealRain(precipMm);
  });

  const rainWindow = hourlyList.slice(
    startIndex,
    stopAfterRain ? hourlyList.indexOf(stopAfterRain) : undefined,
  );

  const maxChance = rainWindow.length
    ? Math.max(...rainWindow.map(item => Number(item.rainChance ?? 0)))
    : Number(firstRainSlot.rainChance ?? 0);

  const startTime = new Date(firstRainSlot.time).getTime();
  const stopTime = stopAfterRain
    ? new Date(stopAfterRain.time).getTime()
    : null;

  return {
    state: 'rain_coming',
    startTime,
    startTimeLabel: toClockTime(startTime),
    stopTime,
    stopTimeLabel: buildRainStopLabel(stopTime),
    chance: Math.round(maxChance),
  };
};

const syncRainNotification = async weatherPayload => {
  try {
    if (!weatherPayload?.hourlyList?.length || !weatherPayload?.current) return;

    const rainPrediction = predictRain(
      weatherPayload.hourlyList,
      weatherPayload.current.weather_code,
      weatherPayload.currentRain,
    );

    const previousStateRaw = await AsyncStorage.getItem(
      RAIN_NOTIFICATION_STATE_KEY,
    );

    const previousState = previousStateRaw ? JSON.parse(previousStateRaw) : {};

    if (rainPrediction.state === 'no_rain') {
      await AsyncStorage.removeItem(RAIN_START_TIME_KEY);
      await AsyncStorage.removeItem(RAIN_NOTIFICATION_STATE_KEY);
      await cancelRainNotification();
      return;
    }

    if (rainPrediction.state === 'raining_now') {
      let storedStartTime = await AsyncStorage.getItem(RAIN_START_TIME_KEY);

      if (!storedStartTime) {
        storedStartTime = String(Date.now());
        await AsyncStorage.setItem(RAIN_START_TIME_KEY, storedStartTime);
      }

      const currentBody =
        buildRainStopNotificationLabel(rainPrediction.stopTime) ||
        'Rain is active now';

      const alreadyShown =
        previousState.type === 'raining_now' &&
        previousState.body === currentBody;

      if (alreadyShown) {
        return;
      }

      if (typeof notifee.cancelTriggerNotification === 'function') {
        await notifee.cancelTriggerNotification(RAIN_ALERT_NOTIFICATION_ID);
      }

      const channelId = await createWeatherNotificationChannel();

      await notifee.displayNotification({
        id: RAIN_ALERT_NOTIFICATION_ID,
        title: '🌧️ Barsa Barondu Undu',
        body: currentBody,
        android: {
          channelId,
          color: '#6CD9FF',
          pressAction: {
            id: 'default',
          },
        },
      });

      await AsyncStorage.setItem(
        RAIN_NOTIFICATION_STATE_KEY,
        JSON.stringify({
          type: 'raining_now',
          body: currentBody,
          shownAt: Date.now(),
        }),
      );

      return;
    }

    if (rainPrediction.state === 'rain_coming' && rainPrediction.startTime) {
      await AsyncStorage.removeItem(RAIN_START_TIME_KEY);

      const notifyAt = rainPrediction.startTime - 30 * 60 * 1000;

      const notificationBody = `Barsa ola shuru  avu  ${rainPrediction.startTimeLabel} Ganteg.RainCoat ejanda kodde pathonle.`;

      const alreadyScheduled =
        previousState.type === 'rain_coming' &&
        previousState.notifyAt === notifyAt &&
        previousState.body === notificationBody;

      if (alreadyScheduled) {
        return;
      }

      if (typeof notifee.cancelTriggerNotification === 'function') {
        await notifee.cancelTriggerNotification(RAIN_ALERT_NOTIFICATION_ID);
      }

      const channelId = await createWeatherNotificationChannel();

      if (notifyAt <= Date.now() + 60 * 1000) {
        await notifee.displayNotification({
          id: RAIN_ALERT_NOTIFICATION_ID,
          title: 'Barsa Jagrathe 🌧️',
          body: notificationBody,
          android: {
            channelId,
            color: '#6CD9FF',
            pressAction: {
              id: 'default',
            },
          },
        });

        await AsyncStorage.setItem(
          RAIN_NOTIFICATION_STATE_KEY,
          JSON.stringify({
            type: 'rain_coming',
            notifyAt,
            body: notificationBody,
            shownAt: Date.now(),
          }),
        );

        return;
      }

      await notifee.createTriggerNotification(
        {
          id: RAIN_ALERT_NOTIFICATION_ID,
          title: 'Barsa Jagrathe 🌧️',
          body: notificationBody,
          android: {
            channelId,
            color: '#6CD9FF',
            pressAction: {
              id: 'default',
            },
          },
        },
        {
          type: TriggerType.TIMESTAMP,
          timestamp: notifyAt,
        },
      );

      await AsyncStorage.setItem(
        RAIN_NOTIFICATION_STATE_KEY,
        JSON.stringify({
          type: 'rain_coming',
          notifyAt,
          body: notificationBody,
          scheduledAt: Date.now(),
        }),
      );
    }
  } catch {
    // Notification failure should not break weather loading.
  }
};

const getTheme = (code, isDay) => {
  if (!isDay) return { bg: '#080D1A', accent: '#8EA7FF' };
  if (isRainCode(code)) return { bg: '#071927', accent: '#6CD9FF' };

  if ([0, 1].includes(Number(code))) {
    return { bg: '#0A1728', accent: '#FFD166' };
  }

  return { bg: '#0A0F1E', accent: '#4DFFB4' };
};

const WeatherArt = ({ artType, accent }) => {
  const bounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, {
          toValue: -10,
          duration: 2400,
          useNativeDriver: true,
        }),
        Animated.timing(bounce, {
          toValue: 0,
          duration: 2400,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => animation.stop();
  }, [bounce]);

  return (
    <Animated.View
      style={{ alignItems: 'center', transform: [{ translateY: bounce }] }}
    >
      <View
        style={{
          position: 'absolute',
          width: 150,
          height: 150,
          borderRadius: 75,
          backgroundColor: accent + '16',
          top: 15,
          alignSelf: 'center',
        }}
      />

      <Text style={{ fontSize: 108, lineHeight: 124 }}>
        {ART_EMOJI[artType] || '☁️'}
      </Text>
    </Animated.View>
  );
};

const PulseDot = ({ accent }) => {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.9,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => animation.stop();
  }, [scale]);

  return (
    <View
      style={{
        width: 14,
        height: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 7,
      }}
    >
      <Animated.View
        style={{
          width: 7,
          height: 7,
          borderRadius: 4,
          backgroundColor: accent,
          transform: [{ scale }],
          opacity: 0.9,
        }}
      />
    </View>
  );
};

const RainTimerCard = ({ prediction, accent }) => {
  if (prediction.state === 'no_rain') return null;

  const isNow = prediction.state === 'raining_now';
  const bg = accent + '14';
  const border = accent + '38';

  if (isNow) {
    return (
      <View style={[st.rainCard, { borderColor: border, backgroundColor: bg }]}>
        <View style={st.rainCardRow}>
          <View style={st.rainTimerBlock}>
            <Text style={st.rainTimerIcon}>🌧️</Text>
            <Text style={[st.rainTimerLabel, { color: accent }]}>
              Rain is active
            </Text>
            <Text style={st.rainTimerClock}>{toClockTime(Date.now())}</Text>
          </View>

          <View style={st.rainTimerDivider} />

          <View style={st.rainTimerBlock}>
            <Text style={st.rainTimerIcon}>🌤️</Text>
            <Text style={st.rainTimerLabel}>Clears up</Text>
            <Text
              style={[st.rainTimerClock, st.rainTimerClockSmall]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
            >
              {prediction.stopTimeLabel || 'All day'}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[st.rainCard, { borderColor: border, backgroundColor: bg }]}>
      <View style={st.rainCardRow}>
        <View style={st.rainTimerBlock}>
          <Text style={st.rainTimerIcon}>🕐</Text>
          <Text style={st.rainTimerLabel}>Rain starts</Text>
          <Text style={[st.rainTimerClock, { color: accent }]}>
            {prediction.startTimeLabel}
          </Text>
        </View>

        <View style={st.rainTimerDivider} />

        <View style={st.rainTimerBlock}>
          <Text style={st.rainTimerIcon}>☀️</Text>
          <Text style={st.rainTimerLabel}>Clears up</Text>
          <Text
            style={[st.rainTimerClock, st.rainTimerClockSmall]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.78}
          >
            {prediction.stopTimeLabel || '–'}
          </Text>
        </View>
      </View>

      {prediction.chance > 0 && (
        <Text style={st.rainChanceLabel}>
          {prediction.chance}% chance of rain
        </Text>
      )}
    </View>
  );
};

const requestLocationPermission = async () => {
  if (Platform.OS === 'ios') {
    const auth = await Geolocation.requestAuthorization('whenInUse');
    return auth === 'granted';
  }

  try {
    const fineGranted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );

    const coarseGranted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    );

    if (fineGranted || coarseGranted) {
      return true;
    }

    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    ]);

    return (
      result[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] ===
        PermissionsAndroid.RESULTS.GRANTED ||
      result[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] ===
        PermissionsAndroid.RESULTS.GRANTED
    );
  } catch {
    return false;
  }
};

const getCurrentLocation = () =>
  new Promise((resolve, reject) => {
    let finished = false;

    const finishSuccess = position => {
      if (finished) return;
      finished = true;
      resolve(position);
    };

    const finishError = error => {
      if (finished) return;
      finished = true;
      reject(error);
    };

    const hardTimeout = setTimeout(() => {
      finishError({
        code: 3,
        message: 'Location request timed out',
      });
    }, 15000);

    Geolocation.getCurrentPosition(
      position => {
        clearTimeout(hardTimeout);
        finishSuccess(position);
      },
      firstError => {
        Geolocation.getCurrentPosition(
          position => {
            clearTimeout(hardTimeout);
            finishSuccess(position);
          },
          secondError => {
            clearTimeout(hardTimeout);
            finishError(secondError || firstError);
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
            forceRequestLocation: true,
            showLocationDialog: true,
          },
        );
      },
      {
        enableHighAccuracy: false,
        timeout: 7000,
        maximumAge: 5 * 60 * 1000,
        forceRequestLocation: true,
        showLocationDialog: true,
      },
    );
  });

const getOpenStreetMapLocationName = async (lat, lon) => {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
    {
      headers: {
        'User-Agent': 'NammaWeather/1.0',
      },
    },
  );

  if (!response.ok) throw new Error(`OSM ${response.status}`);

  const data = await response.json();
  const address = data.address || {};

  return pickFirstLocationName(
    address.village,
    address.hamlet,
    address.neighbourhood,
    address.neighborhood,
    address.suburb,
    address.quarter,
    address.residential,
    address.locality,
    address.road,
    address.town,
    address.city,
    address.county,
    data.name,
    data.display_name?.split(',')?.[0],
  );
};

const getBigDataLocationName = async (lat, lon) => {
  const response = await fetch(
    `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
  );

  if (!response.ok) throw new Error(`BigData ${response.status}`);

  const data = await response.json();

  const informative = Array.isArray(data.localityInfo?.informative)
    ? data.localityInfo.informative
    : [];

  const administrative = Array.isArray(data.localityInfo?.administrative)
    ? data.localityInfo.administrative
    : [];

  const allLocationInfo = [...informative, ...administrative];

  const smallPlace = allLocationInfo.find(item => {
    const text = `${item?.description || ''} ${item?.name || ''}`.toLowerCase();

    return (
      item?.name &&
      (text.includes('village') ||
        text.includes('hamlet') ||
        text.includes('neighbourhood') ||
        text.includes('neighborhood') ||
        text.includes('suburb') ||
        text.includes('locality') ||
        text.includes('residential') ||
        text.includes('quarter'))
    );
  });

  return pickFirstLocationName(
    smallPlace?.name,
    data.locality,
    data.city,
    data.principalSubdivision,
    data.countryName,
  );
};

const getCityName = async (lat, lon) => {
  try {
    const osmName = await getOpenStreetMapLocationName(lat, lon);
    if (osmName) return osmName;
  } catch {}

  try {
    const bigDataName = await getBigDataLocationName(lat, lon);
    if (bigDataName) return bigDataName;
  } catch {}

  return 'Your Location';
};

const getWeatherData = async (lat, lon) => {
  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation,rain,is_day` +
      `&hourly=temperature_2m,weather_code,precipitation_probability,precipitation` +
      `&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,precipitation_sum,uv_index_max` +
      `&forecast_days=2&timezone=auto`,
  );

  if (!response.ok) throw new Error(`API ${response.status}`);

  const data = await response.json();

  if (data.error) throw new Error(data.reason || 'API error');
  if (!data.current || !data.hourly) throw new Error('Weather data missing');

  return data;
};

const getAirQualityData = async (lat, lon) => {
  const response = await fetch(
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
      `&hourly=us_aqi,pm2_5,pm10,uv_index` +
      `&forecast_days=1&timezone=auto`,
  );

  if (!response.ok) throw new Error(`AQI API ${response.status}`);

  const data = await response.json();

  if (data.error) throw new Error(data.reason || 'AQI API error');

  const hourly = data.hourly || {};
  const index = getNearestHourlyIndex(hourly.time);

  return {
    aqi: toNumberOrNull(hourly.us_aqi?.[index]),
    pm25: toNumberOrNull(hourly.pm2_5?.[index]),
    pm10: toNumberOrNull(hourly.pm10?.[index]),
    uvIndex: toNumberOrNull(hourly.uv_index?.[index]),
  };
};

const buildHourlyList = hourly => {
  const now = Date.now();

  const all = hourly.time.map((time, index) => ({
    time,
    timestamp: new Date(time).getTime(),
    label: formatHour(time),
    temp: Math.round(hourly.temperature_2m[index]),
    code: hourly.weather_code[index],
    rainChance: hourly.precipitation_probability?.[index] ?? 0,
    precipMm: hourly.precipitation?.[index] ?? 0,
  }));

  const upcoming = all.filter(item => item.timestamp >= now - 30 * 60 * 1000);

  return (upcoming.length ? upcoming : all).slice(0, 12);
};

const buildPayload = ({
  cityName,
  weatherData,
  airQualityData,
  latitude,
  longitude,
}) => {
  const hourlyList = buildHourlyList(weatherData.hourly);

  const currentRain = Math.max(
    Number(weatherData.current?.rain ?? 0),
    Number(weatherData.current?.precipitation ?? 0),
  );

  return {
    cityName,
    current: weatherData.current,
    hourlyList,
    daily: {
      maxTemp: weatherData.daily?.temperature_2m_max?.[0],
      minTemp: weatherData.daily?.temperature_2m_min?.[0],
      sunrise: weatherData.daily?.sunrise?.[0],
      sunset: weatherData.daily?.sunset?.[0],
      rainChanceMax: weatherData.daily?.precipitation_probability_max?.[0] ?? 0,
      precipSum: weatherData.daily?.precipitation_sum?.[0] ?? 0,
      uvIndexMax: weatherData.daily?.uv_index_max?.[0] ?? null,
    },
    airQuality: airQualityData || null,
    currentRain,
    latitude,
    longitude,
    lastUpdated: new Date().toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }),
    cachedAt: Date.now(),
  };
};

const saveCache = async payload => {
  try {
    await AsyncStorage.multiSet([
      [WEATHER_CACHE_KEY, JSON.stringify(payload)],
      [
        COORDS_CACHE_KEY,
        JSON.stringify({
          latitude: payload.latitude,
          longitude: payload.longitude,
          cityName: payload.cityName,
        }),
      ],
    ]);
  } catch {}
};

const readCache = async () => {
  try {
    const value = await AsyncStorage.getItem(WEATHER_CACHE_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

const readCoords = async () => {
  try {
    const value = await AsyncStorage.getItem(COORDS_CACHE_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

export default function Weather() {
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [weather, setWeather] = useState(null);
  const [error, setError] = useState('');
  const [permissionError, setPermissionError] = useState(false);
  const [usingCached, setUsingCached] = useState(false);
  const [notice, setNotice] = useState('');

  const weatherRef = useRef(null);
  const intervalRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);
  const isLoadingWeatherRef = useRef(false);
  const hasAnimatedOnceRef = useRef(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    weatherRef.current = weather;
  }, [weather]);

  const currentCode = weather?.current?.weather_code ?? 3;
  const isDay = weather?.current?.is_day !== 0;

  const safeThemeCode =
    weather && isActualRainNow(currentCode, weather?.currentRain)
      ? currentCode
      : isRainCode(currentCode)
      ? 3
      : currentCode;

  const theme = useMemo(
    () => getTheme(safeThemeCode, isDay),
    [safeThemeCode, isDay],
  );

  const prediction = useMemo(() => {
    if (!weather?.hourlyList?.length || !weather?.current) {
      return { state: 'no_rain' };
    }

    return predictRain(
      weather.hourlyList,
      weather.current.weather_code,
      weather.currentRain,
    );
  }, [weather]);

  const animateIn = () => {
    if (hasAnimatedOnceRef.current) return;

    hasAnimatedOnceRef.current = true;

    fadeAnim.setValue(0);
    slideAnim.setValue(20);

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 480,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const loadWeather = async ({ silent = false, isRefresh = false } = {}) => {
    if (isLoadingWeatherRef.current) return;

    isLoadingWeatherRef.current = true;

    try {
      setError('');
      setPermissionError(false);

      if (isRefresh) setRefreshing(true);
      else if (!silent && !weatherRef.current) setLoading(true);

      const hasPermission = await requestLocationPermission();

      if (!hasPermission) {
        setPermissionError(true);

        if (weatherRef.current) {
          setUsingCached(true);
          setNotice('Allow location to refresh live.');
          return;
        }

        setError('Location permission denied.\nPlease allow location access.');
        return;
      }

      let position = null;
      let cachedCoords = null;

      try {
        position = await getCurrentLocation();
      } catch {
        cachedCoords = await readCoords();
      }

      const lat = position?.coords?.latitude ?? cachedCoords?.latitude;
      const lon = position?.coords?.longitude ?? cachedCoords?.longitude;

      if (!lat || !lon) {
        if (weatherRef.current) {
          setUsingCached(true);
          setNotice('GPS failed. Showing last weather.');
          return;
        }

        throw new Error('Location unavailable. Check GPS & internet.');
      }

      const [cityName, weatherData, airQualityData] = await Promise.all([
        getCityName(lat, lon).catch(
          () => cachedCoords?.cityName || 'Your Location',
        ),
        getWeatherData(lat, lon),
        getAirQualityData(lat, lon).catch(() => null),
      ]);

      const payload = buildPayload({
        cityName,
        weatherData,
        airQualityData,
        latitude: lat,
        longitude: lon,
      });

      setWeather(payload);
      setUsingCached(false);
      setNotice('');

      await saveCache(payload);
      await syncRainNotification(payload);

      animateIn();
    } catch (err) {
      if (weatherRef.current) {
        setUsingCached(true);
        setNotice(
          err?.code === 3
            ? 'GPS timed out. Showing last weather.'
            : 'Refresh failed. Showing last weather.',
        );
        return;
      }

      if (err?.code === 3) {
        setError('GPS timed out.\nTurn on GPS & internet, then retry.');
      } else if (err?.code === 2) {
        setError('Location unavailable.\nCheck GPS & network.');
      } else if (err?.code === 1) {
        setPermissionError(true);
        setError('Location denied.\nPlease allow location access.');
      } else {
        setError(
          err?.message
            ? `Couldn't load weather.\n${err.message}`
            : "Couldn't load.\nTap to retry.",
        );
      }
    } finally {
      isLoadingWeatherRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const setupNotifications = async () => {
      try {
        await notifee.requestPermission();
        await createWeatherNotificationChannel();
      } catch {}
    };

    setupNotifications();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      const wasAway = appStateRef.current.match(/inactive|background/);
      appStateRef.current = nextAppState;

      if (wasAway && nextAppState === 'active') {
        requestLocationPermission().then(granted => {
          if (granted) {
            setPermissionError(false);
            setError('');
            loadWeather({ isRefresh: true });
          }
        });
      }
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const boot = async () => {
      const cached = await readCache();

      if (
        cached &&
        cached.current &&
        cached.daily &&
        Array.isArray(cached.hourlyList)
      ) {
        setWeather(cached);
        setUsingCached(true);
        setNotice(`Last saved at ${cached.lastUpdated}`);
        setLoading(false);
        animateIn();
      }

      await loadWeather({ silent: !!cached });
    };

    boot();

    intervalRef.current = setInterval(() => {
      loadWeather({ silent: true });
    }, WEATHER_REFRESH_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  if (loading && !weather) {
    return (
      <View
        style={[
          st.root,
          { backgroundColor: theme.bg, paddingTop: Math.max(insets.top, 18) },
        ]}
      >
        <StatusBar barStyle="light-content" backgroundColor={theme.bg} />

        <View style={st.center}>
          <View
            style={[
              st.loadingOrb,
              {
                borderColor: theme.accent + '55',
                backgroundColor: theme.accent + '15',
              },
            ]}
          >
            <ActivityIndicator size="large" color={theme.accent} />
          </View>

          <Text style={st.loadingTitle}>Finding your location…</Text>
          <Text style={st.loadingSubtitle}>Getting live weather</Text>
        </View>
      </View>
    );
  }

  if (error && !weather) {
    return (
      <View
        style={[
          st.root,
          { backgroundColor: theme.bg, paddingTop: Math.max(insets.top, 18) },
        ]}
      >
        <StatusBar barStyle="light-content" backgroundColor={theme.bg} />

        <View style={st.center}>
          <Text style={{ fontSize: 52, marginBottom: 16 }}>⚠️</Text>

          <Text style={st.errorText}>{error}</Text>

          <TouchableOpacity
            style={[st.retryBtn, { backgroundColor: theme.accent }]}
            onPress={() =>
              permissionError ? Linking.openSettings() : loadWeather()
            }
          >
            <Text style={[st.retryBtnText, { color: theme.bg }]}>
              {permissionError ? 'Open Settings' : 'Try Again'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!weather) {
    return (
      <View
        style={[
          st.root,
          { backgroundColor: theme.bg, paddingTop: Math.max(insets.top, 18) },
        ]}
      >
        <StatusBar barStyle="light-content" backgroundColor={theme.bg} />

        <View style={st.center}>
          <Text style={{ fontSize: 52, marginBottom: 16 }}>🌦️</Text>

          <Text style={st.errorText}>Weather data unavailable.</Text>

          <TouchableOpacity
            style={[st.retryBtn, { backgroundColor: theme.accent }]}
            onPress={() => loadWeather()}
          >
            <Text style={[st.retryBtnText, { color: theme.bg }]}>
              Try Again
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const info = getSafeWeatherInfo(currentCode, weather.currentRain);

  const rainAmountText = isActualRainNow(currentCode, weather.currentRain)
    ? `${Number(weather.currentRain).toFixed(1)}mm · ${info.label}`
    : info.label;

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const aqiInfo = getAQIInfo(weather.airQuality?.aqi);

  const uvInfo = getUVInfo(
    weather.airQuality?.uvIndex ?? weather.daily?.uvIndexMax,
  );

  return (
    <View
      style={[
        st.root,
        {
          backgroundColor: theme.bg,
          paddingTop: Math.max(insets.top, 12),
          paddingBottom: Math.max(insets.bottom, 12),
        },
      ]}
    >
      <StatusBar barStyle="light-content" backgroundColor={theme.bg} />

      <Animated.ScrollView
        style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
        contentContainerStyle={st.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadWeather({ isRefresh: true })}
            tintColor={theme.accent}
            colors={[theme.accent]}
          />
        }
      >
        <View style={st.header}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <PulseDot accent={theme.accent} />

              <Text style={st.cityName} numberOfLines={1}>
                {weather.cityName || 'Your Location'}
              </Text>
            </View>

            <Text style={st.dateText}>{today}</Text>
            <Text style={st.updatedText}>Updated {weather.lastUpdated}</Text>
          </View>

          <TouchableOpacity
            style={[
              st.refreshBtn,
              {
                borderColor: theme.accent + '45',
                backgroundColor: theme.accent + '12',
              },
            ]}
            onPress={() => loadWeather({ isRefresh: true })}
          >
            <Text style={[st.refreshIcon, { color: theme.accent }]}>↻</Text>
          </TouchableOpacity>
        </View>

        {usingCached && notice && (
          <View style={st.noticeBanner}>
            <Text style={st.noticeText}>{notice}</Text>
          </View>
        )}

        <View style={st.heroSection}>
          <WeatherArt artType={info.art} accent={theme.accent} />

          <Text style={st.heroTemp}>
            {Math.round(weather.current?.temperature_2m ?? 0)}°C
          </Text>

          <Text style={st.heroCondition}>{rainAmountText}</Text>

          <View style={st.metaRow}>
            <Text style={st.metaText}>
              Feels {Math.round(weather.current?.apparent_temperature ?? 0)}°
            </Text>

            <View style={st.metaDot} />

            <Text style={st.metaText}>
              High {Math.round(weather.daily?.maxTemp ?? 0)}°
            </Text>

            <View style={st.metaDot} />

            <Text style={st.metaText}>
              Low {Math.round(weather.daily?.minTemp ?? 0)}°
            </Text>
          </View>
        </View>

        <RainTimerCard prediction={prediction} accent={theme.accent} />

        <View style={st.infoRow}>
          {[
            {
              emoji: '💧',
              value: `${Math.round(
                weather.current?.relative_humidity_2m ?? 0,
              )}%`,
              label: 'Humidity',
              isAccent: false,
            },
            {
              emoji: '💨',
              value: `${Math.round(weather.current?.wind_speed_10m ?? 0)} km/h`,
              label: 'Wind',
              isAccent: true,
            },
            {
              emoji: '☔',
              value: `${Math.round(weather.daily?.rainChanceMax ?? 0)}%`,
              label: 'Rain Today',
              isAccent: false,
            },
          ].map((item, index) => (
            <View
              key={index}
              style={[
                st.infoCard,
                item.isAccent
                  ? {
                      borderColor: theme.accent + '45',
                      backgroundColor: theme.accent + '12',
                    }
                  : { borderColor: '#ffffff10', backgroundColor: '#ffffff07' },
              ]}
            >
              <Text style={st.infoEmoji}>{item.emoji}</Text>
              <Text style={st.infoValue}>{item.value}</Text>
              <Text style={st.infoLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        <View style={st.sunRow}>
          {[
            {
              emoji: '🌅',
              label: 'Sunrise',
              time: weather.daily?.sunrise,
            },
            {
              emoji: '🌇',
              label: 'Sunset',
              time: weather.daily?.sunset,
            },
          ].map((item, index) => (
            <View
              key={index}
              style={[
                st.sunCard,
                { borderColor: '#ffffff10', backgroundColor: '#ffffff07' },
              ]}
            >
              <Text style={{ fontSize: 26, marginRight: 12 }}>
                {item.emoji}
              </Text>

              <View>
                <Text style={st.sunLabel}>{item.label}</Text>
                <Text style={st.sunTime}>{formatTime(item.time)}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={st.healthRow}>
          <View
            style={[
              st.healthCard,
              {
                borderColor: aqiInfo.color + '45',
                backgroundColor: aqiInfo.color + '10',
              },
            ]}
          >
            <View style={st.healthTopRow}>
              <Text style={st.healthEmoji}>🌫️</Text>

              <View style={st.healthTextBlock}>
                <Text style={st.healthLabel}>AIR QUALITY</Text>
                <Text
                  style={[st.healthStatus, { color: aqiInfo.color }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {aqiInfo.label}
                </Text>
              </View>

              <Text style={st.healthValue}>{aqiInfo.value}</Text>
            </View>

            <Text style={st.healthMessage}>{aqiInfo.message}</Text>

            <Text style={st.healthSmallText}>
              PM2.5 {formatOptional(weather.airQuality?.pm25, 1)} µg/m³ · PM10{' '}
              {formatOptional(weather.airQuality?.pm10, 1)} µg/m³
            </Text>
          </View>

          <View
            style={[
              st.healthCard,
              {
                borderColor: uvInfo.color + '45',
                backgroundColor: uvInfo.color + '10',
              },
            ]}
          >
            <View style={st.healthTopRow}>
              <Text style={st.healthEmoji}>🔆</Text>

              <View style={st.healthTextBlock}>
                <Text style={st.healthLabel}>UV INDEX</Text>
                <Text
                  style={[st.healthStatus, { color: uvInfo.color }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {uvInfo.label}
                </Text>
              </View>

              <Text style={st.healthValue}>{uvInfo.value}</Text>
            </View>

            <Text style={st.healthMessage}>{uvInfo.message}</Text>

            <Text style={st.healthSmallText}>
              Today's UV risk based on latest forecast
            </Text>
          </View>
        </View>

        <View
          style={[
            st.forecastCard,
            { borderColor: '#ffffff10', backgroundColor: '#ffffff07' },
          ]}
        >
          <View style={st.forecastHeader}>
            <Text style={st.forecastTitle}>NEXT 12 HOURS</Text>
            <Text style={st.forecastSub}>Rain % per hour</Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingRight: 18 }}
          >
            {(weather.hourlyList || []).map((item, index) => {
              const isNow = index === 0;
              const hourInfo = isNow
                ? getSafeWeatherInfo(item.code, item.precipMm)
                : getHourlyWeatherInfo(item);

              const isHighRain = Number(item.rainChance ?? 0) >= 70;
              const showMm = Number(item.precipMm ?? 0) > 0;

              return (
                <View
                  key={`${item.time}-${index}`}
                  style={[
                    st.hourCard,
                    isNow
                      ? {
                          borderColor: theme.accent + '55',
                          backgroundColor: theme.accent + '14',
                        }
                      : isHighRain
                      ? {
                          borderColor: '#6CD9FF28',
                          backgroundColor: '#6CD9FF08',
                        }
                      : {
                          borderColor: '#ffffff0D',
                          backgroundColor: '#ffffff05',
                        },
                  ]}
                >
                  <Text
                    style={[st.hourLabel, isNow && { color: theme.accent }]}
                  >
                    {isNow ? 'Now' : item.label}
                  </Text>

                  <Text style={{ fontSize: 24, marginVertical: 6 }}>
                    {hourInfo.emoji}
                  </Text>

                  <Text style={[st.hourTemp, isNow && { color: theme.accent }]}>
                    {item.temp}°
                  </Text>

                  {Number(item.rainChance ?? 0) > 0 ? (
                    <Text
                      style={[
                        st.hourRain,
                        isHighRain && { color: '#6CD9FF', fontWeight: '800' },
                      ]}
                    >
                      {Math.round(item.rainChance)}%
                    </Text>
                  ) : (
                    <Text style={[st.hourRain, { opacity: 0.3 }]}>–</Text>
                  )}

                  {showMm && (
                    <Text style={st.hourMm}>
                      {Number(item.precipMm).toFixed(1)}mm
                    </Text>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </View>

        <Text style={st.footer}>Live Weather · Open-Meteo</Text>
      </Animated.ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: {
    flex: 1,
  },

  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 32,
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },

  loadingOrb: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },

  loadingTitle: {
    color: '#E8EDF5',
    fontSize: 18,
    fontWeight: '800',
  },

  loadingSubtitle: {
    color: '#5A6A82',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
  },

  errorText: {
    color: '#FF6B6B',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 22,
  },

  retryBtn: {
    marginTop: 22,
    borderRadius: 16,
    paddingHorizontal: 28,
    paddingVertical: 13,
  },

  retryBtnText: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.4,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },

  cityName: {
    color: '#E8EDF5',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.2,
    flex: 1,
  },

  dateText: {
    color: '#5A6A82',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },

  updatedText: {
    color: '#3A4A5A',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },

  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  refreshIcon: {
    fontSize: 20,
    fontWeight: '800',
  },

  noticeBanner: {
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FFD16628',
    backgroundColor: '#FFD16610',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },

  noticeText: {
    color: '#FFD166',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },

  heroSection: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 24,
  },

  heroTemp: {
    color: '#E8EDF5',
    fontSize: 72,
    fontWeight: '900',
    letterSpacing: -3,
    marginTop: 14,
    lineHeight: 80,
  },

  heroCondition: {
    color: '#8A9BB0',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: 0.3,
  },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },

  metaText: {
    color: '#5A6A82',
    fontSize: 13,
    fontWeight: '600',
  },

  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#2E3E52',
  },

  rainCard: {
    marginBottom: 14,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },

  rainCardRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },

  rainTimerBlock: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
  },

  rainTimerDivider: {
    width: 1,
    backgroundColor: '#ffffff14',
    marginVertical: 12,
  },

  rainTimerIcon: {
    fontSize: 22,
    marginBottom: 6,
  },

  rainTimerLabel: {
    color: '#8A9BB0',
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
    textAlign: 'center',
  },

  rainTimerClock: {
    color: '#E8EDF5',
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '900',
    textAlign: 'center',
  },

  rainTimerClockSmall: {
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 2,
  },

  rainChanceLabel: {
    textAlign: 'center',
    color: '#5A6A82',
    fontSize: 12,
    fontWeight: '700',
    paddingBottom: 12,
  },

  infoRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },

  infoCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 22,
    paddingVertical: 16,
    alignItems: 'center',
  },

  infoEmoji: {
    fontSize: 22,
    marginBottom: 7,
  },

  infoValue: {
    color: '#E8EDF5',
    fontSize: 16,
    fontWeight: '900',
  },

  infoLabel: {
    color: '#5A6A82',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  sunRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },

  sunCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },

  sunLabel: {
    color: '#5A6A82',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 3,
  },

  sunTime: {
    color: '#E8EDF5',
    fontSize: 15,
    fontWeight: '900',
  },

  healthRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },

  healthCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 22,
    padding: 12,
    minHeight: 138,
  },

  healthTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },

  healthEmoji: {
    fontSize: 22,
    marginRight: 8,
  },

  healthTextBlock: {
    flex: 1,
    minWidth: 0,
  },

  healthLabel: {
    color: '#5A6A82',
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 3,
  },

  healthStatus: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '900',
    flexShrink: 1,
  },

  healthValue: {
    color: '#E8EDF5',
    fontSize: 22,
    fontWeight: '900',
    marginLeft: 6,
    minWidth: 34,
    textAlign: 'right',
  },

  healthMessage: {
    color: '#E8EDF5',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginBottom: 8,
  },

  healthSmallText: {
    color: '#5A6A82',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 15,
  },

  forecastCard: {
    borderWidth: 1,
    borderRadius: 26,
    paddingTop: 18,
    paddingBottom: 18,
    paddingLeft: 18,
    marginBottom: 20,
  },

  forecastHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 14,
    paddingRight: 18,
  },

  forecastTitle: {
    color: '#E8EDF5',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
  },

  forecastSub: {
    color: '#5A6A82',
    fontSize: 11,
    fontWeight: '700',
  },

  hourCard: {
    width: 74,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
  },

  hourLabel: {
    color: '#5A6A82',
    fontSize: 11,
    fontWeight: '800',
  },

  hourTemp: {
    color: '#E8EDF5',
    fontSize: 16,
    fontWeight: '900',
  },

  hourRain: {
    color: '#5A6A82',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
  },

  hourMm: {
    color: '#6CD9FF',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },

  footer: {
    textAlign: 'center',
    color: '#5A6A82',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    opacity: 0.55,
  },
});
