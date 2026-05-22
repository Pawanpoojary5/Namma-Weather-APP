import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

const { width, height } = Dimensions.get('window');
const CARD_H = 220;
const arr = n => Array.from({ length: n }, (_, i) => i);

// ─── CLOUD SHAPE ─────────────────────────────────────────────────────────────
// Fluffy multi-bubble cloud. Centered via style prop.
const Cloud = ({
  color = '#E8EEF2',
  shade = '#B8C8D4',
  scale = 1,
  opacity = 1,
  style,
}) => (
  <View
    style={[s.cloudWrap, style, { opacity, transform: [{ scale }] }]}
    needsOffscreenAlphaCompositing
    renderToHardwareTextureAndroid
  >
    {/* shadow layer */}
    <View style={[s.cShadow, { backgroundColor: shade }]} />
    {/* base body */}
    <View style={[s.cBase, { backgroundColor: color }]} />
    {/* left bump */}
    <View style={[s.cBumpLeft, { backgroundColor: color }]} />
    {/* center top dome — tallest */}
    <View style={[s.cDomeTop, { backgroundColor: color }]} />
    {/* right bump */}
    <View style={[s.cBumpRight, { backgroundColor: color }]} />
    {/* bottom shade stripe */}
    <View style={[s.cShadeBar, { backgroundColor: shade }]} />
  </View>
);

// Tiny decorative cloud for backgrounds
const TinyCloud = ({ color = '#FFFFFF', opacity = 0.18, style }) => (
  <View
    style={[s.tinyCloudWrap, style, { opacity }]}
    needsOffscreenAlphaCompositing
    renderToHardwareTextureAndroid
  >
    <View style={[s.tcBase, { backgroundColor: color }]} />
    <View style={[s.tcDomeL, { backgroundColor: color }]} />
    <View style={[s.tcDomeR, { backgroundColor: color }]} />
  </View>
);

// Slowly drifts from left off-screen to right off-screen, loops
const DriftingCloud = ({
  top,
  scale,
  duration,
  delay,
  opacity,
  color,
  shade,
}) => {
  const x = useRef(new Animated.Value(-(210 * scale))).current;

  useEffect(() => {
    x.setValue(-(210 * scale));
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(x, {
          toValue: width + 230,
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
      style={[s.absolute, { top, transform: [{ translateX: x }] }]}
    >
      <Cloud scale={scale} opacity={opacity} color={color} shade={shade} />
    </Animated.View>
  );
};

// ─── SUN ─────────────────────────────────────────────────────────────────────
const SunRays = ({ accent }) => {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 12000,
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => {
      anim.stop();
      spin.stopAnimation();
    };
  }, [spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View style={[s.raysWrap, { transform: [{ rotate }] }]}>
      {arr(12).map(i => (
        <View
          key={i}
          style={[
            s.ray,
            {
              backgroundColor: accent || '#FCD34D',
              transform: [{ rotate: `${i * 30}deg` }, { translateY: -52 }],
            },
          ]}
        />
      ))}
    </Animated.View>
  );
};

// Gentle pulse on sun glow
const SunGlow = ({ accent }) => {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.08,
          duration: 2200,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 2200,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => {
      anim.stop();
      scale.stopAnimation();
    };
  }, [scale]);

  return (
    <Animated.View
      style={[
        s.sunGlow,
        { backgroundColor: accent || '#FCD34D', transform: [{ scale }] },
      ]}
    />
  );
};

// ─── RAIN DROP ────────────────────────────────────────────────────────────────
const RainDrop = ({ left, delay, duration, dropHeight, opacity }) => {
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    y.setValue(0);
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(y, { toValue: 1, duration, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => {
      anim.stop();
      y.stopAnimation();
    };
  }, [delay, duration, y]);

  const translateY = y.interpolate({
    inputRange: [0, 1],
    outputRange: [-55, CARD_H + 75],
  });

  return (
    <Animated.View
      style={[
        s.rainDrop,
        {
          left,
          height: dropHeight,
          opacity,
          transform: [{ translateY }, { rotate: '12deg' }],
        },
      ]}
    />
  );
};

