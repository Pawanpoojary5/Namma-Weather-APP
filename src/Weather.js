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
import { st, TOKENS } from './WeatherStyle';
import {
  SkyBackground,
  RainSystem,
  WeatherArt,
  getAccent,
} from './WeatherAnimations';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const WEATHER_CACHE_KEY = 'wx:weather_v2';
const COORDS_CACHE_KEY = 'wx:coords_v2';
const RAIN_START_TIME_KEY = 'wx:rain_start_time';
const TEMP_CACHE_KEY = 'wx:last_temp';
const LAST_RAIN_TIME_KEY = 'wx:last_rain_time';
const NOTIFICATION_ID = 'rowa-weather-rain-alert';
const CHANNEL_ID = 'rowa-weather-alerts';
const MIN_REFRESH_GAP_MS = 10 * 60 * 1000;
const MIN_NOTIFY_RAIN_MM = 4.0;

// ─── SEASON DETECTION ─────────────────────────────────────────────────────────
const isMonsoon = () => {
  const m = new Date().getMonth() + 1;
  return m >= 6 && m <= 9;
};

// ─── THRESHOLDS ───────────────────────────────────────────────────────────────
// Tuned for coastal Karnataka / India context
const getThresholds = () => {
  const monsoon = isMonsoon();
  return {
    MIN_REAL_RAIN_MM: monsoon ? 1.2 : 3.0,
    FUTURE_RAIN_MIN_MM: monsoon ? 0.3 : 0.7,
    FUTURE_RAIN_MIN_CHANCE: monsoon ? 45 : 60,
    HEAVY_DAY_MM: monsoon ? 5 : 8,
    HEAVY_DAY_SLOT_MM: monsoon ? 0.3 : 0.7,
    THUNDER_MIN_RAIN_MM: monsoon ? 0.8 : 1.8,
    RAIN_STOP_THRESHOLD: monsoon ? 22 : 18,
    CLOUD_PARTLY: 65,
    CLOUD_FULL: 82,
  };
};

// ─── CONFIDENCE BOOSTERS ──────────────────────────────────────────────────────
const humidityBoost = h => {
  const v = Number(h ?? 0);
  if (v >= 88) return 1.28;
  if (v >= 78) return 1.18;
  if (v >= 68) return 1.08;
  return 1.0;
};

const tempDropBoost = (cur, last) => {
  if (!last) return 1.0;
  const drop = Number(last) - Number(cur);
  if (drop > 2.5) return 1.32;
  if (drop > 1.5) return 1.2;
  if (drop > 0.8) return 1.1;
  return 1.0;
};

const timeOfDayBoost = hour => {
  if (hour >= 13 && hour <= 16) return 1.18; // Afternoon peak
  if (hour >= 17 && hour <= 19) return 1.12; // Evening secondary
  if (hour >= 10 && hour <= 12) return 1.06;
  if (hour >= 6 && hour <= 9) return 0.88;
  return 1.0;
};

const recentRainBoost = async () => {
  try {
    const ts = await AsyncStorage.getItem(LAST_RAIN_TIME_KEY);
    if (!ts) return 1.0;
    const hrs = (Date.now() - Number(ts)) / 3600000;
    if (hrs < 3) return 1.28;
    if (hrs < 6) return 1.16;
    if (hrs < 12) return 1.06;
    return 1.0;
  } catch {
    return 1.0;
  }
};

const windRainFactor = wd => {
  const d = Number(wd ?? -1);
  if (d < 0) return 1.0;
  // SW/W/NW winds bring rain for coastal Karnataka
  if ((d >= 180 && d <= 315) || d <= 30 || d >= 330) return 1.0;
  if (d >= 45 && d <= 150) return 0.62;
  return 0.88;
};

// ─── WMO CODE MAP — ALL ENGLISH ───────────────────────────────────────────────
const WMO = {
  0: { label: 'Clear Sky', emoji: '☀️', art: 'sunny' },
  1: { label: 'Mostly Clear', emoji: '🌤️', art: 'partlyCloudy' },
  2: { label: 'Partly Cloudy', emoji: '⛅', art: 'partlyCloudy' },
  3: { label: 'Overcast', emoji: '☁️', art: 'cloudy' },
  45: { label: 'Foggy', emoji: '🌫️', art: 'fog' },
  48: { label: 'Freezing Fog', emoji: '🌫️', art: 'fog' },
  51: { label: 'Light Drizzle', emoji: '🌦️', art: 'rain' },
  53: { label: 'Drizzle', emoji: '🌦️', art: 'rain' },
  55: { label: 'Heavy Drizzle', emoji: '🌧️', art: 'rain' },
  56: { label: 'Freezing Drizzle', emoji: '🌧️', art: 'rain' },
  57: { label: 'Heavy Frz. Drizzle', emoji: '🌧️', art: 'rain' },
  61: { label: 'Light Rain', emoji: '🌧️', art: 'rain' },
  63: { label: 'Moderate Rain', emoji: '🌧️', art: 'rain' },
  65: { label: 'Heavy Rain', emoji: '🌧️', art: 'rain' },
  66: { label: 'Freezing Rain', emoji: '🌧️', art: 'rain' },
  67: { label: 'Heavy Frz. Rain', emoji: '🌧️', art: 'rain' },
  71: { label: 'Light Snow', emoji: '🌨️', art: 'snow' },
  73: { label: 'Snow', emoji: '🌨️', art: 'snow' },
  75: { label: 'Heavy Snow', emoji: '❄️', art: 'snow' },
  77: { label: 'Snow Grains', emoji: '❄️', art: 'snow' },
  80: { label: 'Rain Showers', emoji: '🌦️', art: 'rain' },
  81: { label: 'Rain Showers', emoji: '🌦️', art: 'rain' },
  82: { label: 'Violent Showers', emoji: '⛈️', art: 'storm' },
  85: { label: 'Snow Showers', emoji: '🌨️', art: 'snow' },
  86: { label: 'Heavy Snow Showers', emoji: '🌨️', art: 'snow' },
  95: { label: 'Thunderstorm', emoji: '⛈️', art: 'storm' },
  96: { label: 'Thunderstorm + Hail', emoji: '⛈️', art: 'storm' },
  99: { label: 'Severe Thunderstorm', emoji: '⛈️', art: 'storm' },
};

