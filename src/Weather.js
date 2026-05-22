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
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Geolocation from 'react-native-geolocation-service';
import notifee, { AndroidImportance, TriggerType } from '@notifee/react-native';

import { st } from './WeatherStyle';
import { SkyBackground, RainSystem, WeatherArt } from './WeatherAnimations';

const WEATHER_CACHE_KEY = 'wx:weather';
const COORDS_CACHE_KEY = 'wx:coords';
const RAIN_START_TIME_KEY = 'wx:rain_start_time';

const RAIN_ALERT_NOTIFICATION_ID = 'namma-weather-rain-alert';
const RAIN_ALERT_CHANNEL_ID = 'weather-alerts';

const MIN_REFRESH_GAP_MS = 10 * 60 * 1000;
const RAIN_STOP_THRESHOLD = 20;

const MIN_REAL_RAIN_MM = 3.5;
const MIN_FORECAST_RAIN_MM = 0.5;

const FUTURE_RAIN_MIN_CHANCE = 70;
const FUTURE_RAIN_MIN_MM = 0.6;

const THUNDER_MIN_RAIN_MM = 2.0;

const WMO_MAP = {
  0: { label: 'DOMBU', emoji: '☀️', art: 'sunny' },
  1: { label: 'ONTHE DOMBU', emoji: '🌤️', art: 'partlyCloudy' },
  2: { label: 'ONTHE MUGAL', emoji: '🌤️', art: 'partlyCloudy' },
  3: { label: 'MUGAL', emoji: '☁️', art: 'cloudy' },
  45: { label: 'MAINDU', emoji: '🌫️', art: 'fog' },
  48: { label: 'MAINDU', emoji: '🌫️', art: 'fog' },

  51: { label: 'PANI DOMBU BARSA', emoji: '🌦️', art: 'rain' },
  53: { label: 'DOMBU BARSA', emoji: '🌦️', art: 'rain' },
  55: { label: 'PANI BARSA', emoji: '🌧️', art: 'rain' },
  56: { label: 'CHIMMA BARSA', emoji: '🌧️', art: 'rain' },
  57: { label: 'CHIMMA PANI BARSA', emoji: '🌧️', art: 'rain' },

  61: { label: 'ONTHE BARSA', emoji: '🌧️', art: 'rain' },
  63: { label: 'BARSA', emoji: '🌧️', art: 'rain' },
  65: { label: 'BOLLA BARSA', emoji: '🌧️', art: 'rain' },
  66: { label: 'CHALI BARSA', emoji: '🌧️', art: 'rain' },
  67: { label: 'CHALI BARSA MASTH', emoji: '🌧️', art: 'rain' },

  71: { label: 'PANIT ICE', emoji: '🌨️', art: 'snow' },
  73: { label: 'HIMA', emoji: '🌨️', art: 'snow' },
  75: { label: 'JORU HIMA', emoji: '❄️', art: 'snow' },
  77: { label: 'CHIMMA HIMA', emoji: '❄️', art: 'snow' },

  80: { label: 'BARSA BARPUNDU', emoji: '🌦️', art: 'rain' },
  81: { label: 'BARSA BARPUNDU', emoji: '🌦️', art: 'rain' },
  82: { label: 'JORU BARSA BARPUNDU', emoji: '⛈️', art: 'storm' },

  85: { label: 'CHIMMA BARSA', emoji: '🌨️', art: 'snow' },
  86: { label: 'MASTH CHIMMA BARSA', emoji: '🌨️', art: 'snow' },

  95: { label: 'TEDIL BOKA BARSA', emoji: '⛈️', art: 'storm' },
  96: { label: 'TEDIL BOKA ONTHE BARSA', emoji: '⛈️', art: 'storm' },
  99: { label: 'TEDIL BOKA JORU BARSA', emoji: '⛈️', art: 'storm' },
};

const RAIN_CODES = [
  51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 85, 86, 95, 96, 99,
];

const THUNDER_CODES = [82, 95, 96, 99];

const isRainCode = code => RAIN_CODES.includes(Number(code));
const isThunderCode = code => THUNDER_CODES.includes(Number(code));