// ─── SNOWFLAKE ────────────────────────────────────────────────────────────────
const SnowFlake = ({ left, size, delay, duration, drift }) => {
  const p = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    p.setValue(0);
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(p, { toValue: 1, duration, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => {
      anim.stop();
      p.stopAnimation();
    };
  }, [delay, duration, p]);

  const translateY = p.interpolate({
    inputRange: [0, 1],
    outputRange: [-24, CARD_H + 34],
  });
  const translateX = p.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, drift, 0],
  });
  const opacity = p.interpolate({
    inputRange: [0, 0.1, 0.9, 1],
    outputRange: [0, 1, 1, 0],
  });

  return (
    <Animated.View
      style={[
        s.snow,
        {
          left,
          width: size,
          height: size,
          borderRadius: size / 2,
          opacity,
          transform: [{ translateY }, { translateX }],
        },
      ]}
    />
  );
};

// ─── STAR ─────────────────────────────────────────────────────────────────────
const Star = ({ left, top, size, delay }) => {
  const opacity = useRef(new Animated.Value(0.2)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 1400,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.2,
          duration: 1400,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => {
      anim.stop();
      opacity.stopAnimation();
    };
  }, [delay, opacity]);

  return (
    <Animated.View
      style={[
        s.star,
        {
          left,
          top,
          width: size,
          height: size,
          borderRadius: size / 2,
          opacity,
        },
      ]}
    />
  );
};

// ─── FOG BAR ──────────────────────────────────────────────────────────────────
const FogBar = ({ top, barWidth, delay, duration, maxOpacity }) => {
  const p = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(p, { toValue: 1, duration, useNativeDriver: true }),
        Animated.timing(p, { toValue: 0, duration, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => {
      anim.stop();
      p.stopAnimation();
    };
  }, [delay, duration, p]);

  const translateX = p.interpolate({
    inputRange: [0, 1],
    outputRange: [-52, 52],
  });
  const opacity = p.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [maxOpacity * 0.4, maxOpacity, maxOpacity * 0.4],
  });

  return (
    <Animated.View
      style={[
        s.fogBar,
        { top, width: barWidth, opacity, transform: [{ translateX }] },
      ]}
    />
  );
};

// ─── SCENES ───────────────────────────────────────────────────────────────────

// SUNNY — warm sky, centered sun with rays + glow, clean sky
const SunnyScene = ({ accent }) => (
  <LinearGradient colors={['#1E4A6E', '#0D2A45', '#091929']} style={s.fill}>
    <View style={s.skyGlow} />
    <View style={s.sunWrap}>
      <SunGlow accent={accent} />
      <SunRays accent={accent} />
      <View style={[s.sunCircle, { backgroundColor: accent || '#FCD34D' }]} />
    </View>
  </LinearGradient>
);

// PARTLY CLOUDY — sun visible behind one main cloud
const PartlyCloudyScene = ({ accent }) => {
  const cloudOpacity = useRef(new Animated.Value(0.88)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(cloudOpacity, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(cloudOpacity, {
          toValue: 0.88,
          duration: 3000,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => {
      anim.stop();
      cloudOpacity.stopAnimation();
    };
  }, [cloudOpacity]);

  return (
    <LinearGradient colors={['#1E3A52', '#0F2235', '#091929']} style={s.fill}>
      {/* Sun peeking top-right behind cloud */}
      <View style={s.partSunWrap}>
        <SunRays accent={accent} />
        <View style={[s.sunCircle, { backgroundColor: accent || '#FCD34D' }]} />
      </View>

      {/* Main cloud over sun */}
      <Animated.View style={[s.mainCloudWrap, { opacity: cloudOpacity }]}>
        <Cloud scale={1.1} color="#D8E4EC" shade="#8FA3AE" />
      </Animated.View>

      <DriftingCloud
        top={150}
        scale={0.3}
        duration={42000}
        delay={2000}
        opacity={0.12}
        color="#C8D8E4"
        shade="#8FA3AE"
      />
    </LinearGradient>
  );
};

// CLOUDY — overcast, three layered clouds, subtle movement
const CloudyScene = () => {
  const shift1 = useRef(new Animated.Value(0)).current;
  const shift2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const a1 = Animated.loop(
      Animated.sequence([
        Animated.timing(shift1, {
          toValue: 8,
          duration: 6000,
          useNativeDriver: true,
        }),
        Animated.timing(shift1, {
          toValue: -8,
          duration: 6000,
          useNativeDriver: true,
        }),
      ]),
    );
    const a2 = Animated.loop(
      Animated.sequence([
        Animated.timing(shift2, {
          toValue: -10,
          duration: 7500,
          useNativeDriver: true,
        }),
        Animated.timing(shift2, {
          toValue: 10,
          duration: 7500,
          useNativeDriver: true,
        }),
      ]),
    );
    a1.start();
    a2.start();
    return () => {
      a1.stop();
      a2.stop();
      shift1.stopAnimation();
      shift2.stopAnimation();
    };
  }, [shift1, shift2]);

  return (
    <LinearGradient colors={['#2C3A47', '#1A2530', '#0F1920']} style={s.fill}>
      {/* back cloud — smaller, darker */}
      <Animated.View
        style={[
          s.absolute,
          { top: 20, left: '10%', transform: [{ translateX: shift2 }] },
        ]}
      >
        <Cloud scale={0.72} opacity={0.55} color="#8FA3AE" shade="#607080" />
      </Animated.View>

      {/* main center cloud */}
      <Animated.View
        style={[
          s.absolute,
          { top: 50, left: '20%', transform: [{ translateX: shift1 }] },
        ]}
      >
        <Cloud scale={1.05} opacity={1} color="#C8D4DC" shade="#7A8E9A" />
      </Animated.View>

      {/* front cloud — bottom left, gives depth */}
      <Animated.View
        style={[
          s.absolute,
          { top: 110, left: '-5%', transform: [{ translateX: shift2 }] },
        ]}
      >
        <Cloud scale={0.65} opacity={0.7} color="#A0B4BE" shade="#607080" />
      </Animated.View>

      <DriftingCloud
        top={10}
        scale={0.26}
        duration={48000}
        delay={0}
        opacity={0.12}
        color="#8FA3AE"
        shade="#607080"
      />
    </LinearGradient>
  );
};

