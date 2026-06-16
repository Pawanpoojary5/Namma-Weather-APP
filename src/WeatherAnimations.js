import React, { useEffect, useRef, useMemo } from 'react';
import { Animated, Dimensions, StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

const { width, height } = Dimensions.get('window');
const arr = n => Array.from({ length: n }, (_, i) => i);

// ─── GRADIENTS PER WEATHER STATE ─────────────────────────────────────────────
export const SKY_GRADIENTS = {
  sunny: ['#0F2027', '#1A3A5C', '#2C6E94'],
  partlyCloudy: ['#0A1628', '#162840', '#1E3D5C'],
  cloudy: ['#0A1020', '#111C30', '#182540'],
  clearNight: ['#020610', '#06102A', '#0C1A40'],
  rain: ['#060C18', '#0C1828', '#0F2038'],
  storm: ['#030608', '#080E18', '#0C1420'],
  snow: ['#0A1428', '#162038', '#1C2C48'],
  fog: ['#0C1420', '#14202E', '#1A2A3C'],
};

// ─── ACCENT COLOR PER STATE ───────────────────────────────────────────────────
export const getAccent = art => {
  const map = {
    sunny: '#FFB347',
    partlyCloudy: '#67C6E3',
    cloudy: '#8BA4C8',
    clearNight: '#A78BFA',
    rain: '#00D4FF',
    storm: '#FFD700',
    snow: '#B8D4F0',
    fog: '#94B0C8',
  };
  return map[art] || '#00D4FF';
};

// ─── PARALLAX STAR ───────────────────────────────────────────────────────────
const Star = ({ x, y, size, twinkleDelay }) => {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(twinkleDelay),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.2,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => {
      anim.stop();
      opacity.stopAnimation();
    };
  }, [opacity, twinkleDelay]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#FFFFFF',
        opacity,
        shadowColor: '#FFFFFF',
        shadowOpacity: 0.8,
        shadowRadius: size * 2,
        shadowOffset: { width: 0, height: 0 },
      }}
    />
  );
};

// ─── SHOOTING STAR ───────────────────────────────────────────────────────────
const ShootingStar = ({ delay }) => {
  const x = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const startX = useMemo(() => Math.random() * width * 0.6, []);
  const startY = useMemo(() => Math.random() * height * 0.4, []);

  useEffect(() => {
    const run = () => {
      x.setValue(0);
      opacity.setValue(0);
      Animated.sequence([
        Animated.delay(delay + Math.random() * 6000),
        Animated.parallel([
          Animated.timing(x, {
            toValue: 180,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(opacity, {
              toValue: 1,
              duration: 100,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 600,
              useNativeDriver: true,
            }),
          ]),
        ]),
      ]).start(() => setTimeout(run, 5000 + Math.random() * 8000));
    };
    run();
  }, [delay, opacity, x]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: startX,
        top: startY,
        width: 80,
        height: 1.5,
        borderRadius: 1,
        backgroundColor: '#FFFFFF',
        opacity,
        transform: [{ translateX: x }, { rotate: '20deg' }],
        shadowColor: '#FFFFFF',
        shadowOpacity: 0.9,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 0 },
      }}
    />
  );
};

// ─── MOON ─────────────────────────────────────────────────────────────────────
// inSky=true → positioned in SkyBackground (absolute to screen)
// inSky=false → used inside WeatherArt hero card (relative, centered)
const Moon = ({ inSky = false }) => {
  const glow = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1.15,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => {
      anim.stop();
      glow.stopAnimation();
    };
  }, [glow]);

  // In sky: small ambient moon top-right, well below status bar
  if (inSky)
    return (
      <Animated.View style={[s.moonSkyWrap, { transform: [{ scale: glow }] }]}>
        <View style={s.moonBody} />
        <View style={[s.moonMask, { backgroundColor: '#06102A' }]} />
      </Animated.View>
    );

  // In hero card: larger, centered
  return (
    <Animated.View style={[s.moonHeroWrap, { transform: [{ scale: glow }] }]}>
      <View style={s.moonHeroBody} />
      <View style={[s.moonHeroMask, { backgroundColor: '#06102A' }]} />
    </Animated.View>
  );
};