const RAIN_CODES = [
  51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 85, 86, 95, 96, 99,
];
const THUNDER_CODES = [82, 95, 96, 99];

const isRainCode = c => RAIN_CODES.includes(Number(c));
const isThunderCode = c => THUNDER_CODES.includes(Number(c));
const getWMO = c =>
  WMO[Number(c)] || { label: 'Cloudy', emoji: '☁️', art: 'cloudy' };

// ─── SMART CONDITION ─────────────────────────────────────────────────────────
// KEY FIX: don't just trust the WMO code — cross-check precipitation amount.
// This is why the old app showed "Cloudy" when it was actually raining.
const getSmartCondition = ({ code, rainMm, cloudCover, isDay, thresholds }) => {
  const T = thresholds || getThresholds();
  const wc = Number(code);
  const mm = Number(rainMm || 0);
  const cc = Number(cloudCover || 0);
  const day = Number(isDay) === 1;

  // Thunder wins if precipitation confirms it
  if (isThunderCode(wc) && mm >= T.THUNDER_MIN_RAIN_MM) return getWMO(wc);

  // Rain wins if precipitation is actually happening
  if (isRainCode(wc) && mm >= T.MIN_REAL_RAIN_MM) return getWMO(wc);

  // If code says rain but no actual precipitation → trust cloud cover instead
  // This fixes the "shows cloudy but it's raining" bug (wrong in reverse too)
  if (!day) {
    if (cc >= T.CLOUD_FULL) return WMO[3];
    if (cc >= T.CLOUD_PARTLY) return WMO[2];
    return { label: 'Clear Night', emoji: '🌙', art: 'clearNight' };
  }
  if (cc >= T.CLOUD_FULL) return WMO[3];
  if (cc >= T.CLOUD_PARTLY) return WMO[2];
  return WMO[0]; // Clear sky
};

const getHourlyCondition = (item, thresholds) => {
  if (!item) return WMO[3];
  const T = thresholds || getThresholds();
  const code = Number(item?.code);
  const mm = Number(item?.precipMm ?? 0);
  const chance = Number(item?.rainChance ?? 0);
  const hour = new Date(item.time).getHours();
  const isNight = hour >= 19 || hour < 6;

  if (isThunderCode(code) && mm >= T.THUNDER_MIN_RAIN_MM) return getWMO(code);

  const rainLikely =
    (isRainCode(code) && mm >= T.MIN_REAL_RAIN_MM) ||
    (chance >= 80 && isRainCode(code));

  if (rainLikely)
    return isNight
      ? { label: 'Rain', emoji: '🌧️', art: 'rain' }
      : { label: 'Rain Showers', emoji: '🌦️', art: 'rain' };

  if (isNight) {
    if (chance >= 65) return WMO[3];
    return { label: 'Clear Night', emoji: '🌙', art: 'clearNight' };
  }
  if (chance >= 65) return WMO[2];
  return WMO[0];
};

// ─── RAIN INTENSITY LABEL ─────────────────────────────────────────────────────
const rainIntensityLabel = (chance, mm) => {
  const c = Math.round(chance);
  if (mm >= 7.5 || c >= 90) return 'Heavy Rain';
  if (mm >= 3.5 || c >= 75) return 'Moderate Rain';
  if (mm >= 1.5 || c >= 60) return 'Light Rain';
  return 'Drizzle';
};

// ─── RAIN CHECKS ──────────────────────────────────────────────────────────────
const isActuallyRaining = (code, mm, T) =>
  isRainCode(Number(code)) && Number(mm || 0) >= T.MIN_REAL_RAIN_MM;

const isRainSlotStrong = (item, T, dailySum, windFactor, humidity) => {
  const boostedChance =
    Number(item?.rainChance ?? 0) * windFactor * humidityBoost(humidity);
  const mm = Number(item?.precipMm ?? 0);
  const mmThresh =
    Number(dailySum) >= T.HEAVY_DAY_MM
      ? T.HEAVY_DAY_SLOT_MM
      : T.FUTURE_RAIN_MIN_MM;

  // If chance is very high (>=80%), show rain timer even if mm is tiny
  // Open-Meteo spreads daily mm thinly across hours during monsoon
  if (boostedChance >= 80) return true;

  // Otherwise require both chance AND mm thresholds
  return boostedChance >= T.FUTURE_RAIN_MIN_CHANCE && mm >= mmThresh;
};

// ─── RAIN TIMING LABELS ───────────────────────────────────────────────────────
const toClockTime = ts =>
  new Date(ts).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

const rainStopLabel = stopTime => {
  if (!stopTime) return 'Rain continues later';
  const diff = Number(stopTime) - Date.now();
  if (diff <= 0) return 'Clears up soon';
  const mins = Math.max(1, Math.round(diff / 60000));
  if (mins <= 5) return `Clears in ~${mins} min`;
  if (mins < 60) return `Clears in ~${Math.round(mins / 5) * 5} min`;
  const hrs = Math.round(mins / 60);
  if (hrs <= 1) return 'Clears in ~1 hr';
  if (hrs <= 3) return `Clears in ~${hrs} hrs`;
  return `Clears around ${toClockTime(Number(stopTime))}`;
};