// RAIN — dark clouds, many drops
const RainScene = ({ heavy = false }) => {
  const drops = useMemo(
    () =>
      arr(heavy ? 32 : 24).map(i => ({
        left: (i * 23) % Math.max(width - 30, 280),
        delay: i * (heavy ? 40 : 70),
        duration: heavy ? 500 : 720,
        dropHeight: heavy ? 36 : 24,
        opacity: heavy ? 0.82 : 0.58,
      })),
    [heavy],
  );

  return (
    <LinearGradient colors={['#1A2535', '#0D1520', '#060E18']} style={s.fill}>
      {/* two dark rain clouds */}
      <View style={[s.absolute, { top: 18, left: '5%' }]}>
        <Cloud scale={1.05} opacity={0.95} color="#8A9BA8" shade="#4A5A68" />
      </View>
      <View style={[s.absolute, { top: 55, left: '45%' }]}>
        <Cloud scale={0.72} opacity={0.75} color="#7A8B98" shade="#3E4E5C" />
      </View>

      {drops.map(item => (
        <RainDrop key={`${item.left}-${item.delay}`} {...item} />
      ))}
    </LinearGradient>
  );
};

// STORM — rain + lightning flash
const StormScene = () => {
  const flash = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(1200),
        Animated.timing(flash, {
          toValue: 0.72,
          duration: 60,
          useNativeDriver: true,
        }),
        Animated.timing(flash, {
          toValue: 0,
          duration: 140,
          useNativeDriver: true,
        }),
        Animated.delay(220),
        Animated.timing(flash, {
          toValue: 0.42,
          duration: 55,
          useNativeDriver: true,
        }),
        Animated.timing(flash, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.delay(1600),
      ]),
    );
    anim.start();
    return () => {
      anim.stop();
      flash.stopAnimation();
    };
  }, [flash]);

  return (
    <View style={s.fill}>
      <RainScene heavy />
      {/* lightning bolt */}
      <View style={s.boltWrap}>
        <View style={s.boltTop} />
        <View style={s.boltBottom} />
      </View>
      <Animated.View style={[s.flash, { opacity: flash }]} />
    </View>
  );
};

// SNOW — pale blue sky, flakes drifting down
const SnowScene = () => {
  const flakes = useMemo(
    () =>
      arr(26).map(i => ({
        left: (i * 31) % Math.max(width - 20, 280),
        size: 3 + (i % 5),
        delay: i * 90,
        duration: 3800 + (i % 6) * 300,
        drift: i % 2 === 0 ? 16 : -16,
      })),
    [],
  );

  return (
    <LinearGradient colors={['#B8CDD8', '#7A9AAE', '#4A6A7E']} style={s.fill}>
      <View style={[s.absolute, { top: 30, left: '15%' }]}>
        <Cloud scale={0.82} opacity={0.9} color="#EAEFF2" shade="#B8C8D2" />
      </View>
      <View style={[s.absolute, { top: 80, left: '50%' }]}>
        <Cloud scale={0.55} opacity={0.65} color="#D8E4EA" shade="#A0B4BE" />
      </View>
      {flakes.map(item => (
        <SnowFlake key={`${item.left}-${item.delay}`} {...item} />
      ))}
    </LinearGradient>
  );
};

