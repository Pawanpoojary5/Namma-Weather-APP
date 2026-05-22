import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

const { width, height } = Dimensions.get('window');
const CARD_H = 200;

const list = count => Array.from({ length: count }, (_, index) => index);

const stopLoop = animation => {
  animation.stop();
};

const CloudShape = ({
  color = '#E8F0F4',
  shade = '#A9BAC3',
  scale = 1,
  opacity = 1,
  style,
}) => (
  <View style={[s.cloudBox, style, { opacity, transform: [{ scale }] }]}>
    <View style={[s.cloudBaseShade, { backgroundColor: shade }]} />
    <View style={[s.cloudBall1, { backgroundColor: color }]} />
    <View style={[s.cloudBall2, { backgroundColor: color }]} />
    <View style={[s.cloudBall3, { backgroundColor: color }]} />
    <View style={[s.cloudBase, { backgroundColor: color }]} />
    <View style={[s.cloudBottomShade, { backgroundColor: shade }]} />
  </View>
);

const DriftingCloud = ({
  top,
  scale,
  duration,
  delay,
  opacity,
  color,
  shade,
}) => {
  const x = useRef(new Animated.Value(-180)).current;

  useEffect(() => {
    x.setValue(-180);

    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(x, {
          toValue: width + 220,
          duration,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => {
      stopLoop(animation);
      x.stopAnimation();
    };
  }, [delay, duration, x]);

  return (
    <Animated.View
      style={[
        s.absolute,
        {
          top,
          transform: [{ translateX: x }],
        },
      ]}
    >
      <CloudShape scale={scale} opacity={opacity} color={color} shade={shade} />
    </Animated.View>
  );
};

const SunRays = ({ accent }) => {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 18000,
        useNativeDriver: true,
      }),
    );

    animation.start();

    return () => {
      stopLoop(animation);
      spin.stopAnimation();
    };
  }, [spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View style={[s.sunRaysWrap, { transform: [{ rotate }] }]}>
      {list(12).map(index => (
        <View
          key={index}
          style={[
            s.sunRay,
            {
              backgroundColor: accent || '#FACC15',
              transform: [{ rotate: `${index * 30}deg` }, { translateY: -58 }],
            },
          ]}
        />
      ))}
    </Animated.View>
  );
};

const RainDrop = ({ left, delay, duration, dropHeight, opacity }) => {
  const y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    y.setValue(0);

    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(y, {
          toValue: 1,
          duration,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => {
      stopLoop(animation);
      y.stopAnimation();
    };
  }, [delay, duration, y]);

  const translateY = y.interpolate({
    inputRange: [0, 1],
    outputRange: [-50, CARD_H + 70],
  });

  return (
    <Animated.View
      style={[
        s.rainDrop,
        {
          left,
          height: dropHeight,
          opacity,
          transform: [{ translateY }, { rotate: '13deg' }],
        },
      ]}
    />
  );
};

const SnowFlake = ({ left, size, delay, duration, drift }) => {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);

    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(progress, {
          toValue: 1,
          duration,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => {
      stopLoop(animation);
      progress.stopAnimation();
    };
  }, [delay, duration, progress]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-24, CARD_H + 32],
  });

  const translateX = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, drift, 0],
  });

  const opacity = progress.interpolate({
    inputRange: [0, 0.12, 0.85, 1],
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

const Star = ({ left, top, size, delay }) => {
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.28,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => {
      stopLoop(animation);
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

const FogBar = ({ top, barWidth, delay, duration, maxOpacity }) => {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(progress, {
          toValue: 1,
          duration,
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => {
      stopLoop(animation);
      progress.stopAnimation();
    };
  }, [delay, duration, progress]);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-48, 48],
  });

  const opacity = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [maxOpacity * 0.45, maxOpacity, maxOpacity * 0.45],
  });

  return (
    <Animated.View
      style={[
        s.fogBar,
        {
          top,
          width: barWidth,
          opacity,
          transform: [{ translateX }],
        },
      ]}
    />
  );
};