// ─── RAIN PREDICTION ENGINE ───────────────────────────────────────────────────
const predictRain = async ({
  hourlyList,
  currentCode,
  currentMm,
  dailyPrecipSum = 0,
  windDir = -1,
  humidity = 0,
  currentTemp = 0,
}) => {
  if (!hourlyList?.length) return { state: 'no_rain' };

  const T = getThresholds();
  const windFactor = windRainFactor(windDir);
  const actualRain = isActuallyRaining(currentCode, currentMm, T);

  if (actualRain) {
    const future = hourlyList.filter(
      item => new Date(item.time).getTime() > Date.now() + 5 * 60000,
    );
    const stopSlot = future.find(
      item =>
        Number(item.rainChance ?? 0) < T.RAIN_STOP_THRESHOLD &&
        Number(item.precipMm ?? 0) < T.MIN_REAL_RAIN_MM,
    );
    const stopTime = stopSlot ? new Date(stopSlot.time).getTime() : null;
    await AsyncStorage.setItem(LAST_RAIN_TIME_KEY, String(Date.now()));
    return {
      state: 'raining_now',
      stopTime,
      stopTimeLabel: rainStopLabel(stopTime),
    };
  }

  const now = Date.now();
  const firstRainSlot = hourlyList.find(item => {
    if (!item || new Date(item.time).getTime() <= now + 5 * 60000) return false;
    return isRainSlotStrong(item, T, dailyPrecipSum, windFactor, humidity);
  });

  if (!firstRainSlot) return { state: 'no_rain' };

  const startIdx = hourlyList.indexOf(firstRainSlot);
  const stopSlot = hourlyList.find(
    (item, idx) =>
      idx > startIdx &&
      Number(item.rainChance ?? 0) < T.RAIN_STOP_THRESHOLD &&
      Number(item.precipMm ?? 0) < T.MIN_REAL_RAIN_MM,
  );
  const window = hourlyList.slice(
    startIdx,
    stopSlot ? hourlyList.indexOf(stopSlot) : undefined,
  );
  const maxChance = window.length
    ? Math.max(...window.map(i => Number(i?.rainChance ?? 0)))
    : Number(firstRainSlot?.rainChance ?? 0);

  // Apply all boosters
  const lastTemp = await AsyncStorage.getItem(TEMP_CACHE_KEY).catch(() => null);
  const hour = new Date(firstRainSlot.time).getHours();

  let displayChance = Math.round(
    maxChance *
      windFactor *
      tempDropBoost(currentTemp, lastTemp) *
      timeOfDayBoost(hour) *
      (await recentRainBoost()),
  );
  displayChance = Math.min(displayChance, 98);

  return {
    state: 'rain_coming',
    startTime: new Date(firstRainSlot.time).getTime(),
    startTimeLabel: toClockTime(new Date(firstRainSlot.time).getTime()),
    stopTime: stopSlot ? new Date(stopSlot.time).getTime() : null,
    stopTimeLabel: rainStopLabel(
      stopSlot ? new Date(stopSlot.time).getTime() : null,
    ),
    chance: displayChance,
    expectedMm: Number(firstRainSlot?.precipMm ?? 0),
    windConfidence: windFactor,
  };
};

// ─── DUAL-API CROSS-REFERENCE ─────────────────────────────────────────────────
const fetchWeatherAPI = async (lat, lon) => {
  try {
    if (!WEATHERAPI_KEY || WEATHERAPI_KEY === 'YOUR_WEATHERAPI_KEY_HERE')
      return null;
    const r = await fetch(
      `https://api.weatherapi.com/v1/forecast.json?key=${WEATHERAPI_KEY}&q=${lat},${lon}&days=2&aqi=yes`,
    );
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
};

const crossReferenceChance = (omChance, waChance) => {
  if (!waChance) return { chance: omChance, confidence: 'single_source' };
  const diff = Math.abs(omChance - waChance);
  if (diff < 12)
    return {
      chance: Math.round((omChance + waChance) / 2),
      confidence: 'both_agree',
    };
  if (diff < 25)
    return {
      chance: Math.round((omChance + waChance) / 2),
      confidence: 'slight_diff',
    };
  return { chance: Math.max(omChance, waChance), confidence: 'major_diff' };
};

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
// FIX: Properly request permission BEFORE creating channel, handle Android 13+
const setupNotificationChannel = async () => {
  try {
    // Always request permission first
    const settings = await notifee.requestPermission();
    const granted = settings?.authorizationStatus >= 1;
    if (!granted) return null;

    if (Platform.OS === 'android') {
      await notifee.createChannel({
        id: CHANNEL_ID,
        name: 'Rain Alerts',
        importance: AndroidImportance.HIGH,
        vibration: true,
        sound: 'default',
      });
    }
    return CHANNEL_ID;
  } catch (err) {
    console.error('[Notif] Channel setup error:', err);
    return null;
  }
};

const cancelRainNotif = async () => {
  try {
    await notifee.cancelNotification(NOTIFICATION_ID);
    if (typeof notifee.cancelTriggerNotification === 'function') {
      await notifee.cancelTriggerNotification(NOTIFICATION_ID);
    }
    await AsyncStorage.removeItem(RAIN_START_TIME_KEY);
  } catch {}
};

let _lastNotifKey = null;

const syncNotification = async payload => {
  try {
    if (!payload?.hourlyList?.length) {
      await cancelRainNotif();
      _lastNotifKey = null;
      return;
    }

    const pred = await predictRain({
      hourlyList: payload.hourlyList,
      currentCode: payload.current?.weather_code,
      currentMm: payload.currentRain,
      dailyPrecipSum: payload.daily?.precipSum ?? 0,
      windDir: payload.current?.wind_direction_10m ?? -1,
      humidity: payload.current?.relative_humidity_2m ?? 0,
      currentTemp: payload.current?.temperature_2m ?? 0,
    });

    const stateKey = `${pred.state}-${pred.stopTime ?? 0}-${
      pred.startTime ?? 0
    }`;
    if (_lastNotifKey === stateKey) return;
    _lastNotifKey = stateKey;

    if (pred.state === 'no_rain') {
      await cancelRainNotif();
      return;
    }

    const channelId = await setupNotificationChannel();
    if (!channelId) return; // Permission denied — don't crash

    // ── RAINING NOW ──────────────────────────────────────────────────────────
    if (pred.state === 'raining_now') {
      const mm = Number(payload.currentRain ?? 0);
      if (mm < MIN_NOTIFY_RAIN_MM) {
        await cancelRainNotif();
        return;
      }

      const intensity = rainIntensityLabel(100, mm);
      if (intensity === 'Drizzle' || intensity === 'Light Rain') {
        await cancelRainNotif();
        return;
      }

      await notifee.displayNotification({
        id: NOTIFICATION_ID,
        title: `🌧️ ${intensity} now`,
        body: pred.stopTime
          ? `${rainStopLabel(pred.stopTime)} — ${mm.toFixed(1)} mm/hr`
          : `${mm.toFixed(1)} mm/hr — take your umbrella!`,
        android: {
          channelId,
          color: '#00D4FF',
          pressAction: { id: 'default' },
          importance: AndroidImportance.HIGH,
        },
        ios: { sound: 'default' },
      });
      return;
    }

    // ── RAIN COMING ──────────────────────────────────────────────────────────
    if (pred.state === 'rain_coming' && pred.startTime) {
      // Optional WeatherAPI cross-reference
      let finalChance = pred.chance;
      if (WEATHERAPI_KEY && WEATHERAPI_KEY !== 'YOUR_WEATHERAPI_KEY_HERE') {
        const waData = await fetchWeatherAPI(
          payload.latitude,
          payload.longitude,
        );
        const waHour = waData?.forecast?.forecastday?.[0]?.hour?.find(
          h => Math.abs(new Date(h.time).getTime() - pred.startTime) < 3600000,
        );
        if (waHour) {
          const result = crossReferenceChance(
            pred.chance,
            waHour.chance_of_rain || 0,
          );
          finalChance = result.chance;
        }
      }

      const intensity = rainIntensityLabel(finalChance, pred.expectedMm);
      if (intensity === 'Drizzle') {
        await cancelRainNotif();
        return;
      }

      const windNote =
        pred.windConfidence < 0.75 ? ' (east wind, lower chance)' : '';
      const body = pred.stopTime
        ? `${finalChance}% chance · ${pred.startTimeLabel} → ${toClockTime(
            pred.stopTime,
          )}${windNote}`
        : `${finalChance}% chance · Starting at ${pred.startTimeLabel}${windNote}`;

      const notifyAt = pred.startTime - 30 * 60000; // 30 min warning
      const now = Date.now();

      if (notifyAt <= now) {
        // Rain is imminent — send immediately
        if (pred.startTime > now) {
          await notifee.displayNotification({
            id: NOTIFICATION_ID,
            title: `🌧️ ${intensity} coming soon`,
            body,
            android: {
              channelId,
              color: '#00D4FF',
              pressAction: { id: 'default' },
              importance: AndroidImportance.HIGH,
            },
            ios: { sound: 'default' },
          });
        }
        return;
      }

      // Schedule 30-min advance warning
      await notifee.createTriggerNotification(
        {
          id: NOTIFICATION_ID,
          title: `🌧️ ${intensity} in 30 min`,
          body,
          android: {
            channelId,
            color: '#00D4FF',
            pressAction: { id: 'default' },
            importance: AndroidImportance.HIGH,
          },
          ios: { sound: 'default' },
        },
        { type: TriggerType.TIMESTAMP, timestamp: notifyAt },
      );
    }
  } catch (err) {
    console.error('[Notif] Sync error:', err);
  }
};

// ─── LOCATION ─────────────────────────────────────────────────────────────────
const requestLocationPerm = async () => {
  if (Platform.OS === 'ios') {
    const auth = await Geolocation.requestAuthorization('whenInUse');
    return auth === 'granted';
  }
  try {
    const fine = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
    const coarse = PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION;
    const fineOk = await PermissionsAndroid.check(fine);
    if (fineOk) return true;
    const result = await PermissionsAndroid.requestMultiple([fine, coarse]);
    return (
      result[fine] === PermissionsAndroid.RESULTS.GRANTED ||
      result[coarse] === PermissionsAndroid.RESULTS.GRANTED
    );
  } catch {
    return false;
  }
};

const fetchLocation = (isRefresh = false) =>
  new Promise((resolve, reject) =>
    Geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: isRefresh,
      timeout: isRefresh ? 6000 : 9000,
      maximumAge: isRefresh ? 0 : 10 * 60000,
      forceRequestLocation: true,
      showLocationDialog: true,
    }),
  );

