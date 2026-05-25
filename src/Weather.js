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
import { WEATHERAPI_KEY } from '@env';
import { st } from './WeatherStyle';
import { SkyBackground, RainSystem, WeatherArt } from './WeatherAnimations';

// ─── CACHE KEYS ───────────────────────────────────────────────────────────────
const WEATHER_CACHE_KEY = 'wx:weather';
const COORDS_CACHE_KEY = 'wx:coords';
const RAIN_START_TIME_KEY = 'wx:rain_start_time';
const TEMP_CACHE_KEY = 'wx:last_temp';
const LAST_RAIN_TIME_KEY = 'wx:last_rain_time';
const ML_ACCURACY_KEY = 'wx:ml_accuracy_data';
const RAIN_ALERT_NOTIFICATION_ID = 'namma-weather-rain-alert';
const RAIN_ALERT_CHANNEL_ID = 'weather-alerts';
const MIN_REFRESH_GAP_MS = 10 * 60 * 1000;
const MIN_NOTIFY_RAIN_MM = 5.5;
// ─── MONSOON MODE ─────────────────────────────────────────────────────────────
const isMonsoonSeason = () => {
  const month = new Date().getMonth() + 1;
  return month >= 6 && month <= 9;
};

// ─── THRESHOLDS ───────────────────────────────────────────────────────────────
const getThresholds = () => {
  const monsoon = isMonsoonSeason();
  return {
    MIN_REAL_RAIN_MM: monsoon ? 1.5 : 3.5,
    FUTURE_RAIN_MIN_MM: monsoon ? 0.3 : 0.8,
    FUTURE_RAIN_MIN_CHANCE: monsoon ? 50 : 65,
    HEAVY_DAY_MM: monsoon ? 5 : 8,
    HEAVY_DAY_SLOT_MM: monsoon ? 0.3 : 0.8,
    THUNDER_MIN_RAIN_MM: monsoon ? 1.0 : 2.0,
    RAIN_STOP_THRESHOLD: monsoon ? 25 : 20,
    CLOUD_PARTLY: 70,
    CLOUD_FULL: 85,
  };
};

// ─── PHASE 1: CONFIDENCE BOOSTERS ─────────────────────────────────────────────

// Humidity boost: high humidity + rain code = very likely
const getHumidityBoost = humidity => {
  const h = Number(humidity ?? 0);
  if (h >= 85) return 1.25; // Very high
  if (h >= 75) return 1.15; // High
  if (h >= 65) return 1.05; // Moderate
  return 1.0;
};

// Temperature drop signal: rapid drop = rain incoming
const getTempDropBoost = (currentTemp, lastTemp) => {
  if (!lastTemp) return 1.0;
  const drop = Number(lastTemp ?? 0) - Number(currentTemp ?? 0);
  if (drop > 2.5) return 1.3; // Major drop
  if (drop > 1.5) return 1.2; // Significant drop
  if (drop > 0.8) return 1.1; // Minor drop
  return 1.0;
};

// Time-of-day pattern: coastal Karnataka = afternoon rain peak
const getTimeOfDayBoost = hour => {
  if (hour >= 13 && hour <= 16) return 1.15; // 1–4 PM peak
  if (hour >= 17 && hour <= 19) return 1.1; // 5–7 PM secondary
  if (hour >= 10 && hour <= 12) return 1.05; // 10–12 AM rising
  if (hour >= 6 && hour <= 9) return 0.9; // Early morning low
  return 1.0;
};

// Recent rain memory: if rained 3 hours ago, likely again
const getRecentRainBoost = async () => {
  try {
    const lastRainStr = await AsyncStorage.getItem(LAST_RAIN_TIME_KEY);
    if (!lastRainStr) return 1.0;

    const lastRainTime = Number(lastRainStr);
    const hoursSince = (Date.now() - lastRainTime) / (1000 * 60 * 60);

    if (hoursSince < 3) return 1.25; // Last 3 hours = high confidence
    if (hoursSince < 6) return 1.15; // Last 6 hours = medium
    if (hoursSince < 12) return 1.05; // Last 12 hours = slight
    return 1.0;
  } catch {
    return 1.0;
  }
};

// ─── PHASE 2: WEATHERAPI CROSS-REFERENCE ──────────────────────────────────────

const getWeatherApiData = async (lat, lon) => {
  try {
    if (!WEATHERAPI_KEY || WEATHERAPI_KEY === 'YOUR_WEATHERAPI_KEY_HERE') {
      return null; // Skip if no key
    }

    const response = await fetch(
      `https://api.weatherapi.com/v1/forecast.json?key=${WEATHERAPI_KEY}&q=${lat},${lon}&days=2&aqi=yes`,
    );
    if (!response.ok) return null;

    const data = await response.json();
    return data;
  } catch (err) {
    console.error('WeatherAPI error:', err);
    return null;
  }
};