const SunnyScene = ({ accent }) => (
  <LinearGradient colors={['#164E63', '#0F172A']} style={s.fill}>
    <View style={s.sunWrap}>
      <SunRays accent={accent} />
      <View style={[s.sunCircle, { backgroundColor: accent || '#FACC15' }]} />
    </View>

    <DriftingCloud
      top={38}
      scale={0.35}
      duration={34000}
      delay={0}
      opacity={0.28}
      color="#FFFFFF"
      shade="#C8D8DE"
    />
    <DriftingCloud
      top={96}
      scale={0.45}
      duration={28000}
      delay={900}
      opacity={0.38}
      color="#FFFFFF"
      shade="#C8D8DE"
    />
    <DriftingCloud
      top={136}
      scale={0.32}
      duration={39000}
      delay={1500}
      opacity={0.24}
      color="#FFFFFF"
      shade="#C8D8DE"
    />
  </LinearGradient>
);

const PartlyCloudyScene = ({ accent }) => {
  const opacity = useRef(new Animated.Value(0.65)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.65,
          duration: 2000,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => {
      stopLoop(animation);
      opacity.stopAnimation();
    };
  }, [opacity]);

  return (
    <LinearGradient colors={['#334155', '#0F172A']} style={s.fill}>
      <View style={[s.halfSun, { backgroundColor: accent || '#FACC15' }]} />

      <Animated.View style={{ opacity }}>
        <CloudShape
          style={{ top: 78, left: 72 }}
          scale={1.05}
          color="#E8F0F4"
          shade="#A9BAC3"
        />
      </Animated.View>

      <DriftingCloud
        top={30}
        scale={0.34}
        duration={30000}
        delay={0}
        opacity={0.32}
        color="#CBD5E1"
        shade="#94A3B8"
      />
      <DriftingCloud
        top={130}
        scale={0.3}
        duration={38000}
        delay={800}
        opacity={0.24}
        color="#CBD5E1"
        shade="#94A3B8"
      />
    </LinearGradient>
  );
};

const CloudyScene = () => (
  <LinearGradient colors={['#334155', '#111827']} style={s.fill}>
    <DriftingCloud
      top={30}
      scale={0.48}
      duration={36000}
      delay={0}
      opacity={0.36}
      color="#94A3B8"
      shade="#64748B"
    />
    <DriftingCloud
      top={78}
      scale={0.9}
      duration={30000}
      delay={700}
      opacity={0.82}
      color="#CBD5E1"
      shade="#7C8D99"
    />
    <DriftingCloud
      top={126}
      scale={0.55}
      duration={42000}
      delay={1400}
      opacity={0.45}
      color="#94A3B8"
      shade="#64748B"
    />
  </LinearGradient>
);

const RainScene = ({ heavy = false }) => {
  const drops = useMemo(
    () =>
      list(heavy ? 30 : 22).map(index => ({
        left: (index * 23) % Math.max(width - 30, 280),
        delay: index * (heavy ? 45 : 80),
        duration: heavy ? 520 : 760,
        dropHeight: heavy ? 34 : 26,
        opacity: heavy ? 0.78 : 0.58,
      })),
    [heavy],
  );

  return (
    <LinearGradient colors={['#1E293B', '#020617']} style={s.fill}>
      <DriftingCloud
        top={20}
        scale={0.72}
        duration={26000}
        delay={0}
        opacity={0.34}
        color="#64748B"
        shade="#475569"
      />
      <DriftingCloud
        top={70}
        scale={0.48}
        duration={32000}
        delay={900}
        opacity={0.26}
        color="#64748B"
        shade="#475569"
      />
      <DriftingCloud
        top={116}
        scale={0.36}
        duration={39000}
        delay={1600}
        opacity={0.2}
        color="#64748B"
        shade="#475569"
      />

      {drops.map(item => (
        <RainDrop key={`${item.left}-${item.delay}`} {...item} />
      ))}
    </LinearGradient>
  );
};

const StormScene = () => {
  const flash = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(850),
        Animated.timing(flash, {
          toValue: 0.68,
          duration: 70,
          useNativeDriver: true,
        }),
        Animated.timing(flash, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.delay(260),
        Animated.timing(flash, {
          toValue: 0.38,
          duration: 60,
          useNativeDriver: true,
        }),
        Animated.timing(flash, {
          toValue: 0,
          duration: 170,
          useNativeDriver: true,
        }),
        Animated.delay(1300),
      ]),
    );

    animation.start();

    return () => {
      stopLoop(animation);
      flash.stopAnimation();
    };
  }, [flash]);

  return (
    <View style={s.fill}>
      <RainScene heavy />

      <View style={s.lightningBolt}>
        <View style={s.boltTop} />
        <View style={s.boltBottom} />
      </View>

      <Animated.View style={[s.flash, { opacity: flash }]} />
    </View>
  );
};