// CLEAR NIGHT — deep navy, crescent moon, twinkling stars
const ClearNightScene = () => {
  const stars = useMemo(
    () =>
      arr(28).map(i => ({
        left: 10 + ((i * 41) % (width - 20)),
        top: 8 + ((i * 29) % 140),
        size: 1.5 + (i % 3) * 0.8,
        delay: i * 110,
      })),
    [],
  );

  // Shooting star
  const shotX = useRef(new Animated.Value(-60)).current;
  const shotY = useRef(new Animated.Value(20)).current;
  const shotO = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const shoot = () => {
      shotX.setValue(-60);
      shotY.setValue(20);
      shotO.setValue(0);
      Animated.sequence([
        Animated.delay(4000 + Math.random() * 5000),
        Animated.parallel([
          Animated.timing(shotX, {
            toValue: width * 0.7,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.timing(shotY, {
            toValue: 90,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(shotO, {
              toValue: 1,
              duration: 120,
              useNativeDriver: true,
            }),
            Animated.timing(shotO, {
              toValue: 0,
              duration: 580,
              useNativeDriver: true,
            }),
          ]),
        ]),
      ]).start(shoot);
    };
    shoot();
    return () => {
      shotX.stopAnimation();
      shotY.stopAnimation();
      shotO.stopAnimation();
    };
  }, [shotO, shotX, shotY]);

  return (
    <LinearGradient colors={['#040C18', '#081628', '#0C2040']} style={s.fill}>
      {/* stars */}
      {stars.map(item => (
        <Star key={`${item.left}-${item.top}`} {...item} />
      ))}

      {/* shooting star */}
      <Animated.View
        style={[
          s.shootingStar,
          {
            opacity: shotO,
            transform: [{ translateX: shotX }, { translateY: shotY }],
          },
        ]}
      />

      {/* moon — crescent via offset circle mask */}
      <View style={s.moonWrap}>
        <View style={s.moonBody} />
        <View style={s.moonMask} />
      </View>
    </LinearGradient>
  );
};

// FOG — muted grey, layered fog bands sliding slowly
const FogScene = () => (
  <LinearGradient colors={['#8A9BA6', '#5C6E78', '#3A4E58']} style={s.fill}>
    <View style={[s.absolute, { top: 20, left: '10%' }]}>
      <Cloud scale={0.75} opacity={0.28} color="#D8E4EA" shade="#9AAAB4" />
    </View>
    <FogBar
      top={55}
      barWidth={width * 0.9}
      delay={0}
      duration={5500}
      maxOpacity={0.72}
    />
    <FogBar
      top={85}
      barWidth={width * 1.1}
      delay={500}
      duration={7000}
      maxOpacity={0.58}
    />
    <FogBar
      top={115}
      barWidth={width * 0.8}
      delay={900}
      duration={6000}
      maxOpacity={0.65}
    />
    <FogBar
      top={148}
      barWidth={width * 1.0}
      delay={1400}
      duration={8000}
      maxOpacity={0.45}
    />
    <FogBar
      top={178}
      barWidth={width * 0.7}
      delay={200}
      duration={6500}
      maxOpacity={0.5}
    />
  </LinearGradient>
);

// ─── WEATHER ART CARD ─────────────────────────────────────────────────────────
export const WeatherArt = ({ artType = 'cloudy', accent = '#67E8F9' }) => {
  const scene = useMemo(() => {
    switch (artType) {
      case 'sunny':
        return <SunnyScene accent={accent} />;
      case 'partlyCloudy':
        return <PartlyCloudyScene accent={accent} />;
      case 'rain':
        return <RainScene />;
      case 'storm':
        return <StormScene />;
      case 'snow':
        return <SnowScene />;
      case 'clearNight':
        return <ClearNightScene />;
      case 'fog':
        return <FogScene />;
      case 'cloudy':
      default:
        return <CloudyScene />;
    }
  }, [accent, artType]);

  return <View style={s.card}>{scene}</View>;
};