// ─── GEOCODING ────────────────────────────────────────────────────────────────
const cleanName = v => {
  if (!v || typeof v !== 'string') return null;
  const c = v.replace(/\s+/g, ' ').trim();
  return ['unknown', 'null', 'undefined'].includes(c.toLowerCase()) ? null : c;
};

const pickName = (...vals) => {
  for (const v of vals) {
    const c = cleanName(v);
    if (c) return c;
  }
  return null;
};

const reverseGeocodeOSM = async (lat, lon) => {
  const r = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
    { headers: { 'User-Agent': 'RowaWeather/2.0' } },
  );
  if (!r.ok) throw new Error(`OSM ${r.status}`);
  const d = await r.json();
  const a = d.address || {};
  return pickName(
    a.village,
    a.hamlet,
    a.neighbourhood,
    a.suburb,
    a.locality,
    a.road,
    a.town,
    a.city,
    d.display_name?.split(',')?.[0],
  );
};

const reverseGeocodeBackup = async (lat, lon) => {
  const r = await fetch(
    `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
  );
  if (!r.ok) throw new Error(`BDC ${r.status}`);
  const d = await r.json();
  return pickName(d.locality, d.city, d.principalSubdivision);
};

const getCityName = async (lat, lon) => {
  try {
    const n = await reverseGeocodeOSM(lat, lon);
    if (n) return n;
  } catch {}
  try {
    const n = await reverseGeocodeBackup(lat, lon);
    if (n) return n;
  } catch {}
  return 'Your Location';
};

// ─── WEATHER FETCH ────────────────────────────────────────────────────────────
const fetchOpenMeteo = async (lat, lon) => {
  const r = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,precipitation,rain,is_day,cloud_cover` +
      `&hourly=temperature_2m,relative_humidity_2m,weather_code,precipitation_probability,precipitation` +
      `&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,precipitation_sum,uv_index_max` +
      `&forecast_days=2&timezone=auto`,
  );
  if (!r.ok) throw new Error(`Weather API ${r.status}`);
  const d = await r.json();
  if (d.error) throw new Error(d.reason || 'Weather API error');
  if (!d.current || !d.hourly) throw new Error('Incomplete weather data');
  return d;
};

const fetchAQI = async (lat, lon) => {
  const r = await fetch(
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
      `&hourly=us_aqi,pm2_5,pm10,uv_index&forecast_days=1&timezone=auto`,
  );
  if (!r.ok) throw new Error(`AQI API ${r.status}`);
  const d = await r.json();
  const h = d.hourly || {};
  const now = Date.now();
  let bestIdx = 0,
    bestDiff = Infinity;
  (h.time || []).forEach((t, i) => {
    const diff = Math.abs(new Date(t).getTime() - now);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  });
  const num = v => {
    const n = Number(v);
    return v == null || isNaN(n) ? null : n;
  };
  return {
    aqi: num(h.us_aqi?.[bestIdx]),
    pm25: num(h.pm2_5?.[bestIdx]),
    pm10: num(h.pm10?.[bestIdx]),
    uvIndex: num(h.uv_index?.[bestIdx]),
  };
};