const SnowScene = () => {
  const flakes = useMemo(
    () =>
      list(22).map(index => ({
        left: (index * 31) % Math.max(width - 20, 280),
        size: 4 + (index % 4),
        delay: index * 95,
        duration: 4200 + (index % 5) * 320,
        drift: index % 2 === 0 ? 18 : -18,
      })),
    [],
  );

  return (
    <LinearGradient colors={['#DBEAFE', '#64748B']} style={s.fill}>
      {flakes.map(item => (
        <SnowFlake key={`${item.left}-${item.delay}`} {...item} />
      ))}

      <CloudShape
        style={{ top: 36, left: 78 }}
        scale={0.78}
        opacity={0.78}
        color="#FFFFFF"
        shade="#CBD5E1"
      />
    </LinearGradient>
  );
};

const ClearNightScene = () => {
  const stars = useMemo(
    () =>
      list(22).map(index => ({
        left: (index * 37) % Math.max(width - 18, 280),
        top: 18 + ((index * 23) % 122),
        size: 2 + (index % 3),
        delay: index * 130,
      })),
    [],
  );

  return (
    <LinearGradient colors={['#020617', '#172554']} style={s.fill}>
      {stars.map(item => (
        <Star key={`${item.left}-${item.top}`} {...item} />
      ))}

      <View style={s.moon}>
        <View style={s.moonCut} />
      </View>
    </LinearGradient>
  );
};

const FogScene = () => (
  <LinearGradient colors={['#CBD5E1', '#475569']} style={s.fill}>
    <CloudShape
      style={{ top: 35, left: 80 }}
      scale={0.68}
      opacity={0.38}
      color="#E2E8F0"
      shade="#94A3B8"
    />

    <FogBar
      top={66}
      barWidth={260}
      delay={0}
      duration={5200}
      maxOpacity={0.7}
    />
    <FogBar
      top={94}
      barWidth={310}
      delay={400}
      duration={6200}
      maxOpacity={0.55}
    />
    <FogBar
      top={124}
      barWidth={240}
      delay={800}
      duration={5600}
      maxOpacity={0.65}
    />
    <FogBar
      top={150}
      barWidth={285}
      delay={1200}
      duration={7000}
      maxOpacity={0.45}
    />
  </LinearGradient>
);

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

export const SkyBackground = ({ weatherArt, isDay }) => {
  const cloudX = useRef(new Animated.Value(-180)).current;
  const fogX = useRef(new Animated.Value(-80)).current;

  const isFog = weatherArt === 'fog';
  const isStorm = weatherArt === 'storm' || weatherArt === 'rain';
  const showLayer = isStorm || isFog;

  useEffect(() => {
    const cloudAnimation = Animated.loop(
      Animated.timing(cloudX, {
        toValue: width + 180,
        duration: isStorm ? 18000 : 34000,
        useNativeDriver: true,
      }),
    );

    const fogAnimation = Animated.loop(
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
      cloudAnimation.start();
      fogAnimation.start();
    }

    return () => {
      stopLoop(cloudAnimation);
      stopLoop(fogAnimation);
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
                ? '#1E2A44'
                : '#0F172A'
              : '#0A0F1C',
          },
        ]}
      />

      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: isStorm
              ? 'rgba(15, 23, 42, 0.62)'
              : 'rgba(30, 41, 55, 0.28)',
          },
        ]}
      />

      {showLayer && (
        <>
          <Animated.View
            style={{
              position: 'absolute',
              top: 70,
              left: 0,
              transform: [{ translateX: cloudX }],
            }}
          >
            <CloudShape
              scale={0.65}
              opacity={isStorm ? 0.25 : 0.14}
              color="#94A3B8"
              shade="#64748B"
            />
          </Animated.View>

          <Animated.View
            style={[
              s.backgroundFog,
              {
                opacity: isFog ? 0.45 : 0.14,
                transform: [{ translateX: fogX }],
              },
            ]}
          />
        </>
      )}
    </View>
  );
};