// ─── SUN ──────────────────────────────────────────────────────────────────────
// inSky=true → small ambient glow in top portion of sky, won't overlap header
// inSky=false (default) → full-size animated sun inside the hero card
const Sun = ({ accent, inSky = false }) => {
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: inSky ? 30000 : 20000,
        useNativeDriver: true,
      }),
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: inSky ? 1.05 : 1.08,
          duration: 2500,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 2500,
          useNativeDriver: true,
        }),
      ]),
    ).start();
    return () => {
      spin.stopAnimation();
      pulse.stopAnimation();
    };
  }, [inSky, pulse, spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Sky version: small, positioned top-center, safely below header overlap zone
  if (inSky) {
    const a = accent || '#FFB347';
    return (
      <View style={s.sunSkyWrap}>
        <Animated.View
          style={[
            s.sunSkyGlow,
            { transform: [{ scale: pulse }], borderColor: a + '16' },
          ]}
        />
        <Animated.View style={[s.sunSkyRays, { transform: [{ rotate }] }]}>
          {arr(12).map(i => (
            <View
              key={i}
              style={[
                s.sunSkyRay,
                {
                  backgroundColor: a,
                  transform: [{ rotate: `${i * 30}deg` }, { translateY: -34 }],
                },
              ]}
            />
          ))}
        </Animated.View>
        <View style={[s.sunSkyCore, { backgroundColor: a, shadowColor: a }]} />
      </View>
    );
  }

  // Hero card version: full size
  return (
    <View style={s.sunWrap}>
      <Animated.View
        style={[
          s.sunGlowOuter,
          {
            transform: [{ scale: pulse }],
            borderColor: (accent || '#FFB347') + '18',
          },
        ]}
      />
      <Animated.View
        style={[
          s.sunGlowMid,
          {
            transform: [{ scale: pulse }],
            borderColor: (accent || '#FFB347') + '28',
          },
        ]}
      />
      <Animated.View style={[s.raysWrap, { transform: [{ rotate }] }]}>
        {arr(12).map(i => (
          <View
            key={i}
            style={[
              s.ray,
              {
                backgroundColor: accent || '#FFB347',
                transform: [{ rotate: `${i * 30}deg` }, { translateY: -56 }],
              },
            ]}
          />
        ))}
      </Animated.View>
      <View
        style={[
          s.sunCore,
          {
            backgroundColor: accent || '#FFB347',
            shadowColor: accent || '#FFB347',
          },
        ]}
      />
    </View>
  );
};

// ─── CLOUD ────────────────────────────────────────────────────────────────────
// Redesigned — softer, Gen Z frosted look with a subtle gradient shimmer
const Cloud = ({
  color = '#C8D8E8',
  shade = '#8AAAC0',
  scale = 1,
  opacity = 1,
  style,
}) => (
  <View style={[s.cloudWrap, style, { opacity, transform: [{ scale }] }]}>
    <View style={[s.cShadow, { backgroundColor: shade }]} />
    <View style={[s.cBase, { backgroundColor: color }]} />
    <View style={[s.cBumpL, { backgroundColor: color }]} />
    <View style={[s.cDome, { backgroundColor: color }]} />
    <View style={[s.cBumpR, { backgroundColor: color }]} />
    <View style={[s.cShadeBar, { backgroundColor: shade }]} />
  </View>
);