// ─── SKY BACKGROUND (full screen behind scroll) ───────────────────────────────
export const SkyBackground = ({ weatherArt, isDay }) => {
  const cloudX = useRef(new Animated.Value(-180)).current;
  const fogX = useRef(new Animated.Value(-80)).current;

  const isFog = weatherArt === 'fog';
  const isStorm = weatherArt === 'storm' || weatherArt === 'rain';
  const showLayer = isStorm || isFog;

  useEffect(() => {
    const cloudAnim = Animated.loop(
      Animated.timing(cloudX, {
        toValue: width + 180,
        duration: isStorm ? 16000 : 32000,
        useNativeDriver: true,
      }),
    );
    const fogAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(fogX, {
          toValue: 80,
          duration: 9000,
          useNativeDriver: true,
        }),
        Animated.timing(fogX, {
          toValue: -80,
          duration: 9000,
          useNativeDriver: true,
        }),
      ]),
    );

    if (showLayer) {
      cloudX.setValue(-180);
      cloudAnim.start();
      fogAnim.start();
    }

    return () => {
      cloudAnim.stop();
      fogAnim.stop();
      cloudX.stopAnimation();
      fogX.stopAnimation();
    };
  }, [cloudX, fogX, isStorm, showLayer]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: isDay
              ? isStorm
                ? '#1A2535'
                : '#0F172A'
              : '#060C18',
          },
        ]}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: isStorm
              ? 'rgba(12,20,36,0.65)'
              : 'rgba(28,38,52,0.25)',
          },
        ]}
      />

      {showLayer && (
        <>
          <Animated.View
            style={{
              position: 'absolute',
              top: 60,
              left: 0,
              transform: [{ translateX: cloudX }],
            }}
          >
            <Cloud
              scale={0.6}
              opacity={isStorm ? 0.16 : 0.1}
              color="#8A9BA8"
              shade="#5A6A78"
            />
          </Animated.View>
          <Animated.View
            style={[
              s.bgFogBar,
              {
                opacity: isFog ? 0.42 : 0.1,
                transform: [{ translateX: fogX }],
              },
            ]}
          />
        </>
      )}
    </View>
  );
};

// ─── RAIN SYSTEM (full screen drops) ─────────────────────────────────────────
const BgRainDrop = ({ left, delay, duration, isHeavy }) => {
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    y.setValue(0);
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(y, { toValue: 1, duration, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => {
      anim.stop();
      y.stopAnimation();
    };
  }, [delay, duration, y]);

  const translateY = y.interpolate({
    inputRange: [0, 1],
    outputRange: [-60, height + 80],
  });

  return (
    <Animated.View
      style={[
        s.bgRainDrop,
        {
          left,
          height: isHeavy ? 42 : 26,
          opacity: isHeavy ? 0.48 : 0.26,
          transform: [{ translateY }, { rotate: '12deg' }],
        },
      ]}
    />
  );
};

export const RainSystem = ({ isRaining, isHeavyRain }) => {
  const drops = useMemo(() => {
    const count = isHeavyRain ? 28 : 18;
    return arr(count).map(i => ({
      left: (i * 29) % Math.max(width - 20, 280),
      delay: i * (isHeavyRain ? 50 : 90),
      duration: isHeavyRain ? 600 : 880,
    }));
  }, [isHeavyRain]);

  if (!isRaining) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {drops.map(item => (
        <BgRainDrop
          key={`${item.left}-${item.delay}`}
          {...item}
          isHeavy={isHeavyRain}
        />
      ))}
    </View>
  );
};