const isActualRainNow = (code, rainAmount) =>
  isRainCode(Number(code)) && Number(rainAmount || 0) >= MIN_REAL_RAIN_MM;

const isFutureRainStrong = item => {
  const chance = Number(item?.rainChance ?? 0);
  const precipMm = Number(item?.precipMm ?? 0);
  const humidity = Number(item?.humidity ?? 0);

  return (
    chance >= FUTURE_RAIN_MIN_CHANCE &&
    precipMm >= FUTURE_RAIN_MIN_MM &&
    humidity >= 75
  );
};

const getWeatherInfo = code =>
  WMO_MAP[Number(code)] || { label: 'MUGAL', emoji: '☁️', art: 'cloudy' };

const getSmartWeatherInfo = ({
  code,
  rainAmount = 0,
  cloudCover = 0,
  isDay = 1,
}) => {
  const weatherCode = Number(code);
  const precipMm = Number(rainAmount || 0);
  const clouds = Number(cloudCover || 0);
  const daytime = Number(isDay) === 1;

  if (precipMm === 0) {
    if (!daytime) {
      if (clouds >= 80) return WMO_MAP[3];
      if (clouds >= 35) return WMO_MAP[2];
      return { label: 'DOMBU RATRI', emoji: '🌙', art: 'clearNight' };
    }

    if (clouds >= 80) return WMO_MAP[3];
    if (clouds >= 40) return WMO_MAP[2];
    if (clouds >= 15) return WMO_MAP[1];
    return WMO_MAP[0];
  }

  if (isThunderCode(weatherCode)) {
    if (precipMm >= THUNDER_MIN_RAIN_MM) {
      return getWeatherInfo(weatherCode);
    }

    if (precipMm >= MIN_REAL_RAIN_MM) {
      return WMO_MAP[61];
    }

    if (!daytime) return WMO_MAP[3];
    return clouds >= 40 ? WMO_MAP[2] : WMO_MAP[1];
  }

  if (isRainCode(weatherCode) && precipMm >= MIN_REAL_RAIN_MM) {
    return getWeatherInfo(weatherCode);
  }

  if (isRainCode(weatherCode) && precipMm < MIN_REAL_RAIN_MM) {
    if (!daytime) return WMO_MAP[3];
    if (clouds >= 80) return WMO_MAP[3];
    if (clouds >= 35) return WMO_MAP[2];
    return WMO_MAP[1];
  }

  if (weatherCode === 0) {
    if (clouds >= 35) return WMO_MAP[2];
    if (!daytime) {
      return { label: 'DOMBU RATRI', emoji: '🌙', art: 'clearNight' };
    }
    return WMO_MAP[0];
  }

  if (weatherCode === 1) {
    if (clouds >= 55) return WMO_MAP[2];
    if (!daytime) return WMO_MAP[3];
    return WMO_MAP[1];
  }

  if (weatherCode === 2) {
    if (clouds >= 80) return WMO_MAP[3];
    return WMO_MAP[2];
  }

  if (weatherCode === 3) {
    if (daytime && clouds < 75) return WMO_MAP[2];
    return WMO_MAP[3];
  }

  return getWeatherInfo(weatherCode);
};