// Drifting cloud animation
const DriftCloud = ({ top, scale, duration, delay, opacity, color, shade }) => {
  const x = useRef(new Animated.Value(-(220 * scale))).current;

  useEffect(() => {
    x.setValue(-(220 * scale));
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(x, {
          toValue: width + 260,
          duration,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => {
      anim.stop();
      x.stopAnimation();
    };
  }, [delay, duration, scale, x]);

  return (
    <Animated.View
      style={{ position: 'absolute', top, transform: [{ translateX: x }] }}
    >
      <Cloud scale={scale} opacity={opacity} color={color} shade={shade} />
    </Animated.View>
  );
};

// ─── RAIN SYSTEM ──────────────────────────────────────────────────────────────
const RainDrop = ({ x, delay, speed, isHeavy }) => {
  const y = useRef(new Animated.Value(-60)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const run = () => {
      y.setValue(-60);
      opacity.setValue(0);
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(y, {
            toValue: height + 40,
            duration: speed,
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(opacity, {
              toValue: isHeavy ? 0.75 : 0.5,
              duration: 60,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: isHeavy ? 0.65 : 0.4,
              duration: speed - 100,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 80,
              useNativeDriver: true,
            }),
          ]),
        ]),
      ]).start(run);
    };
    run();
    return () => {
      y.stopAnimation();
      opacity.stopAnimation();
    };
  }, [delay, isHeavy, opacity, speed, y]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x,
        top: 0,
        width: isHeavy ? 2 : 1.4,
        height: isHeavy ? 22 : 15,
        borderRadius: 2,
        backgroundColor: '#A8DCEF',
        opacity,
        transform: [{ translateY: y }, { skewX: '-8deg' }],
      }}
    />
  );
};

export const RainSystem = ({ isRaining, isHeavy }) => {
  const count = isHeavy ? 60 : 32;
  const drops = useMemo(
    () =>
      arr(count).map(i => ({
        x: (i / count) * width + (Math.random() * 24 - 12),
        delay: Math.random() * 1800,
        speed: isHeavy ? 500 + Math.random() * 300 : 750 + Math.random() * 500,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isRaining, isHeavy],
  );

  if (!isRaining) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {drops.map((d, i) => (
        <RainDrop
          key={i}
          x={d.x}
          delay={d.delay}
          speed={d.speed}
          isHeavy={isHeavy}
        />
      ))}
    </View>
  );
};

// ─── SNOW SYSTEM ──────────────────────────────────────────────────────────────
const Flake = ({ x, delay, size }) => {
  const y = useRef(new Animated.Value(-20)).current;
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const run = () => {
      y.setValue(-20);
      drift.setValue(0);
      Animated.parallel([
        Animated.timing(y, {
          toValue: height + 20,
          duration: 5000 + Math.random() * 3000,
          useNativeDriver: true,
        }),
        Animated.loop(
          Animated.sequence([
            Animated.timing(drift, {
              toValue: 18,
              duration: 1500,
              useNativeDriver: true,
            }),
            Animated.timing(drift, {
              toValue: -18,
              duration: 1500,
              useNativeDriver: true,
            }),
          ]),
        ),
      ]).start(run);
    };
    const t = setTimeout(run, delay);
    return () => {
      clearTimeout(t);
      y.stopAnimation();
      drift.stopAnimation();
    };
  }, [delay, drift, y]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x,
        top: 0,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#E8F0F8',
        opacity: 0.75,
        transform: [{ translateY: y }, { translateX: drift }],
      }}
    />
  );
};

const SnowSystem = () => {
  const flakes = useMemo(
    () =>
      arr(28).map(i => ({
        x: (i / 28) * width,
        delay: Math.random() * 4000,
        size: 3 + Math.random() * 5,
      })),
    [],
  );
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {flakes.map((f, i) => (
        <Flake key={i} x={f.x} delay={f.delay} size={f.size} />
      ))}
    </View>
  );
};