const BackgroundRainDrop = ({ left, delay, duration, isHeavy }) => {
  const y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    y.setValue(0);

    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(y, {
          toValue: 1,
          duration,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => {
      stopLoop(animation);
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
        s.backgroundRain,
        {
          left,
          height: isHeavy ? 40 : 26,
          opacity: isHeavy ? 0.45 : 0.25,
          transform: [{ translateY }, { rotate: '13deg' }],
        },
      ]}
    />
  );
};

export const RainSystem = ({ isRaining, isHeavyRain }) => {
  const drops = useMemo(() => {
    const count = isHeavyRain ? 26 : 18;

    return list(count).map(index => ({
      left: (index * 29) % Math.max(width - 20, 280),
      delay: index * (isHeavyRain ? 55 : 95),
      duration: isHeavyRain ? 620 : 900,
    }));
  }, [isHeavyRain]);

  if (!isRaining) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {drops.map(item => (
        <BackgroundRainDrop
          key={`${item.left}-${item.delay}`}
          left={item.left}
          delay={item.delay}
          duration={item.duration}
          isHeavy={isHeavyRain}
        />
      ))}
    </View>
  );
};

const s = StyleSheet.create({
  card: {
    width: '100%',
    height: CARD_H,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
    marginBottom: 18,
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
  absolute: {
    position: 'absolute',
    left: 0,
  },
  sunWrap: {
    position: 'absolute',
    top: 38,
    left: 40,
    width: 110,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sunRaysWrap: {
    position: 'absolute',
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sunRay: {
    position: 'absolute',
    width: 5,
    height: 24,
    borderRadius: 3,
    opacity: 0.82,
  },
  sunCircle: {
    width: 66,
    height: 66,
    borderRadius: 33,
    shadowColor: '#FACC15',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  halfSun: {
    position: 'absolute',
    width: 86,
    height: 86,
    borderRadius: 43,
    top: 42,
    left: 62,
    opacity: 0.95,
  },
  cloudBox: {
    position: 'absolute',
    width: 170,
    height: 112,
  },
  cloudBaseShade: {
    position: 'absolute',
    left: 22,
    top: 70,
    width: 126,
    height: 32,
    borderRadius: 18,
  },
  cloudBall1: {
    position: 'absolute',
    left: 16,
    top: 42,
    width: 62,
    height: 62,
    borderRadius: 31,
  },
  cloudBall2: {
    position: 'absolute',
    left: 54,
    top: 20,
    width: 82,
    height: 82,
    borderRadius: 41,
  },
  cloudBall3: {
    position: 'absolute',
    left: 112,
    top: 48,
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  cloudBase: {
    position: 'absolute',
    left: 28,
    top: 62,
    width: 132,
    height: 42,
    borderRadius: 24,
  },
  cloudBottomShade: {
    position: 'absolute',
    left: 42,
    top: 90,
    width: 98,
    height: 12,
    borderRadius: 8,
    opacity: 0.65,
  },
  rainDrop: {
    position: 'absolute',
    top: -50,
    width: 2.4,
    borderRadius: 2,
    backgroundColor: '#93E6FF',
  },
  snow: {
    position: 'absolute',
    top: -24,
    backgroundColor: '#FFFFFF',
  },
  star: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
  },
  moon: {
    position: 'absolute',
    right: 42,
    top: 38,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#F8FAFC',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.34,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  moonCut: {
    position: 'absolute',
    right: -8,
    top: 4,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#172554',
  },
  fogBar: {
    position: 'absolute',
    left: -20,
    height: 14,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
  },
  flash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
  },
  lightningBolt: {
    position: 'absolute',
    right: 62,
    top: 58,
    width: 52,
    height: 82,
    zIndex: 2,
  },
  boltTop: {
    position: 'absolute',
    left: 20,
    top: 0,
    width: 18,
    height: 48,
    backgroundColor: '#FACC15',
    transform: [{ skewX: '-20deg' }, { rotate: '12deg' }],
  },
  boltBottom: {
    position: 'absolute',
    left: 10,
    top: 34,
    width: 18,
    height: 48,
    backgroundColor: '#FACC15',
    transform: [{ skewX: '-20deg' }, { rotate: '12deg' }],
  },
  backgroundFog: {
    position: 'absolute',
    left: -40,
    top: 150,
    width: width + 80,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#CBD5E1',
  },
  backgroundRain: {
    position: 'absolute',
    top: -60,
    width: 2,
    borderRadius: 2,
    backgroundColor: '#93E6FF',
  },
});