const getHourlyWeatherInfo = item => {
  if (!item) return WMO_MAP[3];

  const code = Number(item?.code);
  const precipMm = Number(item?.precipMm ?? 0);
  const rainChance = Number(item?.rainChance ?? 0);
  const hour = new Date(item.time).getHours();
  const isNight = hour >= 18 || hour < 6;

  if (precipMm === 0) {
    if (isNight) {
      return { label: 'DOMBU RATRI', emoji: '🌙', art: 'clearNight' };
    }
    if (rainChance >= 40) return WMO_MAP[2];
    return WMO_MAP[0];
  }

  if (isThunderCode(code)) {
    if (precipMm >= THUNDER_MIN_RAIN_MM) return getWeatherInfo(code);

    if (precipMm >= MIN_FORECAST_RAIN_MM) {
      return isNight
        ? { label: 'ONTHE BARSA', emoji: '🌧️', art: 'rain' }
        : { label: 'ONTHE BARSA', emoji: '🌦️', art: 'rain' };
    }

    return isNight
      ? { label: 'DOMBU RATRI', emoji: '🌙', art: 'clearNight' }
      : WMO_MAP[1];
  }

  if (isRainCode(code) && precipMm >= MIN_FORECAST_RAIN_MM) {
    return isNight
      ? { label: 'ONTHE BARSA', emoji: '🌧️', art: 'rain' }
      : { label: 'ONTHE BARSA', emoji: '🌦️', art: 'rain' };
  }

  if (isRainCode(code) && precipMm < MIN_FORECAST_RAIN_MM) {
    return isNight
      ? { label: 'DOMBU RATRI', emoji: '🌙', art: 'clearNight' }
      : WMO_MAP[1];
  }

  if (isNight && [0, 1].includes(code)) {
    return { label: 'DOMBU RATRI', emoji: '🌙', art: 'clearNight' };
  }

  if (isNight && code === 2) return WMO_MAP[3];
  if (!isNight && code === 0) return WMO_MAP[0];

  return getWeatherInfo(code);
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

const getTheme = (code, isDay) => {
  if (!isDay) return { bg: '#0A0F1C', accent: '#A5B4FC' };
  if (isRainCode(code)) return { bg: '#0C1A2B', accent: '#67E8F9' };
  if ([0, 1].includes(Number(code))) {
    return { bg: '#0F172A', accent: '#FACC15' };
  }
  return { bg: '#0A0F1C', accent: '#67E8F9' };
};

const getAQIInfo = value => {
  const n = toNumberOrNull(value);

  if (n === null) {
    return {
      value: '--',
      label: 'Unavailable',
      color: '#94A3B8',
      message: 'AQI data not available now',
    };
  }

  const aqi = Math.round(n);

  if (aqi <= 50) {
    return {
      value: aqi,
      label: 'Good',
      color: '#4ADE80',
      message: 'Air quality is healthy',
    };
  }

  if (aqi <= 100) {
    return {
      value: aqi,
      label: 'Moderate',
      color: '#FACC15',
      message: 'Acceptable air quality',
    };
  }

  if (aqi <= 150) {
    return {
      value: aqi,
      label: 'Sensitive',
      color: '#FB923C',
      message: 'Sensitive people be careful',
    };
  }

  if (aqi <= 200) {
    return {
      value: aqi,
      label: 'Unhealthy',
      color: '#F87171',
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
    color: '#FB7185',
    message: 'Stay indoors if possible',
  };
};

const getUVInfo = value => {
  const n = toNumberOrNull(value);

  if (n === null) {
    return {
      value: '--',
      label: 'Unavailable',
      color: '#94A3B8',
      message: 'UV data not available now',
    };
  }

  const uv = Number(n.toFixed(1));

  if (uv <= 2) {
    return {
      value: uv,
      label: 'Low',
      color: '#4ADE80',
      message: 'Safe for normal outdoor time',
    };
  }

  if (uv <= 5) {
    return {
      value: uv,
      label: 'Moderate',
      color: '#FACC15',
      message: 'Use sunscreen if outside longer',
    };
  }

  if (uv <= 7) {
    return {
      value: uv,
      label: 'High',
      color: '#FB923C',
      message: 'Use sunscreen and sunglasses',
    };
  }

  if (uv <= 10) {
    return {
      value: uv,
      label: 'Very High',
      color: '#F87171',
      message: 'Avoid direct afternoon sun',
    };
  }

  return {
    value: uv,
    label: 'Extreme',
    color: '#FB7185',
    message: 'Stay shaded as much as possible',
  };
};

const createWeatherNotificationChannel = async () => {
  await notifee.requestPermission();

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

    await AsyncStorage.removeItem(RAIN_START_TIME_KEY);
  } catch {}
};

const findRainStopSlot = hourlyList => {
  if (!Array.isArray(hourlyList) || !hourlyList.length) return null;

  return (
    hourlyList.find(item => {
      if (!item) return false;

      const chance = Number(item.rainChance ?? 0);
      const precipMm = Number(item.precipMm ?? 0);

      return chance < RAIN_STOP_THRESHOLD && precipMm < MIN_REAL_RAIN_MM;
    }) || null
  );
};

const buildRainStopLabel = stopTime => {
  if (!stopTime) return 'Chance of rain later';

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
    const futureOnly = hourlyList.filter(
      item => new Date(item.time).getTime() > Date.now() + 5 * 60 * 1000,
    );

    const stopSlot = findRainStopSlot(futureOnly);
    const stopTime = stopSlot ? new Date(stopSlot.time).getTime() : null;

    return {
      state: 'raining_now',
      stopTime,
      stopTimeLabel: buildRainStopLabel(stopTime),
    };
  }

  const now = Date.now();

  const firstRainSlot = hourlyList.find(item => {
    if (!item) return false;

    const itemTime = new Date(item.time).getTime();

    if (itemTime <= now + 5 * 60 * 1000) return false;

    return isFutureRainStrong(item);
  });

  if (!firstRainSlot) return { state: 'no_rain' };

  const startIndex = hourlyList.indexOf(firstRainSlot);

  const stopAfterRain = hourlyList.find((item, index) => {
    if (!item || index <= startIndex) return false;

    const chance = Number(item.rainChance ?? 0);
    const precipMm = Number(item.precipMm ?? 0);

    return chance < RAIN_STOP_THRESHOLD && precipMm < MIN_REAL_RAIN_MM;
  });

  const rainWindow = hourlyList.slice(
    startIndex,
    stopAfterRain ? hourlyList.indexOf(stopAfterRain) : undefined,
  );

  const maxChance = rainWindow.length
    ? Math.max(...rainWindow.map(item => Number(item?.rainChance ?? 0)))
    : Number(firstRainSlot?.rainChance ?? 0);

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
    expectedMm: Number(firstRainSlot?.precipMm ?? 0),
  };
};