// ─── FOG BARS ─────────────────────────────────────────────────────────────────
const FogBar = ({ top, delay, opacity: op }) => {
  const x = useRef(new Animated.Value(-width * 0.3)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(fade, {
            toValue: op,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(x, {
            toValue: width * 0.15,
            duration: 7000,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(fade, {
            toValue: 0,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(x, {
            toValue: width * 0.3,
            duration: 2000,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ).start();
    return () => {
      x.stopAnimation();
      fade.stopAnimation();
    };
  }, [delay, fade, op, x]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: -60,
        top,
        width: width + 120,
        height: 22,
        borderRadius: 11,
        backgroundColor: '#C8D8E0',
        opacity: fade,
        transform: [{ translateX: x }],
      }}
    />
  );
};

// ─── STORM ────────────────────────────────────────────────────────────────────
const LightningBolt = () => {
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const boltOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const strike = () => {
      Animated.sequence([
        Animated.timing(flashOpacity, {
          toValue: 0.35,
          duration: 40,
          useNativeDriver: true,
        }),
        Animated.timing(flashOpacity, {
          toValue: 0,
          duration: 60,
          useNativeDriver: true,
        }),
        Animated.delay(80),
        Animated.timing(flashOpacity, {
          toValue: 0.2,
          duration: 40,
          useNativeDriver: true,
        }),
        Animated.timing(flashOpacity, {
          toValue: 0,
          duration: 120,
          useNativeDriver: true,
        }),
      ]).start();
      Animated.sequence([
        Animated.timing(boltOpacity, {
          toValue: 1,
          duration: 30,
          useNativeDriver: true,
        }),
        Animated.timing(boltOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
      setTimeout(strike, 3500 + Math.random() * 5000);
    };
    const t = setTimeout(strike, 1000 + Math.random() * 2000);
    return () => {
      clearTimeout(t);
      flashOpacity.stopAnimation();
      boltOpacity.stopAnimation();
    };
  }, [boltOpacity, flashOpacity]);

  return (
    <>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: '#FFFFFF', opacity: flashOpacity },
        ]}
        pointerEvents="none"
      />
      <Animated.View
        style={[s.boltWrap, { opacity: boltOpacity }]}
        pointerEvents="none"
      >
        <View style={s.boltTop} />
        <View style={s.boltBottom} />
      </Animated.View>
    </>
  );
};

// ─── SKY BACKGROUND ───────────────────────────────────────────────────────────
export const SkyBackground = ({ weatherArt, isDay }) => {
  const art = weatherArt || 'cloudy';
  const gradKey = isDay ? art : 'clearNight';
  const gradient = SKY_GRADIENTS[gradKey] || SKY_GRADIENTS.cloudy;

  const isNight = !isDay;
  const showStars = isNight || art === 'clearNight';
  const showSun = isDay && (art === 'sunny' || art === 'partlyCloudy');
  const showMoon = isNight || art === 'clearNight';
  const showClouds = [
    'cloudy',
    'partlyCloudy',
    'rain',
    'storm',
    'snow',
    'fog',
  ].includes(art);
  const showFog = art === 'fog';
  const showSnow = art === 'snow';
  const showStorm = art === 'storm';

  const stars = useMemo(
    () =>
      arr(55).map(() => ({
        x: Math.random() * width,
        y: Math.random() * (height * 0.55),
        size: 1 + Math.random() * 2.5,
        delay: Math.random() * 4000,
      })),
    [],
  );

  return (
    // zIndex: -1 keeps the entire sky layer BEHIND all UI cards/text
    <View
      style={[StyleSheet.absoluteFill, { zIndex: -1 }]}
      pointerEvents="none"
    >
      <LinearGradient
        colors={gradient}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.3, y: 1 }}
      />

      {showStars &&
        stars.map((star, i) => (
          <Star key={i} {...star} twinkleDelay={star.delay} />
        ))}
      {showStars && arr(3).map(i => <ShootingStar key={i} delay={i * 4000} />)}

      {/* Sun/Moon removed from sky — they render only inside WeatherArt hero card */}

      {showClouds && (
        <>
          {/* All cloud tops start at y≥220 so they never touch the header */}
          <DriftCloud
            top={220}
            scale={1.1}
            duration={38000}
            delay={0}
            opacity={art === 'cloudy' ? 0.55 : 0.32}
            color={isNight ? '#1A2840' : '#C8D8E8'}
            shade={isNight ? '#0E1A2C' : '#8AAAC0'}
          />
          <DriftCloud
            top={300}
            scale={0.85}
            duration={48000}
            delay={12000}
            opacity={art === 'cloudy' ? 0.42 : 0.22}
            color={isNight ? '#142036' : '#D8E8F4'}
            shade={isNight ? '#0A1624' : '#9ABCD0'}
          />
          {(art === 'cloudy' || art === 'rain' || art === 'storm') && (
            <DriftCloud
              top={260}
              scale={1.25}
              duration={55000}
              delay={25000}
              opacity={0.48}
              color={isNight ? '#0E1828' : '#B0C4D8'}
              shade={isNight ? '#080E1A' : '#7A9AB4'}
            />
          )}
        </>
      )}

      {showFog && (
        <>
          <FogBar top={300} delay={0} opacity={0.18} />
          <FogBar top={420} delay={2000} opacity={0.14} />
          <FogBar top={520} delay={4000} opacity={0.12} />
        </>
      )}
      {showStorm && <LightningBolt />}
      {showSnow && <SnowSystem />}
    </View>
  );
};