// ─── DATA BUILDERS ────────────────────────────────────────────────────────────
const buildHourlyList = hourly => {
  const now = Date.now();
  const all = hourly.time.map((time, i) => ({
    time,
    timestamp: new Date(time).getTime(),
    label: (() => {
      const h = new Date(time).getHours();
      const ap = h >= 12 ? 'PM' : 'AM';
      return `${h % 12 || 12}${ap}`;
    })(),
    temp: Math.round(hourly.temperature_2m[i]),
    humidity: hourly.relative_humidity_2m?.[i] ?? 0,
    code: hourly.weather_code[i],
    rainChance: hourly.precipitation_probability?.[i] ?? 0,
    precipMm: hourly.precipitation?.[i] ?? 0,
  }));
  const upcoming = all.filter(item => item.timestamp >= now - 30 * 60000);
  return (upcoming.length ? upcoming : all).slice(0, 14);
};

const buildPayload = ({ cityName, weatherData, aqiData, lat, lon }) => {
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
    airQuality: aqiData || null,
    currentRain,
    latitude: lat,
    longitude: lon,
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
          lat: payload.latitude,
          lon: payload.longitude,
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

// ─── AQI / UV HELPERS ────────────────────────────────────────────────────────
const aqiInfo = val => {
  const n = Number(val);
  if (!val || isNaN(n))
    return {
      value: '--',
      label: 'N/A',
      color: TOKENS.textMuted,
      message: 'AQI unavailable',
      barPct: 0,
    };
  const v = Math.round(n);
  if (v <= 50)
    return {
      value: v,
      label: 'Good',
      color: TOKENS.green,
      message: 'Air quality is healthy',
      barPct: v / 300,
    };
  if (v <= 100)
    return {
      value: v,
      label: 'Moderate',
      color: TOKENS.amber,
      message: 'Acceptable air quality',
      barPct: v / 300,
    };
  if (v <= 150)
    return {
      value: v,
      label: 'Sensitive',
      color: '#FB923C',
      message: 'Sensitive groups be careful',
      barPct: v / 300,
    };
  if (v <= 200)
    return {
      value: v,
      label: 'Unhealthy',
      color: TOKENS.rose,
      message: 'Avoid prolonged outdoor activity',
      barPct: v / 300,
    };
  if (v <= 300)
    return {
      value: v,
      label: 'Very Unhealthy',
      color: TOKENS.violet,
      message: 'Stay indoors if possible',
      barPct: v / 300,
    };
  return {
    value: v,
    label: 'Hazardous',
    color: '#FF0000',
    message: 'Dangerous — stay inside',
    barPct: 1,
  };
};

const uvInfo = val => {
  const n = Number(val);
  if (!val || isNaN(n))
    return {
      value: '--',
      label: 'N/A',
      color: TOKENS.textMuted,
      message: 'UV data unavailable',
      barPct: 0,
    };
  const v = Number(n.toFixed(1));
  if (v <= 2)
    return {
      value: v,
      label: 'Low',
      color: TOKENS.green,
      message: 'Safe for outdoor activities',
      barPct: v / 12,
    };
  if (v <= 5)
    return {
      value: v,
      label: 'Moderate',
      color: TOKENS.amber,
      message: 'Use sunscreen if out for long',
      barPct: v / 12,
    };
  if (v <= 7)
    return {
      value: v,
      label: 'High',
      color: '#FB923C',
      message: 'Sunscreen + sunglasses needed',
      barPct: v / 12,
    };
  if (v <= 10)
    return {
      value: v,
      label: 'Very High',
      color: TOKENS.rose,
      message: 'Avoid afternoon sun',
      barPct: v / 12,
    };
  return {
    value: v,
    label: 'Extreme',
    color: '#FF0000',
    message: 'Stay in shade as much as possible',
    barPct: 1,
  };
};

const fmtNum = (val, digits = 0) => {
  const n = Number(val);
  return !val || isNaN(n) ? '--' : n.toFixed(digits);
};
const fmtTime = dt =>
  dt
    ? new Date(dt).toLocaleTimeString('en-IN', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    : '--';

// ─── COMPONENTS ───────────────────────────────────────────────────────────────

const RainTimerCard = ({ prediction, accent }) => {
  if (prediction?.state === 'no_rain') return null;
  const isNow = prediction?.state === 'raining_now';
  const borderCol = (accent || TOKENS.cyan) + '40';
  const bgCol = 'rgba(0, 20, 40, 0.55)';

  return (
    <View
      style={[
        st.rainTimerCard,
        { borderColor: borderCol, backgroundColor: bgCol },
      ]}
    >
      <View style={st.rainTimerInner}>
        {/* Left block */}
        <View style={st.rainTimerBlock}>
          <Text style={st.rainTimerEmoji}>{isNow ? '🌧️' : '🕐'}</Text>
          <Text style={st.rainTimerLabel}>{isNow ? 'RAINING' : 'STARTS'}</Text>
          <Text style={[st.rainTimerTime, { color: accent }]}>
            {isNow ? 'Now' : prediction?.startTimeLabel}
          </Text>
        </View>

        <View style={st.rainTimerDivider} />

        {/* Right block */}
        <View style={st.rainTimerBlock}>
          <Text style={st.rainTimerEmoji}>
            {prediction?.stopTime ? '🌤️' : '🌧️'}
          </Text>
          <Text style={st.rainTimerLabel}>CLEARS</Text>
          <Text
            style={[st.rainTimerSub, { color: TOKENS.textSecondary }]}
            numberOfLines={2}
          >
            {prediction?.stopTimeLabel || 'Ongoing'}
          </Text>
        </View>
      </View>

      {!isNow && prediction?.chance > 0 && (
        <View
          style={[
            st.rainChancePill,
            {
              borderColor: (accent || TOKENS.cyan) + '40',
              backgroundColor: (accent || TOKENS.cyan) + '14',
            },
          ]}
        >
          <Text style={[st.rainChanceText, { color: accent || TOKENS.cyan }]}>
            {prediction.chance}% ·{' '}
            {rainIntensityLabel(prediction.chance, prediction.expectedMm)}
            {prediction.windConfidence < 0.8 ? ' · East wind' : ''}
          </Text>
        </View>
      )}
    </View>
  );
};

const MetricCard = ({ emoji, label, value, sub, accent }) => (
  <View style={st.metricCard}>
    <View style={st.metricEmojiRow}>
      <Text style={st.metricEmoji}>{emoji}</Text>
    </View>
    <Text style={st.metricLabel}>{label}</Text>
    <Text style={[st.metricValue, { color: accent }]}>{value}</Text>
    {!!sub && <Text style={st.metricSub}>{sub}</Text>}
  </View>
);

const InfoCard = ({ title, valueLabel, labelText, message, color, barPct }) => (
  <View style={st.infoCard}>
    <View style={st.infoLeft}>
      <Text style={st.infoTitle}>{title}</Text>
      <Text style={[st.infoLabel, { color }]}>{labelText}</Text>
      <Text style={st.infoMessage}>{message}</Text>
      <View style={st.infoBarWrap}>
        <View
          style={[
            st.infoBar,
            {
              width: `${Math.min(barPct * 100, 100)}%`,
              backgroundColor: color,
            },
          ]}
        />
      </View>
    </View>
    <View style={st.infoValueBlock}>
      <Text style={[st.infoValue, { color }]}>{valueLabel}</Text>
      <Text style={[st.infoValueLabel, { color: TOKENS.textMuted }]}>
        {title}
      </Text>
    </View>
  </View>
);

// ─── MAIN SCREEN ──────────────────────────────────────────────────────────────
export default function Weather() {
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [weather, setWeather] = useState(null);
  const [error, setError] = useState('');
  const [permError, setPermError] = useState(false);
  const [usingCached, setUsingCached] = useState(false);
  const [notice, setNotice] = useState('');
  const [prediction, setPrediction] = useState({ state: 'no_rain' });

  const weatherRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);
  const isFetchingRef = useRef(false);
  const lastFetchRef = useRef(0);
  const isMountedRef = useRef(true);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    weatherRef.current = weather;
  }, [weather]);
  useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    [],
  );

  const thresholds = useMemo(() => getThresholds(), []);

  // ── DERIVED STATE ──────────────────────────────────────────────────────────
  const currentCode = weather?.current?.weather_code ?? 3;
  const isDay = weather?.current?.is_day !== 0;

  const currentCondition = useMemo(() => {
    if (!weather?.current) return getWMO(3);
    return getSmartCondition({
      code: weather.current.weather_code,
      rainMm: weather.currentRain,
      cloudCover: weather.current.cloud_cover,
      isDay: weather.current.is_day,
      thresholds,
    });
  }, [weather, thresholds]);

  const accent = useMemo(
    () => getAccent(currentCondition.art),
    [currentCondition],
  );

  const aqi = useMemo(() => aqiInfo(weather?.airQuality?.aqi), [weather]);
  const uv = useMemo(
    () => uvInfo(weather?.airQuality?.uvIndex ?? weather?.daily?.uvIndexMax),
    [weather],
  );

  const isRainingNow = prediction?.state === 'raining_now';
  const isHeavyRain =
    Number(weather?.currentRain ?? 0) >= thresholds.MIN_REAL_RAIN_MM * 2;

  const monsoon = isMonsoon();

  // ── ANIMATION ──────────────────────────────────────────────────────────────
  const animateIn = () => {
    fadeAnim.setValue(0);
    slideAnim.setValue(30);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 560,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 480,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // ── DATA LOAD ──────────────────────────────────────────────────────────────
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
      setPermError(false);
      if (isRefresh) setRefreshing(true);
      else if (!silent && !weatherRef.current) setLoading(true);

      const hasPerm = await requestLocationPerm();
      if (!isMountedRef.current) return;

      if (!hasPerm) {
        setPermError(true);
        await cancelRainNotif();
        if (weatherRef.current) {
          setUsingCached(true);
          setNotice('Allow location to get fresh weather.');
          return;
        }
        setError('Location permission denied.\nPlease enable it in Settings.');
        return;
      }

      let position = null,
        cachedCoords = null;
      try {
        position = await fetchLocation(isRefresh);
      } catch {
        cachedCoords = await readCoords();
      }

      const lat = position?.coords?.latitude ?? cachedCoords?.lat;
      const lon = position?.coords?.longitude ?? cachedCoords?.lon;
      if (!lat || !lon) throw new Error('Could not determine your location.');

      const [cityName, weatherData, aqiData] = await Promise.all([
        getCityName(lat, lon),
        fetchOpenMeteo(lat, lon),
        fetchAQI(lat, lon).catch(() => null),
      ]);

      if (!isMountedRef.current) return;

      const payload = buildPayload({
        cityName: cityName || cachedCoords?.cityName || 'Your Location',
        weatherData,
        aqiData,
        lat,
        lon,
      });

      // Calculate rain prediction
      const pred = await predictRain({
        hourlyList: payload.hourlyList,
        currentCode: payload.current.weather_code,
        currentMm: payload.currentRain,
        dailyPrecipSum: payload.daily?.precipSum ?? 0,
        windDir: payload.current?.wind_direction_10m ?? -1,
        humidity: payload.current?.relative_humidity_2m ?? 0,
        currentTemp: payload.current?.temperature_2m ?? 0,
      });

      setWeather(payload);
      setPrediction(pred);
      setUsingCached(false);
      setNotice('');

      await saveCache(payload);
      await syncNotification(payload); // Fire notifications

      animateIn();
    } catch (err) {
      if (!isMountedRef.current) return;
      await cancelRainNotif();
      const cached = await readCache();
      if (cached) {
        if (!weatherRef.current) {
          setWeather(cached);
          // Recalculate prediction from cache
          predictRain({
            hourlyList: cached.hourlyList,
            currentCode: cached.current?.weather_code,
            currentMm: cached.currentRain,
            dailyPrecipSum: cached.daily?.precipSum ?? 0,
            windDir: cached.current?.wind_direction_10m ?? -1,
            humidity: cached.current?.relative_humidity_2m ?? 0,
            currentTemp: cached.current?.temperature_2m ?? 0,
          })
            .then(setPrediction)
            .catch(() => {});
          animateIn();
        }
        setUsingCached(true);
        setNotice('Offline — showing last saved data.');
        return;
      }
      setError(err?.message || 'Unable to load weather. Please try again.');
    } finally {
      isFetchingRef.current = false;
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  // ── BOOT ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const boot = async () => {
      await cancelRainNotif();
      const cached = await readCache();
      if (cached && isMountedRef.current) {
        const age = Date.now() - (cached.cachedAt || 0);
        const stale = age > 30 * 60000;
        if (!stale) {
          setWeather(cached);
          setUsingCached(true);
          setLoading(false);
          predictRain({
            hourlyList: cached.hourlyList,
            currentCode: cached.current?.weather_code,
            currentMm: cached.currentRain,
            dailyPrecipSum: cached.daily?.precipSum ?? 0,
            windDir: cached.current?.wind_direction_10m ?? -1,
            humidity: cached.current?.relative_humidity_2m ?? 0,
            currentTemp: cached.current?.temperature_2m ?? 0,
          })
            .then(setPrediction)
            .catch(() => {});
          animateIn();
        }
      }
      loadWeather({ silent: !!cached });
    };

    boot();

    const sub = AppState.addEventListener('change', next => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (prev.match(/inactive|background/) && next === 'active') {
        if (
          Date.now() - lastFetchRef.current > MIN_REFRESH_GAP_MS &&
          isMountedRef.current
        ) {
          loadWeather({ silent: true });
        }
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── DERIVED DISPLAY VALUES ─────────────────────────────────────────────────
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

  // ─── LOADING ──────────────────────────────────────────────────────────────
  if (loading && !weather) {
    return (
      <View style={[st.screen, st.center]}>
        <StatusBar
          barStyle="light-content"
          backgroundColor="transparent"
          translucent
        />
        <SkyBackground weatherArt="cloudy" isDay={true} />
        <View style={st.loadingWrap}>
          <View style={st.loadingOrb}>
            <ActivityIndicator size="large" color={TOKENS.cyan} />
          </View>
          <Text style={st.loadingTitle}>Loading weather…</Text>
          <Text style={st.loadingSubtitle}>ROWA WEATHER</Text>
        </View>
      </View>
    );
  }

  // ─── ERROR STATE ──────────────────────────────────────────────────────────
  if (error && !weather) {
    return (
      <View style={[st.screen, st.center, { paddingHorizontal: 28 }]}>
        <StatusBar
          barStyle="light-content"
          backgroundColor="transparent"
          translucent
        />
        <SkyBackground weatherArt="cloudy" isDay={true} />
        <Text style={st.errorIcon}>⚠️</Text>
        <Text style={st.errorTitle}>Can't load weather</Text>
        <Text style={st.errorText}>{error}</Text>
        {permError && (
          <TouchableOpacity
            style={[st.primaryBtn, { backgroundColor: TOKENS.cyan }]}
            onPress={() => Linking.openSettings().catch(() => {})}
            activeOpacity={0.82}
          >
            <Text style={st.primaryBtnText}>Open Settings</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={st.secondaryBtn}
          onPress={() => loadWeather()}
          activeOpacity={0.82}
        >
          <Text style={st.secondaryBtnText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── MAIN UI ──────────────────────────────────────────────────────────────
  return (
    <View style={st.screen}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />

      {/* Sky background */}
      <SkyBackground weatherArt={currentCondition.art} isDay={isDay} />

      {/* Rain particles */}
      <RainSystem
        isRaining={
          isRainingNow || ['rain', 'storm'].includes(currentCondition.art)
        }
        isHeavy={isHeavyRain}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          st.scrollContent,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadWeather({ isRefresh: true })}
            tintColor={accent}
            colors={[accent]}
            progressBackgroundColor={TOKENS.bgMid}
          />
        }
      >
        <Animated.View
          style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
        >
          {/* ── HEADER ─────────────────────────────────────────────────────── */}
          <View style={st.header}>
            <View style={st.headerLeft}>
              <Text style={st.appLabel}>
                ROWA WEATHER {monsoon ? '🌧️' : '⚡'}
              </Text>
              <View style={st.locationRow}>
                <Text style={st.locationIcon}>📍</Text>
                <Text style={st.locationText} numberOfLines={1}>
                  {weather?.cityName || 'Your Location'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[st.refreshBtn, { borderColor: accent + '50' }]}
              onPress={() => loadWeather({ isRefresh: true })}
              activeOpacity={0.75}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color={accent} />
              ) : (
                <Text style={[st.refreshIcon, { color: accent }]}>↻</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* ── NOTICES ────────────────────────────────────────────────────── */}
          {!!notice && (
            <View style={st.noticePill}>
              <View style={[st.noticeDot, { backgroundColor: TOKENS.amber }]} />
              <Text style={st.noticeText}>{notice}</Text>
            </View>
          )}
          {usingCached && !notice && (
            <View style={st.noticePill}>
              <View
                style={[st.noticeDot, { backgroundColor: TOKENS.textMuted }]}
              />
              <Text style={st.noticeText}>
                Offline · Last updated {weather?.lastUpdated}
              </Text>
            </View>
          )}

          {/* ── HERO CARD ──────────────────────────────────────────────────── */}
          <View style={[st.heroCard, { borderColor: accent + '22' }]}>
            <View style={st.heroArtWrap}>
              <WeatherArt artType={currentCondition.art} accent={accent} />
            </View>

            <View style={st.tempRow}>
              <Text style={st.tempText}>{temp}</Text>
              <Text style={st.tempDeg}>°C</Text>
            </View>

            <View
              style={[
                st.conditionBadge,
                {
                  backgroundColor: accent + '18',
                  borderWidth: 1,
                  borderColor: accent + '35',
                },
              ]}
            >
              <Text style={st.conditionEmoji}>{currentCondition.emoji}</Text>
              <Text style={[st.conditionText, { color: accent }]}>
                {currentCondition.label}
              </Text>
            </View>

            <Text style={st.updatedText}>
              Updated {weather?.lastUpdated || '--'}
            </Text>

            <RainTimerCard prediction={prediction} accent={accent} />
          </View>

          {/* ── FEEL STRIP ─────────────────────────────────────────────────── */}
          <View style={st.feelStrip}>
            <View style={st.feelItem}>
              <Text style={st.feelEmoji}>🌡️</Text>
              <Text style={st.feelLabel}>FEELS</Text>
              <Text style={[st.feelValue, { color: accent }]}>{feels}°</Text>
            </View>
            <View style={st.feelDivider} />
            <View style={st.feelItem}>
              <Text style={st.feelEmoji}>💧</Text>
              <Text style={st.feelLabel}>HUMIDITY</Text>
              <Text style={[st.feelValue, { color: accent }]}>{humidity}%</Text>
            </View>
            <View style={st.feelDivider} />
            <View style={st.feelItem}>
              <Text style={st.feelEmoji}>💨</Text>
              <Text style={st.feelLabel}>WIND</Text>
              <Text style={[st.feelValue, { color: accent }]}>{wind} km/h</Text>
            </View>
            <View style={st.feelDivider} />
            <View style={st.feelItem}>
              <Text style={st.feelEmoji}>🧭</Text>
              <Text style={st.feelLabel}>DIR</Text>
              <Text style={[st.feelValue, { color: accent }]}>
                {windCardinal}
              </Text>
            </View>
          </View>

          {/* ── METRICS ────────────────────────────────────────────────────── */}
          <View style={st.metricsGrid}>
            <MetricCard
              emoji="☔"
              label="RAIN CHANCE"
              value={`${rainChance}%`}
              sub={`${rainMm.toFixed(1)} mm today`}
              accent={accent}
            />
            <MetricCard
              emoji="🌡️"
              label="HIGH / LOW"
              value={
                weather?.daily?.maxTemp !== undefined
                  ? `${Math.round(weather.daily.maxTemp)}°`
                  : '--'
              }
              sub={
                weather?.daily?.minTemp !== undefined
                  ? `Low ${Math.round(weather.daily.minTemp)}°`
                  : '--'
              }
              accent={accent}
            />
          </View>

          {/* ── TODAY CARD ─────────────────────────────────────────────────── */}
          <View style={st.todayCard}>
            <View style={st.todayHeader}>
              <Text style={[st.sectionTitle, { marginBottom: 0 }]}>Today</Text>
              <View style={st.todayTempRange}>
                <Text style={st.todayTempHigh}>
                  {weather?.daily?.maxTemp !== undefined
                    ? `${Math.round(weather.daily.maxTemp)}°`
                    : '--'}
                </Text>
                <Text style={st.todayTempSep}> / </Text>
                <Text style={st.todayTempLow}>
                  {weather?.daily?.minTemp !== undefined
                    ? `${Math.round(weather.daily.minTemp)}°`
                    : '--'}
                </Text>
              </View>
            </View>
            <View style={st.sunRow}>
              <View style={st.sunBox}>
                <Text style={st.sunEmoji}>🌅</Text>
                <Text style={st.sunLabel}>SUNRISE</Text>
                <Text style={st.sunValue}>
                  {fmtTime(weather?.daily?.sunrise)}
                </Text>
              </View>
              <View style={st.sunBox}>
                <Text style={st.sunEmoji}>🌇</Text>
                <Text style={st.sunLabel}>SUNSET</Text>
                <Text style={st.sunValue}>
                  {fmtTime(weather?.daily?.sunset)}
                </Text>
              </View>
            </View>
          </View>

          {/* ── HOURLY ─────────────────────────────────────────────────────── */}
          <View style={st.sectionHeader}>
            <Text style={st.sectionTitle}>Hourly</Text>
            <View style={st.sectionPill}>
              <Text style={st.sectionPillText}>
                NEXT {weather?.hourlyList?.length || 0} HRS
              </Text>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={st.hourlyListContent}
          >
            {weather?.hourlyList?.map((item, idx) => {
              const info = getHourlyCondition(item, thresholds);
              const isNow = idx === 0;
              return (
                <View
                  key={`${item.time}-${item.code}`}
                  style={[
                    st.hourCard,
                    {
                      backgroundColor: isNow ? accent + '18' : TOKENS.bgCard,
                      borderColor: isNow ? accent + '60' : TOKENS.borderSubtle,
                    },
                    isNow && st.hourCardActive,
                  ]}
                >
                  <Text style={[st.hourLabel, isNow && { color: accent }]}>
                    {isNow ? 'NOW' : item.label}
                  </Text>
                  <Text style={st.hourEmoji}>{info.emoji}</Text>
                  <Text style={st.hourTemp}>{item.temp}°</Text>
                  <View style={st.hourRainRow}>
                    <Text style={st.hourRainPct}>{item.rainChance}%</Text>
                  </View>
                  <Text style={st.hourMm}>
                    {Number(item.precipMm).toFixed(1)}mm
                  </Text>
                </View>
              );
            })}
          </ScrollView>

          {/* ── AIR QUALITY ────────────────────────────────────────────────── */}
          <View style={[st.sectionHeader, { marginTop: 14 }]}>
            <Text style={st.sectionTitle}>Air Quality</Text>
            <View style={st.sectionPill}>
              <Text style={st.sectionPillText}>HEALTH</Text>
            </View>
          </View>

          <InfoCard
            title="AQI"
            valueLabel={String(aqi.value)}
            labelText={aqi.label}
            message={aqi.message}
            color={aqi.color}
            barPct={aqi.barPct}
          />
          <InfoCard
            title="UV INDEX"
            valueLabel={String(uv.value)}
            labelText={uv.label}
            message={uv.message}
            color={uv.color}
            barPct={uv.barPct}
          />

          {/* ── PM STRIP ───────────────────────────────────────────────────── */}
          <View style={st.pmStrip}>
            <View style={st.pmCard}>
              <Text style={st.pmLabel}>PM 2.5</Text>
              <Text style={st.pmValue}>
                {fmtNum(weather?.airQuality?.pm25, 1)}
              </Text>
              <Text style={st.pmUnit}>µg/m³ · Fine particles</Text>
            </View>
            <View style={st.pmCard}>
              <Text style={st.pmLabel}>PM 10</Text>
              <Text style={st.pmValue}>
                {fmtNum(weather?.airQuality?.pm10, 1)}
              </Text>
              <Text style={st.pmUnit}>µg/m³ · Dust level</Text>
            </View>
          </View>

          {/* ── FOOTER ─────────────────────────────────────────────────────── */}
          <Text style={st.footer}>ROWA WEATHER · KARNATAKA COAST</Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