// Compare Open-Meteo vs WeatherAPI predictions
const compareApis = (omChance, waChance) => {
  if (!waChance) return { finalChance: omChance, confidence: 'om_only' };

  const diff = Math.abs(omChance - waChance);
  const average = (omChance + waChance) / 2;

  // If both agree = high confidence, use average
  if (diff < 10)
    return { finalChance: Math.round(average), confidence: 'both_agree' };

  // If slight disagreement = medium confidence, use average
  if (diff < 20)
    return { finalChance: Math.round(average), confidence: 'Small Difference' };

  // If major disagreement = take higher (conservative)
  return {
    finalChance: Math.max(omChance, waChance),
    confidence: 'major_diff',
  };
};

// ─── PHASE 3: ML ACCURACY TRACKING ────────────────────────────────────────────

const recordPrediction = async (predictionChance, actualRain) => {
  try {
    const data = await AsyncStorage.getItem(ML_ACCURACY_KEY);
    let accuracyData = data ? JSON.parse(data) : {};

    // Bucket predictions: 0–20%, 20–40%, 40–60%, 60–80%, 80–100%
    const bucket = Math.floor(predictionChance / 20) * 20;
    const key = `bucket_${bucket}`;

    if (!accuracyData[key]) {
      accuracyData[key] = { predicted: 0, correct: 0 };
    }

    accuracyData[key].predicted += 1;
    if (actualRain) accuracyData[key].correct += 1;

    await AsyncStorage.setItem(ML_ACCURACY_KEY, JSON.stringify(accuracyData));
  } catch (err) {
    console.error('ML tracking error:', err);
  }
};

// Calculate calibrated threshold based on 30+ days data
const getCalibratedThreshold = async () => {
  try {
    const data = await AsyncStorage.getItem(ML_ACCURACY_KEY);
    if (!data) return getThresholds().FUTURE_RAIN_MIN_CHANCE;

    const accuracyData = JSON.parse(data);
    const totalPredictions = Object.values(accuracyData).reduce(
      (sum, b) => sum + b.predicted,
      0,
    );

    // Need 30+ predictions to calibrate
    if (totalPredictions < 30) return getThresholds().FUTURE_RAIN_MIN_CHANCE;

    // Find bucket with best accuracy
    let bestAccuracy = 0;
    let bestChance = 65;

    Object.entries(accuracyData).forEach(([key, bucket]) => {
      const accuracy = bucket.correct / bucket.predicted;
      if (accuracy > bestAccuracy) {
        bestAccuracy = accuracy;
        const chance = Number(key.replace('bucket_', ''));
        bestChance = chance + 10;
      }
    });

    return bestChance;
  } catch {
    return getThresholds().FUTURE_RAIN_MIN_CHANCE;
  }
};

// Get ML calibration report
const getMLReport = async () => {
  try {
    const data = await AsyncStorage.getItem(ML_ACCURACY_KEY);
    if (!data) return null;

    const accuracyData = JSON.parse(data);
    const report = {};

    Object.entries(accuracyData).forEach(([bucket, stats]) => {
      const accuracy = ((stats.correct / stats.predicted) * 100).toFixed(1);
      report[bucket] = { ...stats, accuracy: `${accuracy}%` };
    });

    return report;
  } catch {
    return null;
  }
};

// ─── WIND DIRECTION ───────────────────────────────────────────────────────────
const getWindRainConfidence = windDirection => {
  const wd = Number(windDirection ?? -1);
  if (wd < 0) return 1.0;
  if ((wd >= 180 && wd <= 300) || wd <= 30 || wd >= 330) return 1.0;
  if (wd >= 45 && wd <= 150) return 0.6;
  return 0.85;
};