// ─── WEATHER ART (hero card center animation) ─────────────────────────────────
export const WeatherArt = ({ artType, accent }) => {
  const art = artType || 'cloudy';

  if (art === 'sunny')
    return (
      <View style={s.artCenter}>
        <Sun accent={accent} inSky={false} />
      </View>
    );

  if (art === 'clearNight')
    return (
      <View style={s.artCenter}>
        <Moon inSky={false} />
      </View>
    );

  if (art === 'partlyCloudy')
    return (
      <View style={s.artCenter}>
        <Sun accent={accent} inSky={false} />
        <View style={{ position: 'absolute', bottom: 10, right: 10 }}>
          <Cloud scale={0.72} opacity={0.88} color="#C8D8E8" shade="#8AAAC0" />
        </View>
      </View>
    );

  if (art === 'rain')
    return (
      <View style={s.artCenter}>
        <Cloud scale={1.1} opacity={0.9} color="#6A8AA8" shade="#3A5A78" />
        {arr(5).map(i => (
          <View
            key={i}
            style={[
              s.artRainDrop,
              { left: 30 + i * 28, height: 14 + (i % 3) * 6 },
            ]}
          />
        ))}
      </View>
    );

  if (art === 'storm')
    return (
      <View style={s.artCenter}>
        <Cloud scale={1.1} opacity={0.9} color="#3A4A58" shade="#1A2A38" />
        <View style={s.artBoltWrap}>
          <View style={s.artBoltTop} />
          <View style={s.artBoltBot} />
        </View>
      </View>
    );

  if (art === 'snow')
    return (
      <View style={s.artCenter}>
        <Cloud scale={1.0} opacity={0.85} color="#C0CCD8" shade="#8A9EB2" />
        {arr(5).map(i => (
          <View key={i} style={[s.artSnowflake, { left: 26 + i * 30 }]}>
            <View style={s.artSnowH} />
            <View style={s.artSnowV} />
          </View>
        ))}
      </View>
    );

  if (art === 'fog')
    return (
      <View style={s.artCenter}>
        {arr(4).map(i => (
          <View
            key={i}
            style={[
              s.artFogBar,
              {
                top: 38 + i * 22,
                width: 120 - i * 14,
                opacity: 0.45 - i * 0.06,
              },
            ]}
          />
        ))}
      </View>
    );

  // Default: cloudy
  return (
    <View style={s.artCenter}>
      <Cloud
        scale={0.9}
        opacity={0.78}
        color="#5A7A98"
        shade="#2A4A68"
        style={{ marginBottom: -20 }}
      />
      <Cloud scale={1.05} opacity={0.88} color="#6A8AA8" shade="#3A5A78" />
    </View>
  );
};