let lastNotificationState = null;

const syncRainNotification = async weatherPayload => {
  try {
    if (!weatherPayload?.hourlyList?.length) {
      await cancelRainNotification();
      lastNotificationState = null;
      return;
    }

    const rainPrediction = predictRain(
      weatherPayload.hourlyList,
      weatherPayload.current?.weather_code,
      weatherPayload.currentRain,
    );

    const stateKey = `${rainPrediction.state}-${rainPrediction.stopTime}-${rainPrediction.startTime}`;

    if (lastNotificationState === stateKey) return;

    lastNotificationState = stateKey;

    if (rainPrediction.state === 'no_rain') {
      await cancelRainNotification();
      return;
    }

    if (rainPrediction.state === 'raining_now') {
      await AsyncStorage.setItem(RAIN_START_TIME_KEY, String(Date.now()));

      const channelId = await createWeatherNotificationChannel();

      await notifee.displayNotification({
        id: RAIN_ALERT_NOTIFICATION_ID,
        title: '🌧️ Barsa Barondu Undu',
        body:
          buildRainStopNotificationLabel(rainPrediction.stopTime) ||
          'Rain is active now',
        android: {
          channelId,
          color: '#67E8F9',
          pressAction: { id: 'default' },
        },
      });

      return;
    }

    if (rainPrediction.state === 'rain_coming' && rainPrediction.startTime) {
      const notifyAt = rainPrediction.startTime - 30 * 60 * 1000;

      if (notifyAt <= Date.now()) return;

      const channelId = await createWeatherNotificationChannel();

      await notifee.createTriggerNotification(
        {
          id: RAIN_ALERT_NOTIFICATION_ID,
          title: 'Barsa Jagrathe 🌧️',
          body: rainPrediction.stopTime
            ? `Barsa ${
                rainPrediction.startTimeLabel
              } d barpuna saadhyate, ${toClockTime(
                rainPrediction.stopTime,
              )} g kammi avu.`
            : `Barsa ${rainPrediction.startTimeLabel} d barpuna saadhyate.`,
          android: {
            channelId,
            color: '#67E8F9',
            pressAction: { id: 'default' },
          },
        },
        { type: TriggerType.TIMESTAMP, timestamp: notifyAt },
      );
    }
  } catch {}
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

    if (fineGranted || coarseGranted) return true;

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

const getCurrentLocation = (isRefresh = false) =>
  new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: isRefresh,
      timeout: isRefresh ? 6000 : 8000,
      maximumAge: isRefresh ? 0 : 10 * 60 * 1000,
      forceRequestLocation: true,
      showLocationDialog: true,
    });
  });