// ─── WMO MAP ──────────────────────────────────────────────────────────────────
const WMO_MAP = {
  0: { label: 'DOMBU', emoji: '☀️', art: 'sunny' },
  1: { label: 'ONTHE DOMBU', emoji: '🌤️', art: 'partlyCloudy' },
  2: { label: 'ONTHE MUGAL', emoji: '☁️', art: 'cloudy' },
  3: { label: 'MUGAL', emoji: '☁️', art: 'cloudy' },
  45: { label: 'MAINDU', emoji: '🌫️', art: 'fog' },
  48: { label: 'MAINDU', emoji: '🌫️', art: 'fog' },
  51: { label: 'ONTHE BARSA', emoji: '🌦️', art: 'rain' },
  53: { label: 'ONTHE BARSA', emoji: '🌦️', art: 'rain' },
  55: { label: 'BARSA', emoji: '🌧️', art: 'rain' },
  56: { label: 'CHIMMA BARSA', emoji: '🌧️', art: 'rain' },
  57: { label: 'CHIMMA BARSA', emoji: '🌧️', art: 'rain' },
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
const getWeatherInfo = code =>
  WMO_MAP[Number(code)] || { label: 'MUGAL', emoji: '☁️', art: 'cloudy' };

// ─── RAIN INTENSITY ───────────────────────────────────────────────────────────
const getRainIntensityLabel = (chance, expectedMm, isMonsoon) => {
  const effectiveChance = Math.round(chance);
  if (expectedMm >= 7.5 || effectiveChance >= 90)
    return { tulu: 'JORU BARSA', en: 'heavy rain' };
  if (expectedMm >= 3.5 || effectiveChance >= 75)
    return { tulu: 'BARSA', en: 'moderate rain' };
  if (expectedMm >= 1.5 || effectiveChance >= 60)
    return { tulu: 'ONTHE BARSA', en: 'light rain' };
  if (isMonsoon) return { tulu: 'CHIMMA BARSA', en: 'drizzle' };
  return { tulu: 'ONTHE BARSA', en: 'light rain' };
};

// ─── RAIN CHECKS ──────────────────────────────────────────────────────────────
const isActualRainNow = (code, rainAmount, thresholds) =>
  isRainCode(Number(code)) &&
  Number(rainAmount || 0) >= thresholds.MIN_REAL_RAIN_MM;

const isFutureRainStrong = (
  item,
  thresholds,
  dailyPrecipSum = 0,
  windConfidence = 1.0,
  humidity = 0,
) => {
  const chance = Number(item?.rainChance ?? 0);
  const precipMm = Number(item?.precipMm ?? 0);
  const adjustedChance = chance * windConfidence;

  // PHASE 1: Add humidity boost
  const humidityBoost = getHumidityBoost(humidity);
  const boostedChance = adjustedChance * humidityBoost;

  const effectiveMmThreshold =
    Number(dailyPrecipSum) >= thresholds.HEAVY_DAY_MM
      ? thresholds.HEAVY_DAY_SLOT_MM
      : thresholds.FUTURE_RAIN_MIN_MM;

  return (
    boostedChance >= thresholds.FUTURE_RAIN_MIN_CHANCE &&
    precipMm >= effectiveMmThreshold
  );
};

// ─── SMART WEATHER INFO ───────────────────────────────────────────────────────
const getSmartWeatherInfo = ({
  code,
  rainAmount = 0,
  cloudCover = 0,
  isDay = 1,
  thresholds,
}) => {
  const T = thresholds || getThresholds();
  const weatherCode = Number(code);
  const precipMm = Number(rainAmount || 0);
  const clouds = Number(cloudCover || 0);
  const daytime = Number(isDay) === 1;

  if (isThunderCode(weatherCode) && precipMm >= T.THUNDER_MIN_RAIN_MM) {
    return getWeatherInfo(weatherCode);
  }

  if (isRainCode(weatherCode) && precipMm >= T.MIN_REAL_RAIN_MM) {
    return getWeatherInfo(weatherCode);
  }

  if (!daytime) {
    if (clouds >= T.CLOUD_FULL) return WMO_MAP[3];
    if (clouds >= T.CLOUD_PARTLY) return WMO_MAP[2];
    return { label: 'THINGOLDA BOLPU', emoji: '🌙', art: 'clearNight' };
  }
  if (clouds >= T.CLOUD_FULL) return WMO_MAP[3];
  if (clouds >= T.CLOUD_PARTLY) return WMO_MAP[2];
  return WMO_MAP[0];
};

// ─── HOURLY WEATHER ───────────────────────────────────────────────────────────
const getHourlyWeatherInfo = (item, thresholds) => {
  if (!item) return WMO_MAP[3];
  const T = thresholds || getThresholds();
  const code = Number(item?.code);
  const precipMm = Number(item?.precipMm ?? 0);
  const rainChance = Number(item?.rainChance ?? 0);
  const hour = new Date(item.time).getHours();
  const isNight = hour >= 18 || hour < 6;

  if (isThunderCode(code) && precipMm >= T.THUNDER_MIN_RAIN_MM)
    return getWeatherInfo(code);

  const isRainLikely =
    (isRainCode(code) && precipMm >= T.MIN_REAL_RAIN_MM) ||
    (rainChance >= 85 && isRainCode(code));

  if (isRainLikely) {
    return isNight
      ? { label: 'ONTHE BARSA', emoji: '🌧️', art: 'rain' }
      : { label: 'ONTHE BARSA', emoji: '🌦️', art: 'rain' };
  }

  if (isNight) {
    if (rainChance >= 70) return WMO_MAP[3];
    return { label: 'THINGOLDA BOLPU', emoji: '🌙', art: 'clearNight' };
  }
  if (rainChance >= 70) return WMO_MAP[2];
  return WMO_MAP[0];
};

// ─── THEME ────────────────────────────────────────────────────────────────────
const getTheme = (code, isDay) => {
  if (!isDay) return { bg: '#0A0F1C', accent: '#A5B4FC' };
  if (isRainCode(code)) return { bg: '#0C1A2B', accent: '#67E8F9' };
  if ([0, 1].includes(Number(code)))
    return { bg: '#0F172A', accent: '#FACC15' };
  return { bg: '#0A0F1C', accent: '#67E8F9' };
};

// ─── UTILITIES ────────────────────────────────────────────────────────────────
const toNumberOrNull = value => {
  const n = Number(value);
  return value === null || value === undefined || Number.isNaN(n) ? null : n;
};

const formatOptional = (value, digits = 0) => {
  const n = toNumberOrNull(value);
  return n === null ? '--' : n.toFixed(digits);
};

const getAQIInfo = value => {
  const n = toNumberOrNull(value);
  if (n === null)
    return {
      value: '--',
      label: 'Unavailable',
      color: '#94A3B8',
      message: 'AQI data not available',
    };
  const aqi = Math.round(n);
  if (aqi <= 50)
    return {
      value: aqi,
      label: 'Good',
      color: '#4ADE80',
      message: 'Air quality is healthy',
    };
  if (aqi <= 100)
    return {
      value: aqi,
      label: 'Moderate',
      color: '#FACC15',
      message: 'Acceptable air quality',
    };
  if (aqi <= 150)
    return {
      value: aqi,
      label: 'Sensitive',
      color: '#FB923C',
      message: 'Sensitive people be careful',
    };
  if (aqi <= 200)
    return {
      value: aqi,
      label: 'Unhealthy',
      color: '#F87171',
      message: 'Avoid long outdoor activity',
    };
  if (aqi <= 300)
    return {
      value: aqi,
      label: 'Very Unhealthy',
      color: '#C084FC',
      message: 'Outdoor activity not recommended',
    };
  return {
    value: aqi,
    label: 'Hazardous',
    color: '#FB7185',
    message: 'Stay indoors if possible',
  };
};

const getUVInfo = value => {
  const n = toNumberOrNull(value);
  if (n === null)
    return {
      value: '--',
      label: 'Unavailable',
      color: '#94A3B8',
      message: 'UV data not available',
    };
  const uv = Number(n.toFixed(1));
  if (uv <= 2)
    return {
      value: uv,
      label: 'Low',
      color: '#4ADE80',
      message: 'Safe for normal outdoor time',
    };
  if (uv <= 5)
    return {
      value: uv,
      label: 'Moderate',
      color: '#FACC15',
      message: 'Use sunscreen if outside longer',
    };
  if (uv <= 7)
    return {
      value: uv,
      label: 'High',
      color: '#FB923C',
      message: 'Use sunscreen and sunglasses',
    };
  if (uv <= 10)
    return {
      value: uv,
      label: 'Very High',
      color: '#F87171',
      message: 'Avoid direct afternoon sun',
    };
  return {
    value: uv,
    label: 'Extreme',
    color: '#FB7185',
    message: 'Stay shaded as much as possible',
  };
};

const toClockTime = ts =>
  new Date(ts).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
const formatTime = dt =>
  dt
    ? new Date(dt).toLocaleTimeString('en-IN', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    : '--';
const formatHour = dt => {
  let h = new Date(dt).getHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}${ap}`;
};

const getNearestHourlyIndex = times => {
  if (!Array.isArray(times) || !times.length) return 0;
  const now = Date.now();
  let bestIndex = 0,
    bestDiff = Infinity;
  times.forEach((time, index) => {
    const diff = Math.abs(new Date(time).getTime() - now);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = index;
    }
  });
  return bestIndex;
};

const cleanLocationName = value => {
  if (!value || typeof value !== 'string') return null;
  const cleaned = value.replace(/\s+/g, ' ').trim();
  const lowered = cleaned.toLowerCase();
  if (!cleaned || ['unknown', 'null', 'undefined'].includes(lowered))
    return null;
  return cleaned;
};

const pickFirstLocationName = (...values) => {
  for (const value of values) {
    const cleaned = cleanLocationName(value);
    if (cleaned) return cleaned;
  }
  return null;
};

// ─── RAIN LABELS ──────────────────────────────────────────────────────────────
const buildRainStopLabel = stopTime => {
  if (!stopTime) return 'Chance of rain later';
  const diffMs = Number(stopTime) - Date.now();
  if (diffMs <= 0) return 'Stops soon';
  const minutes = Math.max(1, Math.round(diffMs / 60000));
  if (minutes <= 5) return `Stops in ~${minutes} min`;
  if (minutes < 60)
    return `Stops in ~${Math.max(5, Math.round(minutes / 5) * 5)} min`;
  const hours = Math.round(minutes / 60);
  if (hours <= 1) return 'Stops in ~1 hr';
  if (hours <= 3) return `Stops in ~${hours} hrs`;
  return `Stops around ${toClockTime(Number(stopTime))}`;
};

const buildRainStopNotificationLabel = stopTime => {
  if (!stopTime) return 'Eni Barsa Borondhu Ippundu';
  const diffMs = Number(stopTime) - Date.now();
  if (diffMs <= 0) return 'Bega Untundu';
  const minutes = Math.max(1, Math.round(diffMs / 60000));
  if (minutes <= 5) return `~${minutes} min d Untundu`;
  if (minutes < 60)
    return `~${Math.max(5, Math.round(minutes / 5) * 5)} min d Untundu`;
  const hours = Math.round(minutes / 60);
  if (hours <= 1) return '~1 gante d Untundu';
  if (hours <= 3) return `~${hours} gante d Untundu`;
  return `${toClockTime(Number(stopTime))} ganteg Untundu`;
};

// ─── RAIN STOP SLOT ───────────────────────────────────────────────────────────
const findRainStopSlot = (hourlyList, thresholds) => {
  if (!Array.isArray(hourlyList) || !hourlyList.length) return null;
  return (
    hourlyList.find(item => {
      if (!item) return false;
      return (
        Number(item.rainChance ?? 0) < thresholds.RAIN_STOP_THRESHOLD &&
        Number(item.precipMm ?? 0) < thresholds.MIN_REAL_RAIN_MM
      );
    }) || null
  );
};

// ─── RAIN PREDICTION ──────────────────────────────────────────────────────────
const predictRain = async (
  hourlyList,
  currentActualCode,
  currentPrecipitation,
  dailyPrecipSum = 0,
  windDirection = -1,
  humidity = 0,
  currentTemp = 0,
) => {
  if (!hourlyList?.length) return { state: 'no_rain' };

  const thresholds = getThresholds();
  const windConfidence = getWindRainConfidence(windDirection);
  const currentMm = Number(currentPrecipitation || 0);
  const actuallyRaining = isActualRainNow(
    currentActualCode,
    currentMm,
    thresholds,
  );

  if (actuallyRaining) {
    const futureOnly = hourlyList.filter(
      item => new Date(item.time).getTime() > Date.now() + 5 * 60 * 1000,
    );
    const stopSlot = findRainStopSlot(futureOnly, thresholds);
    const stopTime = stopSlot ? new Date(stopSlot.time).getTime() : null;
    await AsyncStorage.setItem(LAST_RAIN_TIME_KEY, String(Date.now()));
    return {
      state: 'raining_now',
      stopTime,
      stopTimeLabel: buildRainStopLabel(stopTime),
    };
  }

  const now = Date.now();
  const firstRainSlot = hourlyList.find(item => {
    if (!item) return false;
    if (new Date(item.time).getTime() <= now + 5 * 60 * 1000) return false;
    return isFutureRainStrong(
      item,
      thresholds,
      dailyPrecipSum,
      windConfidence,
      humidity,
    );
  });

  if (!firstRainSlot) return { state: 'no_rain' };

  const startIndex = hourlyList.indexOf(firstRainSlot);

  const stopAfterRain = hourlyList.find((item, index) => {
    if (!item || index <= startIndex) return false;
    return (
      Number(item.rainChance ?? 0) < thresholds.RAIN_STOP_THRESHOLD &&
      Number(item.precipMm ?? 0) < thresholds.MIN_REAL_RAIN_MM
    );
  });

  const rainWindow = hourlyList.slice(
    startIndex,
    stopAfterRain ? hourlyList.indexOf(stopAfterRain) : undefined,
  );

  const maxChance = rainWindow.length
    ? Math.max(...rainWindow.map(item => Number(item?.rainChance ?? 0)))
    : Number(firstRainSlot?.rainChance ?? 0);

  let displayChance = Math.round(maxChance * windConfidence);

  // PHASE 1: Apply all boosters
  const lastTemp = await AsyncStorage.getItem(TEMP_CACHE_KEY);
  const tempDropBoost = getTempDropBoost(currentTemp, lastTemp);
  const hour = new Date(firstRainSlot.time).getHours();
  const timeBoost = getTimeOfDayBoost(hour);
  const recentRainBoost = await getRecentRainBoost();

  displayChance = Math.round(
    displayChance * tempDropBoost * timeBoost * recentRainBoost,
  );
  displayChance = Math.min(displayChance, 100); // Cap at 100%

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
    chance: displayChance,
    expectedMm: Number(firstRainSlot?.precipMm ?? 0),
    windConfidence,
    boosts: { tempDropBoost, timeBoost, recentRainBoost },
  };
};

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
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

let lastNotificationState = null;

const syncRainNotification = async weatherPayload => {
  try {
    if (!weatherPayload?.hourlyList?.length) {
      await cancelRainNotification();
      lastNotificationState = null;
      return;
    }

    const monsoon = isMonsoonSeason();
    const humidity = weatherPayload.current?.relative_humidity_2m ?? 0;
    const currentTemp = weatherPayload.current?.temperature_2m ?? 0;

    const rainPrediction = await predictRain(
      weatherPayload.hourlyList,
      weatherPayload.current?.weather_code,
      weatherPayload.currentRain,
      weatherPayload.daily?.precipSum ?? 0,
      weatherPayload.current?.wind_direction_10m ?? -1,
      humidity,
      currentTemp,
    );

    // PHASE 2: Compare with WeatherAPI if available
    let finalChance = rainPrediction.chance;
    let apiConfidence = 'om_only';

    if (WEATHERAPI_KEY && WEATHERAPI_KEY !== 'YOUR_WEATHERAPI_KEY_HERE') {
      const waData = await getWeatherApiData(
        weatherPayload.latitude,
        weatherPayload.longitude,
      );
      if (waData?.forecast?.forecastday?.[0]?.hour) {
        const waHour = waData.forecast.forecastday[0].hour.find(
          h =>
            Math.abs(new Date(h.time).getTime() - rainPrediction.startTime) <
            60 * 60 * 1000,
        );
        if (waHour) {
          const waChance = waHour.chance_of_rain || 0;
          const comparison = compareApis(rainPrediction.chance, waChance);
          finalChance = comparison.finalChance;
          apiConfidence = comparison.confidence;
        }
      }
    }

    const stateKey = `${rainPrediction.state}-${rainPrediction.stopTime ?? 0}-${
      rainPrediction.startTime ?? 0
    }`;
    if (lastNotificationState === stateKey) return;
    lastNotificationState = stateKey;

    if (rainPrediction.state === 'no_rain') {
      await cancelRainNotification();
      return;
    }

    const channelId = await createWeatherNotificationChannel();

    // ── RAINING NOW ─────────────────────────────────────────────────
    if (rainPrediction.state === 'raining_now') {
      // 🔒 Only alert for medium/heavy rain while it's active
      const currentRainMm = Number(weatherPayload.currentRain ?? 0);

      if (currentRainMm < MIN_NOTIFY_RAIN_MM) {
        await cancelRainNotification();
        return;
      }

      const intensityNow = getRainIntensityLabel(
        finalChance || 100,
        currentRainMm,
        monsoon,
      );

      const intensityNowEn = intensityNow.en.toLowerCase();

      if (
        intensityNowEn !== 'moderate rain' &&
        intensityNowEn !== 'heavy rain'
      ) {
        await cancelRainNotification();
        return;
      }

      await AsyncStorage.setItem(LAST_RAIN_TIME_KEY, String(Date.now()));
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

      // PHASE 3: Record actual rain for ML
      await recordPrediction(100, true);
      return;
    }

    // ── RAIN COMING ──────────────────────────────────────────────────
    if (rainPrediction.state === 'rain_coming' && rainPrediction.startTime) {
      const intensity = getRainIntensityLabel(
        finalChance,
        rainPrediction.expectedMm,
        monsoon,
      );
      const intensityEn = intensity.en.toLowerCase();

      if (intensityEn !== 'moderate rain' && intensityEn !== 'heavy rain') {
        await cancelRainNotification();
        return;
      }
      const windNote =
        rainPrediction.windConfidence < 0.8 ? ' (purva gali)' : '';
      const apiNote = apiConfidence !== 'om_only' ? ` [${apiConfidence}]` : '';

      const bodyText = rainPrediction.stopTime
        ? `${finalChance}% ${intensity.tulu} ${
            rainPrediction.startTimeLabel
          }${windNote}, ${toClockTime(
            rainPrediction.stopTime,
          )} g kammi avu${apiNote}`
        : `${finalChance}% ${intensity.tulu} ${rainPrediction.startTimeLabel}${windNote}${apiNote}`;

      const notifyAt = rainPrediction.startTime - 30 * 60 * 1000;
      const now = Date.now();

      if (notifyAt <= now) {
        if (rainPrediction.startTime > now) {
          await notifee.displayNotification({
            id: RAIN_ALERT_NOTIFICATION_ID,
            title: 'Barsa Jagrathe 🌧️',
            body: bodyText,
            android: {
              channelId,
              color: '#67E8F9',
              pressAction: { id: 'default' },
            },
          });
        }
        return;
      }

      await notifee.createTriggerNotification(
        {
          id: RAIN_ALERT_NOTIFICATION_ID,
          title: 'Barsa Jagrathe 🌧️',
          body: bodyText,
          android: {
            channelId,
            color: '#67E8F9',
            pressAction: { id: 'default' },
          },
        },
        { type: TriggerType.TIMESTAMP, timestamp: notifyAt },
      );
    }
  } catch (err) {
    console.error('Notification error:', err);
  }
};

// ─── LOCATION ─────────────────────────────────────────────────────────────────
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

// ─── GEOCODING ────────────────────────────────────────────────────────────────
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
  const smallPlace = [...informative, ...administrative].find(item => {
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
    const n = await getOpenStreetMapLocationName(lat, lon);
    if (n) return n;
  } catch {}
  try {
    const n = await getBigDataLocationName(lat, lon);
    if (n) return n;
  } catch {}
  return 'Your Location';
};

// ─── WEATHER API ──────────────────────────────────────────────────────────────
const getWeatherData = async (lat, lon) => {
  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,precipitation,rain,is_day,cloud_cover` +
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
      `&hourly=us_aqi,pm2_5,pm10,uv_index&forecast_days=1&timezone=auto`,
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

// ─── DATA BUILDERS ────────────────────────────────────────────────────────────
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

// ─── CACHE ────────────────────────────────────────────────────────────────────
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
      [TEMP_CACHE_KEY, String(payload.current?.temperature_2m ?? 0)],
    ]);
  } catch {}
};