// ─── STYLES ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  card: {
    width: '100%',
    height: CARD_H,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#0A1525',
    marginBottom: 14,
  },
  fill: { ...StyleSheet.absoluteFillObject },
  absolute: { position: 'absolute' },

  // sky atmosphere glow behind sun
  skyGlow: {
    position: 'absolute',
    top: -40,
    left: '30%',
    width: '60%',
    height: 160,
    borderRadius: 100,
    backgroundColor: 'rgba(250,200,80,0.07)',
  },

  // ── Sun ──
  sunWrap: {
    position: 'absolute',
    top: 22,
    left: '50%',
    transform: [{ translateX: -55 }],
    width: 110,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sunGlow: {
    position: 'absolute',
    width: 92,
    height: 92,
    borderRadius: 46,
    opacity: 0.28,
  },
  raysWrap: {
    position: 'absolute',
    width: 110,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ray: {
    position: 'absolute',
    width: 4,
    height: 20,
    borderRadius: 3,
    opacity: 0.78,
  },
  sunCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    shadowColor: '#FCD34D',
    shadowOpacity: 0.55,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },

  // ── Partly cloudy sun ──
  partSunWrap: {
    position: 'absolute',
    top: 28,
    right: 48,
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainCloudWrap: {
    position: 'absolute',
    top: 58,
    left: '5%',
  },

  // ── Cloud shape ──
  cloudWrap: {
    position: 'relative',
    width: 200,
    height: 110,
  },
  cShadow: {
    position: 'absolute',
    left: 16,
    top: 65,
    width: 164,
    height: 40,
    borderRadius: 24,
    opacity: 0.55,
  },
  cBase: {
    position: 'absolute',
    left: 16,
    top: 58,
    width: 168,
    height: 46,
    borderRadius: 26,
  },
  cBumpLeft: {
    position: 'absolute',
    left: 22,
    top: 36,
    width: 72,
    height: 56,
    borderRadius: 36,
  },
  cDomeTop: {
    position: 'absolute',
    left: 72,
    top: 14,
    width: 78,
    height: 78,
    borderRadius: 39,
  },
  cBumpRight: {
    position: 'absolute',
    left: 122,
    top: 38,
    width: 58,
    height: 50,
    borderRadius: 30,
  },
  cShadeBar: {
    position: 'absolute',
    left: 32,
    top: 84,
    width: 120,
    height: 10,
    borderRadius: 6,
    opacity: 0.45,
  },

  // ── Tiny cloud ──
  tinyCloudWrap: { position: 'relative', width: 80, height: 44 },
  tcBase: {
    position: 'absolute',
    left: 6,
    top: 22,
    width: 66,
    height: 20,
    borderRadius: 12,
  },
  tcDomeL: {
    position: 'absolute',
    left: 8,
    top: 12,
    width: 28,
    height: 26,
    borderRadius: 14,
  },
  tcDomeR: {
    position: 'absolute',
    left: 28,
    top: 6,
    width: 34,
    height: 30,
    borderRadius: 17,
  },

  // ── Rain ──
  rainDrop: {
    position: 'absolute',
    top: -55,
    width: 2,
    borderRadius: 2,
    backgroundColor: '#A8D8F0',
  },

  // ── Snow ──
  snow: { position: 'absolute', top: -24, backgroundColor: '#EEF5FA' },

  // ── Stars & moon ──
  star: { position: 'absolute', backgroundColor: '#FFFFFF' },
  shootingStar: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 55,
    height: 1.5,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.9,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  moonWrap: {
    position: 'absolute',
    right: 38,
    top: 32,
    width: 62,
    height: 62,
  },
  moonBody: {
    position: 'absolute',
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#F0F4FF',
    shadowColor: '#C8D4FF',
    shadowOpacity: 0.55,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  moonMask: {
    position: 'absolute',
    right: -10,
    top: 6,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#0C2040',
  },

  // ── Fog ──
  fogBar: {
    position: 'absolute',
    left: -24,
    height: 18,
    borderRadius: 18,
    backgroundColor: '#D8E4EA',
  },

  // ── Storm ──
  flash: { ...StyleSheet.absoluteFillObject, backgroundColor: '#FFFFFF' },
  boltWrap: {
    position: 'absolute',
    right: 58,
    top: 62,
    width: 48,
    height: 80,
    zIndex: 2,
  },
  boltTop: {
    position: 'absolute',
    left: 18,
    top: 0,
    width: 16,
    height: 44,
    backgroundColor: '#FDE68A',
    transform: [{ skewX: '-22deg' }, { rotate: '10deg' }],
  },
  boltBottom: {
    position: 'absolute',
    left: 8,
    top: 30,
    width: 16,
    height: 44,
    backgroundColor: '#FDE68A',
    transform: [{ skewX: '-22deg' }, { rotate: '10deg' }],
  },

  // ── Full screen bg ──
  bgFogBar: {
    position: 'absolute',
    left: -40,
    top: 160,
    width: width + 80,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#C8D4DA',
  },
  bgRainDrop: {
    position: 'absolute',
    top: -60,
    width: 1.8,
    borderRadius: 2,
    backgroundColor: '#A8D0E8',
  },
});
