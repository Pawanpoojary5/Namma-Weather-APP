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

const RAIN_ALERT_NOTIFICATION_ID = 'namma-weather-rain-alert';
const RAIN_ALERT_CHANNEL_ID = 'weather-alerts';

const MIN_REFRESH_GAP_MS = 10 * 60 * 1000;
const RAIN_STOP_THRESHOLD = 20;
const MIN_REAL_RAIN_MM = 0.3;
const FUTURE_RAIN_MIN_CHANCE = 70;
const FUTURE_RAIN_MIN_MM = 0.2;

const WMO_MAP = {
  0: { label: 'DOMBU', emoji: '☀️', art: 'sunny' },
  1: { label: 'ONTHE DOMBU', emoji: '🌤️', art: 'sunny' },
  2: { label: 'ONTHE MUGAL', emoji: '⛅', art: 'cloudy' },
  3: { label: 'MODA', emoji: '☁️', art: 'cloudy' },
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

const isFutureRainStrong = item => {
  const chance = Number(item?.rainChance ?? 0);
  const precipMm = Number(item?.precipMm ?? 0);

  return chance >= FUTURE_RAIN_MIN_CHANCE || precipMm >= FUTURE_RAIN_MIN_MM;
};

const getWeatherInfo = code =>
  WMO_MAP[Number(code)] || { label: 'MODA', emoji: '☁️', art: 'cloudy' };

const getSafeWeatherInfo = (code, rainAmount = 0) => {
  if (isRainCode(code) && !hasRealRain(rainAmount)) {
    return WMO_MAP[3];
  }

  return getWeatherInfo(code);
};

const getHourlyWeatherInfo = item => {
  if (!item) return WMO_MAP[3];

  const chance = Number(item?.rainChance ?? 0);
  const precipMm = Number(item?.precipMm ?? 0);

  if (chance >= FUTURE_RAIN_MIN_CHANCE || precipMm >= FUTURE_RAIN_MIN_MM) {
    return getWeatherInfo(item?.code);
  }

  if (isRainCode(item?.code) && precipMm < MIN_REAL_RAIN_MM) {
    return WMO_MAP[3];
  }

  return getWeatherInfo(item?.code);
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
  if (!isDay) return { bg: '#080D1A', accent: '#8EA7FF' };

  if (isRainCode(code)) {
    return { bg: '#071927', accent: '#6CD9FF' };
  }

  if ([0, 1].includes(Number(code))) {
    return { bg: '#0A1728', accent: '#FFD166' };
  }

  return { bg: '#0A0F1E', accent: '#4DFFB4' };
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
    if (!item) return false;

    const itemTime = new Date(item.time).getTime();

    if (itemTime <= now + 5 * 60 * 1000) {
      return false;
    }

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

    if (lastNotificationState === stateKey) {
      return;
    }

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
          color: '#6CD9FF',
          pressAction: {
            id: 'default',
          },
        },
      });

      return;
    }

    if (rainPrediction.state === 'rain_coming' && rainPrediction.startTime) {
      const notifyAt = rainPrediction.startTime - 30 * 60 * 1000;

      if (notifyAt <= Date.now()) {
        return;
      }

      const channelId = await createWeatherNotificationChannel();

      await notifee.createTriggerNotification(
        {
          id: RAIN_ALERT_NOTIFICATION_ID,
          title: 'Barsa Jagrathe 🌧️',
          body: rainPrediction.stopTime
            ? `Barsa ${
                rainPrediction.startTimeLabel
              } d shuru avu, ${toClockTime(
                rainPrediction.stopTime,
              )} g clear avu.`
            : `Barsa ${rainPrediction.startTimeLabel} d shuru avu. Rain may continue today.`,
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

const getCurrentLocation = (isRefresh = false) =>
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

    const timeoutMs = isRefresh ? 8000 : 12000;

    const hardTimeout = setTimeout(() => {
      finishError({
        code: 3,
        message: 'Location request timed out',
      });
    }, timeoutMs);

    Geolocation.getCurrentPosition(
      position => {
        clearTimeout(hardTimeout);
        finishSuccess(position);
      },
      error => {
        clearTimeout(hardTimeout);
        finishError(error);
      },
      {
        enableHighAccuracy: isRefresh,
        timeout: isRefresh ? 6000 : 8000,
        maximumAge: isRefresh ? 0 : 10 * 60 * 1000,
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
              {prediction.stopTimeLabel || 'Rain may continue today'}
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
            {prediction.stopTimeLabel || 'Rain may continue today'}
          </Text>
        </View>
      </View>

      {prediction.chance > 0 && (
        <Text style={st.rainChanceLabel}>
          {prediction.chance}% chance with rain amount
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
  const slideAnim = useRef(new Animated.Value(20)).current;

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

  const currentInfo = useMemo(() => {
    if (!weather?.current) return getWeatherInfo(3);

    return getSafeWeatherInfo(
      weather.current.weather_code,
      weather.currentRain,
    );
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

  const animateIn = () => {
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
      setWeather(cached);
      setUsingCached(true);
      setLoading(false);
      animateIn();
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
      <StatusBar barStyle="light-content" backgroundColor={theme.bg} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          st.scrollContent,
          {
            paddingTop: insets.top + 18,
            paddingBottom: insets.bottom + 26,
          },
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
          style={{
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          }}
        >
          <View style={st.header}>
            <View style={{ flex: 1 }}>
              <Text style={st.appTitle}>NAMMA WEATHER</Text>
              <Text style={st.locationText} numberOfLines={1}>
                📍 {weather?.cityName || 'Your Location'}
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.8}
              style={[st.refreshBtn, { borderColor: theme.accent + '44' }]}
              onPress={() => loadWeather({ isRefresh: true })}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color={theme.accent} />
              ) : (
                <Text style={[st.refreshIcon, { color: theme.accent }]}>↻</Text>
              )}
            </TouchableOpacity>
          </View>

          {!!notice && (
            <View style={st.noticeBox}>
              <Text style={st.noticeText}>{notice}</Text>
            </View>
          )}

          {usingCached && (
            <Text style={st.cachedText}>Offline saved weather shown</Text>
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
              sub="Body temp feel"
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
                <Text style={st.sunIcon}>🌅</Text>
                <Text style={st.sunLabel}>Sunrise</Text>
                <Text style={st.sunValue}>
                  {formatTime(weather?.daily?.sunrise)}
                </Text>
              </View>

              <View style={st.sunBox}>
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
            <Text style={st.sectionSub}>Next weather update</Text>
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
                      borderColor: theme.accent + '24',
                      backgroundColor: theme.accent + '0D',
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
            <Text style={st.sectionTitle}>Air Quality</Text>
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

          <Text style={st.footer}> BALMY WEATHER, COASTAL SOUL</Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  screen: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 18,
  },
  loadingText: {
    color: '#E8EDF5',
    marginTop: 14,
    fontSize: 15,
    fontWeight: '800',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  appTitle: {
    color: '#5A6A82',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  locationText: {
    color: '#E8EDF5',
    fontSize: 21,
    fontWeight: '900',
    marginTop: 4,
  },
  refreshBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF08',
  },
  refreshIcon: {
    fontSize: 25,
    fontWeight: '900',
  },
  noticeBox: {
    backgroundColor: '#FFFFFF0D',
    borderWidth: 1,
    borderColor: '#FFFFFF12',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
  },
  noticeText: {
    color: '#CAD6E6',
    fontSize: 12,
    fontWeight: '700',
  },
  cachedText: {
    color: '#FFD166',
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 10,
  },
  heroCard: {
    borderRadius: 32,
    padding: 22,
    backgroundColor: '#FFFFFF08',
    borderWidth: 1,
    borderColor: '#FFFFFF12',
    alignItems: 'center',
    marginBottom: 16,
  },
  tempText: {
    color: '#E8EDF5',
    fontSize: 74,
    lineHeight: 82,
    fontWeight: '900',
    marginTop: -6,
  },
  conditionText: {
    fontSize: 21,
    fontWeight: '900',
  },
  updatedText: {
    color: '#5A6A82',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 5,
    marginBottom: 18,
  },
  rainCard: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    marginTop: 4,
  },
  rainCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rainTimerBlock: {
    flex: 1,
    alignItems: 'center',
  },
  rainTimerDivider: {
    width: 1,
    height: 64,
    backgroundColor: '#FFFFFF18',
    marginHorizontal: 12,
  },
  rainTimerIcon: {
    fontSize: 25,
    marginBottom: 5,
  },
  rainTimerLabel: {
    color: '#8A9BB0',
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 4,
  },
  rainTimerClock: {
    color: '#E8EDF5',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  rainTimerClockSmall: {
    fontSize: 14,
    lineHeight: 18,
  },
  rainChanceLabel: {
    color: '#8A9BB0',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 12,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  metricCard: {
    width: '48.5%',
    borderRadius: 22,
    padding: 15,
    backgroundColor: '#FFFFFF08',
    borderWidth: 1,
    borderColor: '#FFFFFF12',
  },
  metricLabel: {
    color: '#8A9BB0',
    fontSize: 12,
    fontWeight: '800',
  },
  metricValue: {
    fontSize: 27,
    fontWeight: '900',
    marginTop: 6,
  },
  metricSub: {
    color: '#5A6A82',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  todayCard: {
    borderRadius: 26,
    padding: 17,
    backgroundColor: '#FFFFFF08',
    borderWidth: 1,
    borderColor: '#FFFFFF12',
    marginBottom: 18,
  },
  todayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  todayBadge: {
    fontSize: 18,
    fontWeight: '900',
  },
  sunRow: {
    flexDirection: 'row',
    gap: 10,
  },
  sunBox: {
    flex: 1,
    borderRadius: 18,
    padding: 13,
    backgroundColor: '#0000001E',
  },
  sunIcon: {
    fontSize: 23,
  },
  sunLabel: {
    color: '#8A9BB0',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 6,
  },
  sunValue: {
    color: '#E8EDF5',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 2,
  },
  sectionHeader: {
    marginTop: 4,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#E8EDF5',
    fontSize: 18,
    fontWeight: '900',
  },
  sectionSub: {
    color: '#5A6A82',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  hourlyList: {
    gap: 10,
    paddingRight: 18,
    paddingBottom: 18,
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
  hourIcon: {
    fontSize: 25,
    marginTop: 8,
  },
  hourTemp: {
    color: '#E8EDF5',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 5,
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
  infoCard: {
    borderRadius: 22,
    padding: 16,
    backgroundColor: '#FFFFFF08',
    borderWidth: 1,
    borderColor: '#FFFFFF12',
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  infoTitle: {
    color: '#8A9BB0',
    fontSize: 12,
    fontWeight: '800',
  },
  infoLabel: {
    fontSize: 20,
    fontWeight: '900',
    marginTop: 3,
  },
  infoMessage: {
    color: '#5A6A82',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
  infoValue: {
    fontSize: 32,
    fontWeight: '900',
    alignSelf: 'center',
  },
  footer: {
    textAlign: 'center',
    color: '#5A6A82',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    opacity: 0.55,
    marginTop: 8,
  },
  errorIcon: {
    fontSize: 44,
    marginBottom: 14,
  },
  errorTitle: {
    color: '#E8EDF5',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorText: {
    color: '#8A9BB0',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 18,
  },
  primaryBtn: {
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 18,
    marginBottom: 10,
  },
  primaryBtnText: {
    color: '#08111F',
    fontSize: 14,
    fontWeight: '900',
  },
  secondaryBtn: {
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 18,
    backgroundColor: '#FFFFFF10',
    borderWidth: 1,
    borderColor: '#FFFFFF14',
  },
  secondaryBtnText: {
    color: '#E8EDF5',
    fontSize: 14,
    fontWeight: '900',
  },
});