const readCache = async () => {
  try {
    const v = await AsyncStorage.getItem(WEATHER_CACHE_KEY);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
};
const readCoords = async () => {
  try {
    const v = await AsyncStorage.getItem(COORDS_CACHE_KEY);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
};

// ─── COMPONENTS ───────────────────────────────────────────────────────────────

const RainTimerCard = ({ prediction, accent, thresholds }) => {
  if (prediction.state === 'no_rain') return null;
  const monsoon = isMonsoonSeason();
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
              {prediction.stopTime ? 'Clears up' : 'Continuing'}
            </Text>
            <Text
              style={[st.rainTimerClock, st.rainTimerClockSmall]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
            >
              {prediction.stopTimeLabel || 'Rain active'}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  const intensity = getRainIntensityLabel(
    prediction.chance,
    prediction.expectedMm,
    monsoon,
  );
  const showWind = prediction.windConfidence < 0.8;

  return (
    <View style={[st.rainCard, { borderColor: border, backgroundColor: bg }]}>
      <View style={st.rainCardRow}>
        <View style={st.rainTimerBlock}>
          <Text style={st.rainTimerIcon}>🕐</Text>
          <Text style={st.rainTimerLabel}>Rain coming</Text>
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
            {prediction.stopTime ? 'Clears up' : 'Duration'}
          </Text>
          <Text
            style={[st.rainTimerClock, st.rainTimerClockSmall]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.78}
          >
            {prediction.stopTime
              ? prediction.stopTimeLabel
              : `~${Number(prediction.expectedMm ?? 0).toFixed(1)} mm`}
          </Text>
        </View>
      </View>

      {prediction.chance > 0 && (
        <Text style={st.rainChanceLabel}>
          {prediction.chance}% {intensity.en}
          {showWind ? ' (east wind)' : ''}
          {prediction.boosts ? ` [boosted]` : ''}
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

// ─── MAIN SCREEN ──────────────────────────────────────────────────────────────
export default function Weather() {
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [weather, setWeather] = useState(null);
  const [error, setError] = useState('');
  const [permissionError, setPermissionError] = useState(false);
  const [usingCached, setUsingCached] = useState(false);
  const [notice, setNotice] = useState('');
  const [mlReport, setMlReport] = useState(null);

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

  const thresholds = useMemo(() => getThresholds(), []);

  const currentCode = weather?.current?.weather_code ?? 3;
  const isDay = weather?.current?.is_day !== 0;

  const smartThemeInfo = weather?.current
    ? getSmartWeatherInfo({
        code: weather.current.weather_code,
        rainAmount: weather.currentRain,
        cloudCover: weather.current.cloud_cover,
        isDay: weather.current.is_day,
        thresholds,
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
    if (!weather?.hourlyList?.length || !weather?.current)
      return { state: 'no_rain' };
    return weather._prediction;
  }, [weather]);

  const currentInfo = useMemo(() => {
    if (!weather?.current) return getWeatherInfo(3);
    return getSmartWeatherInfo({
      code: weather.current.weather_code,
      rainAmount: weather.currentRain,
      cloudCover: weather.current.cloud_cover,
      isDay: weather.current.is_day,
      thresholds,
    });
  }, [weather, thresholds]);

  const aqiInfo = useMemo(
    () => getAQIInfo(weather?.airQuality?.aqi),
    [weather],
  );
  const uvInfo = useMemo(
    () =>
      getUVInfo(
        weather?.airQuality?.uvIndex ?? weather?.daily?.uvIndexMax ?? null,
      ),
    [weather],
  );

  const isRainingNow = prediction?.state === 'raining_now';
  const isHeavyRain =
    Number(weather?.currentRain ?? 0) >= thresholds.MIN_REAL_RAIN_MM * 2;
  const monsoon = isMonsoonSeason();

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
      if (isRefresh) setRefreshing(true);
      else if (!silent && !weatherRef.current) setLoading(true);

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

      let position = null,
        cachedCoords = null;
      try {
        position = await getCurrentLocation(isRefresh);
      } catch {
        cachedCoords = await readCoords();
      }

      const latitude = position?.coords?.latitude ?? cachedCoords?.latitude;
      const longitude = position?.coords?.longitude ?? cachedCoords?.longitude;
      if (!latitude || !longitude) throw new Error('Unable to find location.');

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

      // Calculate prediction with all boosters
      const pred = await predictRain(
        payload.hourlyList,
        payload.current.weather_code,
        payload.currentRain,
        payload.daily?.precipSum ?? 0,
        payload.current?.wind_direction_10m ?? -1,
        payload.current?.relative_humidity_2m ?? 0,
        payload.current?.temperature_2m ?? 0,
      );
      payload._prediction = pred;

      setWeather(payload);
      setUsingCached(false);
      setNotice('');
      await saveCache(payload);
      await syncRainNotification(payload);

      // Get ML report if available
      const report = await getMLReport();
      if (report) setMlReport(report);

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
      const showedRain = cached.currentRain >= getThresholds().MIN_REAL_RAIN_MM;
      if (cacheIsStale && showedRain) {
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
      const prev = appStateRef.current;
      appStateRef.current = nextState;
      if (prev.match(/inactive|background/) && nextState === 'active') {
        if (
          Date.now() - lastFetchRef.current > MIN_REFRESH_GAP_MS &&
          isMountedRef.current
        ) {
          loadWeather({ silent: true });
        }
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
  const windDir = Math.round(weather?.current?.wind_direction_10m ?? 0);
  const rainChance = weather?.daily?.rainChanceMax ?? 0;
  const rainMm = Number(weather?.daily?.precipSum ?? 0);

  const windCardinal = (() => {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(windDir / 45) % 8];
  })();

  return (
    <View style={[st.screen, { backgroundColor: theme.bg }]}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />
      <SkyBackground weatherArt={currentInfo.art} isDay={isDay} />
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
              <Text style={st.appTitle}>
                NAMMA WEATHER{monsoon ? ' 🌧️' : ''}
              </Text>
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
          {mlReport && (
            <View style={st.noticeBox}>
              <Text style={st.noticeText}>
                📊 ML: {Object.keys(mlReport).length} predictions tracked
              </Text>
            </View>
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
            <RainTimerCard
              prediction={prediction}
              accent={theme.accent}
              thresholds={thresholds}
            />
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
              sub={`km/h ${windCardinal}`}
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
                <Text style={st.sectionSub}>Daily details</Text>
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
              const info = getHourlyWeatherInfo(item, thresholds);
              return (
                <View
                  key={`${item.time}-${item.code}`}
                  style={[
                    st.hourCard,
                    {
                      borderColor: theme.accent + '30',
                      backgroundColor: 'rgba(30,41,59,0.32)',
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
            <Text style={st.sectionSub}>Health & safety</Text>
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