const getOpenStreetMapLocationName = async (lat, lon) => {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
    { headers: { 'User-Agent': 'NammaWeather/1.0' } },
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
    data.locality,
    smallPlace?.name,
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
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation,rain,is_day,cloud_cover` +
      `&hourly=temperature_2m,relative_humidity_2m,weather_code,precipitation_probability,precipitation` +
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
    humidity: hourly.relative_humidity_2m?.[index] ?? 0,
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

const RainTimerCard = ({ prediction, accent }) => {
  if (prediction.state === 'no_rain') return null;

  const isNow = prediction.state === 'raining_now';
  const bg = 'rgba(15, 23, 42, 0.62)';
  const border = accent + '44';

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
            <Text style={st.rainTimerIcon}>
              {prediction.stopTime ? '🌤️' : '🌧️'}
            </Text>
            <Text style={st.rainTimerLabel}>
              {prediction.stopTime ? 'Clears up' : 'Rain status'}
            </Text>
            <Text
              style={[st.rainTimerClock, st.rainTimerClockSmall]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
            >
              {prediction.stopTimeLabel || 'Chance of rain later'}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  const expectedMm = Number(prediction.expectedMm ?? 0);

  const intensityLabel =
    expectedMm >= 7.5
      ? 'heavy rain'
      : expectedMm >= 3.5
      ? 'moderate rain'
      : expectedMm >= 1.5
      ? 'light rain'
      : 'drizzle';

  return (
    <View style={[st.rainCard, { borderColor: border, backgroundColor: bg }]}>
      <View style={st.rainCardRow}>
        <View style={st.rainTimerBlock}>
          <Text style={st.rainTimerIcon}>🕐</Text>
          <Text style={st.rainTimerLabel}>Chance of rain later</Text>
          <Text style={[st.rainTimerClock, { color: accent }]}>
            {prediction.startTimeLabel}
          </Text>
        </View>

        <View style={st.rainTimerDivider} />

        <View style={st.rainTimerBlock}>
          <Text style={st.rainTimerIcon}>
            {prediction.stopTime ? '☀️' : '🌧️'}
          </Text>
          <Text style={st.rainTimerLabel}>
            {prediction.stopTime ? 'Clears up' : 'Rain status'}
          </Text>
          <Text
            style={[st.rainTimerClock, st.rainTimerClockSmall]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.78}
          >
            {prediction.stopTimeLabel || 'Chance of rain later'}
          </Text>
        </View>
      </View>

      {prediction.chance > 0 && (
        <Text style={st.rainChanceLabel}>
          {prediction.chance}% chance of {intensityLabel}
        </Text>
      )}
    </View>
  );
};

const MetricCard = ({ label, value, sub, accent }) => (
  <View style={st.metricCard}>
    <Text style={st.metricLabel}>{label}</Text>
    <Text style={[st.metricValue, { color: accent }]}>{value}</Text>
    {!!sub && <Text style={st.metricSub}>{sub}</Text>}
  </View>
);

const InfoCard = ({ title, value, label, message, color }) => (
  <View style={st.infoCard}>
    <View style={{ flex: 1 }}>
      <Text style={st.infoTitle}>{title}</Text>
      <Text style={[st.infoLabel, { color }]}>{label}</Text>
      <Text style={st.infoMessage}>{message}</Text>
    </View>
    <Text style={[st.infoValue, { color }]}>{value}</Text>
  </View>
);

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
  const appStateRef = useRef(AppState.currentState);
  const isFetchingRef = useRef(false);
  const lastFetchRef = useRef(0);
  const isMountedRef = useRef(true);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    weatherRef.current = weather;
  }, [weather]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const currentCode = weather?.current?.weather_code ?? 3;
  const isDay = weather?.current?.is_day !== 0;

  const smartThemeInfo = weather?.current
    ? getSmartWeatherInfo({
        code: weather.current.weather_code,
        rainAmount: weather.currentRain,
        cloudCover: weather.current.cloud_cover,
        isDay: weather.current.is_day,
      })
    : WMO_MAP[3];

  const themeArtCode =
    smartThemeInfo.art === 'rain' || smartThemeInfo.art === 'storm'
      ? currentCode
      : smartThemeInfo.art === 'sunny'
      ? 0
      : smartThemeInfo.art === 'partlyCloudy'
      ? 1
      : smartThemeInfo.art === 'clearNight'
      ? 0
      : smartThemeInfo.art === 'fog'
      ? 45
      : 3;

  const theme = useMemo(
    () => getTheme(themeArtCode, isDay),
    [themeArtCode, isDay],
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

  const currentInfo = useMemo(() => {
    if (!weather?.current) return getWeatherInfo(3);

    return getSmartWeatherInfo({
      code: weather.current.weather_code,
      rainAmount: weather.currentRain,
      cloudCover: weather.current.cloud_cover,
      isDay: weather.current.is_day,
    });
  }, [weather]);

  const aqiInfo = useMemo(
    () => getAQIInfo(weather?.airQuality?.aqi),
    [weather],
  );

  const uvInfo = useMemo(() => {
    const currentUv =
      weather?.airQuality?.uvIndex ?? weather?.daily?.uvIndexMax ?? null;

    return getUVInfo(currentUv);
  }, [weather]);

  const isRainingNow = prediction.state === 'raining_now';
  const isHeavyRain = Number(weather?.currentRain ?? 0) >= 6;

  const animateIn = () => {
    fadeAnim.setValue(0);
    slideAnim.setValue(24);

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 520,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 460,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const loadWeather = async ({ silent = false, isRefresh = false } = {}) => {
    if (isFetchingRef.current) {
      if (isRefresh) setRefreshing(false);
      return;
    }

    isFetchingRef.current = true;
    lastFetchRef.current = Date.now();

    try {
      if (!isMountedRef.current) return;

      setError('');
      setPermissionError(false);

      if (isRefresh) {
        setRefreshing(true);
      } else if (!silent && !weatherRef.current) {
        setLoading(true);
      }

      const hasPermission = await requestLocationPermission();

      if (!isMountedRef.current) return;

      if (!hasPermission) {
        setPermissionError(true);
        await cancelRainNotification();

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
        position = await getCurrentLocation(isRefresh);
      } catch {
        cachedCoords = await readCoords();
      }

      const latitude = position?.coords?.latitude ?? cachedCoords?.latitude;
      const longitude = position?.coords?.longitude ?? cachedCoords?.longitude;

      if (!latitude || !longitude) {
        throw new Error('Unable to find location.');
      }

      const [cityNameResult, weatherData, airQualityData] = await Promise.all([
        getCityName(latitude, longitude),
        getWeatherData(latitude, longitude),
        getAirQualityData(latitude, longitude).catch(() => null),
      ]);

      if (!isMountedRef.current) return;

      const payload = buildPayload({
        cityName: cityNameResult || cachedCoords?.cityName || 'Your Location',
        weatherData,
        airQualityData,
        latitude,
        longitude,
      });

      setWeather(payload);
      setUsingCached(false);
      setNotice('');

      await saveCache(payload);
      await syncRainNotification(payload);

      animateIn();
    } catch (err) {
      if (!isMountedRef.current) return;

      await cancelRainNotification();

      const cached = await readCache();

      if (cached && weatherRef.current) {
        setUsingCached(true);
        setNotice('Showing last saved weather.');
        return;
      }

      if (cached && !weatherRef.current) {
        setWeather(cached);
        setUsingCached(true);
        setNotice('Showing saved weather (offline).');
        animateIn();
        return;
      }

      setError(err?.message || 'Unable to load weather.');
    } finally {
      isFetchingRef.current = false;

      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  const boot = async () => {
    await cancelRainNotification();

    const cached = await readCache();

    if (cached && isMountedRef.current) {
      const cacheAgeMs = Date.now() - (cached.cachedAt || 0);
      const cacheIsStale = cacheAgeMs > 30 * 60 * 1000;
      const cacheShowedRain = cached.currentRain >= MIN_REAL_RAIN_MM;

      if (cacheIsStale && cacheShowedRain) {
        setLoading(true);
      } else {
        setWeather(cached);
        setUsingCached(true);
        setLoading(false);
        animateIn();
      }
    }

    loadWeather({ silent: !!cached });
  };

  useEffect(() => {
    boot();

    const subscription = AppState.addEventListener('change', nextState => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      const cameToForeground =
        previousState.match(/inactive|background/) && nextState === 'active';

      const canRefreshNow =
        Date.now() - lastFetchRef.current > MIN_REFRESH_GAP_MS;

      if (cameToForeground && canRefreshNow && isMountedRef.current) {
        loadWeather({ silent: true });
      }
    });

    return () => {
      subscription.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openSettings = () => {
    Linking.openSettings().catch(() => {});
  };

  if (loading && !weather) {
    return (
      <View style={[st.screen, st.center, { backgroundColor: theme.bg }]}>
        <StatusBar barStyle="light-content" backgroundColor={theme.bg} />
        <ActivityIndicator size="large" color={theme.accent} />
        <Text style={st.loadingText}>Namma Weather loading...</Text>
      </View>
    );
  }

  if (error && !weather) {
    return (
      <View
        style={[
          st.screen,
          st.center,
          { backgroundColor: theme.bg, paddingHorizontal: 24 },
        ]}
      >
        <StatusBar barStyle="light-content" backgroundColor={theme.bg} />
        <Text style={st.errorIcon}>⚠️</Text>
        <Text style={st.errorTitle}>Weather not available</Text>
        <Text style={st.errorText}>{error}</Text>

        {permissionError && (
          <TouchableOpacity
            activeOpacity={0.85}
            style={[st.primaryBtn, { backgroundColor: theme.accent }]}
            onPress={openSettings}
          >
            <Text style={st.primaryBtnText}>Open Settings</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          activeOpacity={0.85}
          style={st.secondaryBtn}
          onPress={() => loadWeather()}
        >
          <Text style={st.secondaryBtnText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const temp = Math.round(weather?.current?.temperature_2m ?? 0);
  const feels = Math.round(weather?.current?.apparent_temperature ?? 0);
  const humidity = Math.round(weather?.current?.relative_humidity_2m ?? 0);
  const wind = Math.round(weather?.current?.wind_speed_10m ?? 0);
  const rainChance = weather?.daily?.rainChanceMax ?? 0;
  const rainMm = Number(weather?.daily?.precipSum ?? 0);

  return (
    <View style={[st.screen, { backgroundColor: theme.bg }]}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />

      <SkyBackground
        weatherArt={currentInfo.art}
        isDay={weather?.current?.is_day !== 0}
      />

      <RainSystem
        isRaining={isRainingNow || ['rain', 'storm'].includes(currentInfo.art)}
        isHeavyRain={isHeavyRain}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          st.scrollContent,
          { paddingTop: insets.top + 22, paddingBottom: insets.bottom + 32 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadWeather({ isRefresh: true })}
            tintColor={theme.accent}
            colors={[theme.accent]}
            progressBackgroundColor="#111827"
          />
        }
      >
        <Animated.View
          style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
        >
          <View style={st.header}>
            <View style={{ flex: 1 }}>
              <Text style={st.appTitle}>NAMMA WEATHER</Text>
              <Text style={st.locationText} numberOfLines={1}>
                🧭 {weather?.cityName || 'Your Location'}
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.8}
              style={[st.refreshBtn, { borderColor: theme.accent + '55' }]}
              onPress={() => loadWeather({ isRefresh: true })}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color={theme.accent} />
              ) : (
                <Text style={[st.refreshIcon, { color: theme.accent }]}>⟳</Text>
              )}
            </TouchableOpacity>
          </View>

          {!!notice && (
            <View style={st.noticeBox}>
              <Text style={st.noticeText}>{notice}</Text>
            </View>
          )}

          {usingCached && (
            <Text style={st.cachedText}>Offline • Last updated recently</Text>
          )}

          <View style={st.heroCard}>
            <WeatherArt artType={currentInfo.art} accent={theme.accent} />

            <Text style={st.tempText}>{temp}°</Text>

            <Text style={[st.conditionText, { color: theme.accent }]}>
              {currentInfo.label}
            </Text>

            <Text style={st.updatedText}>
              Updated {weather?.lastUpdated || '--'}
            </Text>

            <RainTimerCard prediction={prediction} accent={theme.accent} />
          </View>

          <View style={st.metricsGrid}>
            <MetricCard
              label="Feels Like"
              value={`${feels}°`}
              sub="Feels hotter"
              accent={theme.accent}
            />
            <MetricCard
              label="Tampu"
              value={`${humidity}%`}
              sub="Neer uppu"
              accent={theme.accent}
            />
            <MetricCard
              label="Gali"
              value={`${wind}`}
              sub="km/h"
              accent={theme.accent}
            />
            <MetricCard
              label="Barsa Chance"
              value={`${rainChance}%`}
              sub={`${rainMm.toFixed(1)} mm`}
              accent={theme.accent}
            />
          </View>

          <View style={st.todayCard}>
            <View style={st.todayRow}>
              <View>
                <Text style={st.sectionTitle}>Today</Text>
                <Text style={st.sectionSub}>Daily weather details</Text>
              </View>

              <Text style={[st.todayBadge, { color: theme.accent }]}>
                {weather?.daily?.minTemp !== undefined
                  ? `${Math.round(weather.daily.minTemp)}° / ${Math.round(
                      weather.daily.maxTemp,
                    )}°`
                  : '--'}
              </Text>
            </View>

            <View style={st.sunRow}>
              <View style={st.sunBox}>
                <Text style={st.sunIcon}>🌤️</Text>
                <Text style={st.sunLabel}>Sunrise</Text>
                <Text style={st.sunValue}>
                  {formatTime(weather?.daily?.sunrise)}
                </Text>
              </View>

              <View style={st.sunBoxLast}>
                <Text style={st.sunIcon}>🌇</Text>
                <Text style={st.sunLabel}>Sunset</Text>
                <Text style={st.sunValue}>
                  {formatTime(weather?.daily?.sunset)}
                </Text>
              </View>
            </View>
          </View>

          <View style={st.sectionHeader}>
            <Text style={st.sectionTitle}>Hourly</Text>
            <Text style={st.sectionSub}>Next 12 hours</Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={st.hourlyList}
          >
            {weather?.hourlyList?.map(item => {
              const info = getHourlyWeatherInfo(item);

              return (
                <View
                  key={`${item.time}-${item.code}`}
                  style={[
                    st.hourCard,
                    {
                      borderColor: theme.accent + '30',
                      backgroundColor: 'rgba(30, 41, 59, 0.32)',
                    },
                  ]}
                >
                  <Text style={st.hourLabel}>{item.label}</Text>
                  <Text style={st.hourIcon}>{info.emoji}</Text>
                  <Text style={st.hourTemp}>{item.temp}°</Text>
                  <Text style={st.hourRain}>{item.rainChance}%</Text>
                  <Text style={st.hourMm}>
                    {Number(item.precipMm).toFixed(1)}mm
                  </Text>
                </View>
              );
            })}
          </ScrollView>

          <View style={st.sectionHeader}>
            <Text style={st.sectionTitle}>Air Quality & UV</Text>
            <Text style={st.sectionSub}>Health and outdoor safety</Text>
          </View>

          <InfoCard
            title="AQI"
            value={aqiInfo.value}
            label={aqiInfo.label}
            message={aqiInfo.message}
            color={aqiInfo.color}
          />

          <InfoCard
            title="UV Index"
            value={uvInfo.value}
            label={uvInfo.label}
            message={uvInfo.message}
            color={uvInfo.color}
          />

          <View style={st.metricsGrid}>
            <MetricCard
              label="PM2.5"
              value={formatOptional(weather?.airQuality?.pm25, 1)}
              sub="Fine dust"
              accent={theme.accent}
            />

            <MetricCard
              label="PM10"
              value={formatOptional(weather?.airQuality?.pm10, 1)}
              sub="Dust level"
              accent={theme.accent}
            />
          </View>

          <Text style={st.footer}>MONSOON • COAST • KARNATAKA</Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