// ─── STYLES ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Sun
  sunWrap: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sunGlowOuter: {
    position: 'absolute',
    width: 118,
    height: 118,
    borderRadius: 59,
    borderWidth: 12,
  },
  sunGlowMid: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 8,
  },
  sunCore: {
    position: 'absolute',
    width: 58,
    height: 58,
    borderRadius: 29,
    shadowOpacity: 0.7,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  raysWrap: {
    position: 'absolute',
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ray: {
    position: 'absolute',
    width: 3.5,
    height: 18,
    borderRadius: 2,
    opacity: 0.7,
  },

  // Moon — sky version (small, top-right corner)
  moonSkyWrap: {
    position: 'absolute',
    right: 32,
    top: 110, // well below status bar + header
    width: 44,
    height: 44,
  },
  // Moon — hero card version (larger, centered by parent)
  moonHeroWrap: {
    width: 90,
    height: 90,
    alignSelf: 'center',
  },
  moonHeroBody: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#EEF2FF',
    shadowColor: '#C8D0FF',
    shadowOpacity: 0.6,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  moonHeroMask: {
    position: 'absolute',
    right: -14,
    top: 10,
    width: 74,
    height: 74,
    borderRadius: 37,
  },

  // Sun — sky version
  sunSkyWrap: {
    position: 'absolute',
    left: width / 2 - 38,
    top: 110, // below status bar + header safe zone
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sunSkyGlow: {
    position: 'absolute',
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 10,
  },
  sunSkyRays: {
    position: 'absolute',
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sunSkyRay: {
    position: 'absolute',
    width: 2.5,
    height: 11,
    borderRadius: 2,
    opacity: 0.55,
  },
  sunSkyCore: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },

  // Moon (old - kept for safety, now unused)
  moonWrap: {
    position: 'absolute',
    right: 36,
    top: 28,
    width: 58,
    height: 58,
  },
  moonBody: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EEF2FF',
    shadowColor: '#C8D0FF',
    shadowOpacity: 0.6,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  moonMask: {
    position: 'absolute',
    right: -8,
    top: 6,
    width: 36,
    height: 36,
    borderRadius: 18,
  },

  // Cloud
  cloudWrap: { position: 'relative', width: 200, height: 110 },
  cShadow: {
    position: 'absolute',
    left: 16,
    top: 68,
    width: 164,
    height: 38,
    borderRadius: 22,
    opacity: 0.45,
  },
  cBase: {
    position: 'absolute',
    left: 16,
    top: 60,
    width: 168,
    height: 44,
    borderRadius: 24,
  },
  cBumpL: {
    position: 'absolute',
    left: 22,
    top: 38,
    width: 70,
    height: 52,
    borderRadius: 34,
  },
  cDome: {
    position: 'absolute',
    left: 74,
    top: 16,
    width: 76,
    height: 76,
    borderRadius: 38,
  },
  cBumpR: {
    position: 'absolute',
    left: 122,
    top: 40,
    width: 56,
    height: 48,
    borderRadius: 28,
  },
  cShadeBar: {
    position: 'absolute',
    left: 32,
    top: 86,
    width: 118,
    height: 9,
    borderRadius: 5,
    opacity: 0.35,
  },

  // Art center
  artCenter: {
    width: 200,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  artRainDrop: {
    position: 'absolute',
    bottom: 10,
    width: 2.5,
    borderRadius: 2,
    backgroundColor: '#A8DCEF',
    opacity: 0.8,
  },
  artBoltWrap: { position: 'absolute', bottom: 6, right: 58 },
  artBoltTop: {
    width: 14,
    height: 40,
    backgroundColor: '#FDE68A',
    transform: [{ skewX: '-20deg' }, { rotate: '8deg' }],
  },
  artBoltBot: {
    width: 14,
    height: 36,
    backgroundColor: '#FDE68A',
    transform: [{ skewX: '-20deg' }, { rotate: '8deg' }],
    marginLeft: -8,
  },
  artSnowflake: {
    position: 'absolute',
    bottom: 12,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artSnowH: {
    position: 'absolute',
    width: 16,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#C8DCEA',
    opacity: 0.75,
  },
  artSnowV: {
    position: 'absolute',
    width: 3,
    height: 16,
    borderRadius: 1.5,
    backgroundColor: '#C8DCEA',
    opacity: 0.75,
  },
  artFogBar: {
    position: 'absolute',
    left: 16,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#C8D8E0',
  },

  // Lightning
  boltWrap: {
    position: 'absolute',
    right: 60,
    top: 70,
    width: 44,
    height: 76,
    zIndex: 2,
  },
  boltTop: {
    width: 14,
    height: 40,
    backgroundColor: '#FDE68A',
    transform: [{ skewX: '-20deg' }, { rotate: '8deg' }],
    position: 'absolute',
    left: 16,
    top: 0,
  },
  boltBottom: {
    width: 14,
    height: 40,
    backgroundColor: '#FDE68A',
    transform: [{ skewX: '-20deg' }, { rotate: '8deg' }],
    position: 'absolute',
    left: 6,
    top: 30,
  },
});
