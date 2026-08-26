import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, Path, Rect, Text as SvgText } from 'react-native-svg';

const LANES = [1, 2, 3];
const TRACK_Y = { 1: 55, 2: 140, 3: 225 };
const ARRIVAL_MS = 4300;
const DEPARTURE_MS = 3700;
const SERVICE_INTERVAL = 8;
const DELAY_MARGIN_SECONDS = 12;
const MOTION_RANGE = [0, 0.16, 0.32, 0.5, 0.68, 0.84, 1];
const BOARD_W = 460;
const BOARD_H = 280;
const PLATFORM_START = 264;
const PLATFORM_END = 430;
const TRAIN_STOP_X = 350;

const DESTINATIONS = [
  { id: 'noorddam', name: 'Noorddam', code: 'NDR' },
  { id: 'havenstad', name: 'Havenstad', code: 'HVN' },
  { id: 'oostpoort', name: 'Oostpoort', code: 'OOS' },
  { id: 'luchthaven', name: 'Luchthaven', code: 'AIR' },
];

const TRAIN_TYPES = [
  { code: 'SPR', name: 'Sprinter S', setLength: 55, setCapacity: 220, minSets: 1, maxSets: 3, dwell: 8, boardRate: 34 },
  { code: 'IC', name: 'Intercity X', setLength: 82, setCapacity: 330, minSets: 1, maxSets: 3, dwell: 10, boardRate: 46 },
  { code: 'EXP', name: 'Express E', setLength: 105, setCapacity: 430, minSets: 1, maxSets: 2, dwell: 12, boardRate: 54 },
];

const LANE_PATTERN = [1, 2, 1, 3, 2, 3, 1, 2, 3, 2];

const SEGMENTS = {
  IN: 'M 15 95 H 85', WIN: 'M 85 95 L 110 110', U0: 'M 110 110 H 135',
  EW_U: 'M 135 110 H 175', EW_L: 'M 135 170 H 175', EW_X1: 'M 135 110 L 175 170', EW_X2: 'M 135 170 L 175 110',
  U1: 'M 175 110 H 195', L1: 'M 175 170 H 195',
  K_U: 'M 195 110 H 235', K_L: 'M 195 170 H 235', K_X1: 'M 195 110 L 235 170', K_X2: 'M 195 170 L 235 110',
  P1: `M 235 110 L 260 55 H ${PLATFORM_END}`,
  P2U: 'M 235 110 L 260 140', P2L: 'M 235 170 L 260 140', P2: `M 260 140 H ${PLATFORM_END}`,
  P3: `M 235 170 L 260 225 H ${PLATFORM_END}`,
  L0: 'M 110 170 H 135', WOUT: 'M 85 185 L 110 170', OUT: 'M 15 185 H 85',
};

const ARRIVAL_ROUTES = {
  1: { segments: ['IN', 'WIN', 'U0', 'EW_U', 'U1', 'K_U', 'P1'], locks: ['EW_TOP', 'K_TOP', 'P1'] },
  2: { segments: ['IN', 'WIN', 'U0', 'EW_U', 'U1', 'K_U', 'P2U', 'P2'], locks: ['EW_TOP', 'K_TOP', 'P2'] },
  3: { segments: ['IN', 'WIN', 'U0', 'EW_X1', 'L1', 'K_L', 'P3'], locks: ['EW_TOP', 'EW_BOTTOM', 'K_BOTTOM', 'P3'] },
};

const DEPARTURE_ROUTES = {
  1: { segments: ['P1', 'K_X2', 'L1', 'EW_L', 'L0', 'WOUT', 'OUT'], locks: ['P1', 'K_TOP', 'K_BOTTOM', 'EW_BOTTOM'] },
  2: { segments: ['P2', 'P2L', 'K_L', 'L1', 'EW_L', 'L0', 'WOUT', 'OUT'], locks: ['P2', 'K_BOTTOM', 'EW_BOTTOM'] },
  3: { segments: ['P3', 'K_L', 'L1', 'EW_L', 'L0', 'WOUT', 'OUT'], locks: ['P3', 'K_BOTTOM', 'EW_BOTTOM'] },
};

const ARRIVAL_POINTS = {
  1: [[15, 95], [85, 95], [110, 110], [175, 110], [235, 110], [260, 55], [TRAIN_STOP_X, 55]],
  2: [[15, 95], [85, 95], [110, 110], [175, 110], [235, 110], [260, 140], [TRAIN_STOP_X, 140]],
  3: [[15, 95], [85, 95], [110, 110], [175, 170], [235, 170], [260, 225], [TRAIN_STOP_X, 225]],
};

const DEPARTURE_POINTS = {
  1: [[TRAIN_STOP_X, 55], [260, 55], [235, 110], [195, 170], [135, 170], [85, 185], [15, 185]],
  2: [[TRAIN_STOP_X, 140], [260, 140], [235, 170], [195, 170], [135, 170], [85, 185], [15, 185]],
  3: [[TRAIN_STOP_X, 225], [260, 225], [235, 170], [195, 170], [135, 170], [85, 185], [15, 185]],
};

const routesConflict = (a, b) => Boolean(a && b && a.locks.some((lock) => b.locks.includes(lock)));
const pct = (value, max) => Math.max(0, Math.min(100, Math.round((value / Math.max(1, max)) * 100)));
const serviceLane = (service) => service?.actualLane || service?.plannedLane || null;

const formatClock = (seconds) => {
  const base = 8 * 3600 + Math.max(0, Math.round(seconds));
  const h = Math.floor(base / 3600) % 24;
  const m = Math.floor((base % 3600) / 60);
  const s = base % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const departureInfo = (train, now) => {
  if (!train) return null;
  const departureAt = train.departureAt ?? train.scheduledAt;
  const marginEnd = departureAt + DELAY_MARGIN_SECONDS;
  const untilDeparture = departureAt - now;
  if (untilDeparture > 0) {
    return {
      state: 'early',
      title: `VERTREK VANAF ${formatClock(departureAt)}`,
      detail: `nog ${untilDeparture}s`,
      marginLeft: DELAY_MARGIN_SECONDS,
      canTimeDepart: false,
    };
  }
  const marginLeft = marginEnd - now;
  if (marginLeft >= 0) {
    return {
      state: 'window',
      title: 'VERTREK TOEGESTAAN',
      detail: `${marginLeft}s binnen marge`,
      marginLeft,
      canTimeDepart: true,
    };
  }
  return {
    state: 'late',
    title: `+${Math.abs(marginLeft)}s BUITEN MARGE`,
    detail: 'vertrek zo snel mogelijk',
    marginLeft: 0,
    canTimeDepart: true,
  };
};

const nextServiceForDestination = (destinationId, timetable) => timetable
  .filter((service) => service.destination.id === destinationId && !['departed', 'departing'].includes(service.status))
  .sort((a, b) => a.scheduledAt - b.scheduledAt)[0] || null;

const assignedLaneForDestination = (destinationId, timetable) => serviceLane(nextServiceForDestination(destinationId, timetable));
const unitWidth = (train) => train.type.code === 'EXP' ? 38 : train.type.code === 'IC' ? 34 : 28;
const consistWidth = (train) => train.sets * unitWidth(train) + Math.max(0, train.sets - 1) * 5;

function movementPosition(progress, points, scaleX, scaleY, train) {
  const width = consistWidth(train);
  return {
    x: progress.interpolate({ inputRange: MOTION_RANGE, outputRange: points.map(([x]) => x * scaleX - width / 2) }),
    y: progress.interpolate({ inputRange: MOTION_RANGE, outputRange: points.map(([, y]) => y * scaleY - 15) }),
  };
}

function RouteHighlight({ route, color }) {
  if (!route) return null;
  return route.segments.map((id) => <Path key={`${color}-${id}`} d={SEGMENTS[id]} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />);
}

function Signal({ x, y, green, label }) {
  return (
    <>
      <Path d={`M ${x} ${y + 8} V ${y + 22}`} stroke="#74808b" strokeWidth="3" />
      <Rect x={x - 7} y={y - 10} width="14" height="20" rx="4" fill="#101820" stroke="#697580" strokeWidth="1.5" />
      <Circle cx={x} cy={y - 3} r="4.4" fill={green ? '#38e27d' : '#ff4d5f'} />
      <SvgText x={x - 11} y={y + 33} fill="#71808d" fontSize="8" fontWeight="800">{label}</SvgText>
    </>
  );
}

function TrainConsist({ train, detail, style, onPress, departureState }) {
  const width = unitWidth(train);
  const content = (
    <>
      <View style={styles.consistUnits}>
        {Array.from({ length: train.sets }).map((_, index) => (
          <React.Fragment key={`${train.id}-unit-${index}`}>
            {index > 0 ? <View style={styles.coupler} /> : null}
            <View style={[styles.consistUnit, { width }]}>
              <View style={styles.cabBand} />
              <View style={styles.windowsRow}><View style={styles.windowDot} /><View style={styles.windowDot} />{width >= 34 ? <View style={styles.windowDot} /> : null}</View>
              <Text style={styles.consistCode}>{train.type.code}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>
      <Text numberOfLines={1} style={styles.consistId}>{train.id}</Text>
      <Text numberOfLines={1} style={styles.consistDetail}>{detail || train.destination.name}</Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        hitSlop={12}
        onPress={onPress}
        style={[
          styles.consistWrap,
          styles.consistTouchable,
          departureState === 'window' && styles.consistReady,
          departureState === 'late' && styles.consistLate,
          style,
        ]}
      >
        {content}
      </Pressable>
    );
  }
  return <View pointerEvents="none" style={[styles.consistWrap, style]}>{content}</View>;
}

function DispatcherTableau({ boardSize, onLayout, platforms, arrivalTrain, arrivalLane, arrivalProgress, departureTrain, departureLane, departureProgress, onTrainPress, now }) {
  const scaleX = boardSize.width / BOARD_W || 1;
  const scaleY = boardSize.height / BOARD_H || 1;
  const arrivalPos = arrivalTrain ? movementPosition(arrivalProgress, ARRIVAL_POINTS[arrivalLane || 1], scaleX, scaleY, arrivalTrain) : null;
  const departurePos = departureTrain ? movementPosition(departureProgress, DEPARTURE_POINTS[departureLane || 1], scaleX, scaleY, departureTrain) : null;

  return (
    <View style={styles.tableauFrame}>
      <View style={styles.tableauHeader}><Text style={styles.tableauTitle}>STATIONSSPOREN — TIK OP TREIN VOOR VERTREK</Text><Text style={styles.tableauStatus}>{arrivalTrain && departureTrain ? '2 BEWEGINGEN' : arrivalTrain || departureTrain ? 'TREIN IN BEWEGING' : 'BEDIENING'}</Text></View>
      <View style={styles.svgArea} onLayout={(e) => onLayout(e.nativeEvent.layout)}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}>
          <Rect x="1" y="1" width={BOARD_W - 2} height={BOARD_H - 2} rx="10" fill="#081016" stroke="#26343f" strokeWidth="2" />
          {LANES.map((lane) => (
            <React.Fragment key={`platform-${lane}`}>
              <Rect x={PLATFORM_START} y={TRACK_Y[lane] + 10} width={PLATFORM_END - PLATFORM_START} height="12" rx="3" fill="#18242c" stroke="#3c4c56" strokeWidth="1" />
              <Path d={`M ${PLATFORM_START + 4} ${TRACK_Y[lane] + 13} H ${PLATFORM_END - 4}`} stroke="#6e7d86" strokeWidth="1" strokeDasharray="4 4" />
              <SvgText x={PLATFORM_END - 2} y={TRACK_Y[lane] + 35} fill="#657681" fontSize="7.5" fontWeight="900" textAnchor="end">P{lane}</SvgText>
            </React.Fragment>
          ))}
          {Object.entries(SEGMENTS).map(([id, d]) => <Path key={id} d={d} fill="none" stroke="#45525c" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />)}
          {LANES.map((lane) => platforms[lane] ? <Path key={`occ-${lane}`} d={`M ${PLATFORM_START + 4} ${TRACK_Y[lane]} H ${PLATFORM_END}`} fill="none" stroke="#ff4d6d" strokeWidth="8" strokeLinecap="round" /> : null)}
          <RouteHighlight route={arrivalTrain ? ARRIVAL_ROUTES[arrivalLane] : null} color="#ffd65a" />
          <RouteHighlight route={departureTrain ? DEPARTURE_ROUTES[departureLane] : null} color="#66d8ff" />
          <Rect x="132" y="103" width="46" height="74" rx="5" fill="none" stroke="#657783" strokeWidth="1" strokeDasharray="3 3" />
          <SvgText x="139" y="99" fill="#9aa8b1" fontSize="8" fontWeight="900">EW1</SvgText>
          <Circle cx="215" cy="140" r="7" fill="#0b151d" stroke="#657783" strokeWidth="1.5" />
          <Signal x={52} y={70} green={Boolean(arrivalTrain)} label="S1" />
          <Signal x={52} y={210} green={Boolean(departureTrain)} label="S2" />
          {LANES.map((lane) => <Signal key={lane} x={286} y={TRACK_Y[lane] - 23} green={Boolean(departureTrain) && departureLane === lane} label={`D${lane}`} />)}
          <SvgText x="13" y="84" fill="#6f808b" fontSize="8" fontWeight="800">WEST IN →</SvgText>
          <SvgText x="13" y="204" fill="#6f808b" fontSize="8" fontWeight="800">← WEST UIT</SvgText>
        </Svg>

        {boardSize.width > 0 && LANES.map((lane) => {
          const train = platforms[lane];
          if (!train || (departureTrain && departureTrain.id === train.id)) return null;
          const width = consistWidth(train);
          const timing = departureInfo(train, now);
          const visualState = train.status === 'ready' && timing?.canTimeDepart ? timing.state : 'early';
          return (
            <TrainConsist
              key={train.id}
              train={train}
              detail={train.status === 'ready' ? (timing?.state === 'window' ? `VERTREK • ${timing.marginLeft}s` : timing?.state === 'late' ? 'VERTREK NU' : `OVER ${Math.max(0, train.departureAt - now)}s`) : `${train.remaining}s HALTE`}
              departureState={visualState}
              onPress={() => onTrainPress(lane)}
              style={{ position: 'absolute', left: TRAIN_STOP_X * scaleX - width / 2, top: TRACK_Y[lane] * scaleY - 15 }}
            />
          );
        })}
        {boardSize.width > 0 && arrivalTrain && arrivalPos ? <Animated.View pointerEvents="none" style={[styles.movingConsist, { transform: [{ translateX: arrivalPos.x }, { translateY: arrivalPos.y }] }]}><TrainConsist train={arrivalTrain} detail={`→ ${arrivalTrain.destination.name}`} /></Animated.View> : null}
        {boardSize.width > 0 && departureTrain && departurePos ? <Animated.View pointerEvents="none" style={[styles.movingConsist, { transform: [{ translateX: departurePos.x }, { translateY: departurePos.y }] }]}><TrainConsist train={departureTrain} detail={`→ ${departureTrain.destination.name}`} /></Animated.View> : null}
      </View>
    </View>
  );
}

function TrainComposition({ train, onPress, canDepart }) {
  const body = (
    <View style={styles.compositionRow}>
      {Array.from({ length: train.sets }).map((_, index) => (
        <React.Fragment key={index}>{index > 0 ? <View style={styles.compositionCoupler} /> : null}<View style={[styles.setBlock, canDepart && styles.setBlockReady, { flexBasis: `${Math.min(32, 100 / train.sets)}%` }]}><Text style={styles.setBlockText}>{train.type.code} {index + 1}</Text></View></React.Fragment>
      ))}
    </View>
  );
  if (!onPress) return body;
  return <Pressable hitSlop={8} onPress={onPress}>{body}</Pressable>;
}

function DestinationBoard({ passengers, timetable }) {
  return (
    <View style={styles.destinationBoard}>
      <View style={styles.cardTitleRow}><Text style={styles.sectionLabel}>REIZIGERS IN STATION</Text><Text style={styles.queueCount}>{Object.values(passengers).reduce((a, b) => a + b, 0)} totaal</Text></View>
      {DESTINATIONS.map((destination) => {
        const service = nextServiceForDestination(destination.id, timetable);
        const lane = serviceLane(service);
        return (
          <View key={destination.id} style={styles.destinationRow}>
            <View style={styles.destinationNameWrap}><Text style={styles.destinationName}>{destination.name}</Text><Text style={styles.destinationSub}>{service ? `${service.id} • vertrek ${formatClock(service.departureAt).slice(0, 5)}` : 'geen trein gepland'}</Text></View>
            <Text style={styles.destinationCount}>{passengers[destination.id] || 0}</Text>
            <View style={styles.platformBadge}><Text style={styles.platformBadgeText}>{lane ? `P${lane}` : '—'}</Text></View>
          </View>
        );
      })}
    </View>
  );
}

function Timetable({ timetable, now }) {
  const visible = timetable.filter((s) => s.status !== 'departed').slice(0, 6);
  const statusText = (service) => {
    if (service.status === 'scheduled') return service.scheduledAt > now ? `in ${service.scheduledAt - now}s` : 'AANMELDEN';
    if (service.status === 'waiting') return `WACHT P${service.plannedLane}`;
    if (service.status === 'arriving') return `→ P${service.actualLane}`;
    if (service.status === 'at_platform') {
      const timing = departureInfo(service, now);
      if (timing.state === 'early') return `V over ${service.departureAt - now}s`;
      if (timing.state === 'window') return `V ${timing.marginLeft}s marge`;
      return `V +${now - service.departureAt}s`;
    }
    if (service.status === 'departing') return 'VERTREKT';
    return service.status;
  };
  return (
    <View style={styles.timetableCard}>
      <View style={styles.cardTitleRow}><Text style={styles.sectionLabel}>DIENSTREGELING</Text><Text style={styles.clock}>{formatClock(now)}</Text></View>
      {visible.map((service) => (
        <View key={service.serviceId} style={styles.serviceRow}>
          <Text style={styles.serviceTime}>{formatClock(service.departureAt).slice(0, 5)}</Text>
          <View style={styles.serviceMain}><Text style={styles.serviceId}>{service.id}</Text><Text style={styles.serviceDestination}>→ {service.destination.name} • aank. {formatClock(service.scheduledAt).slice(0, 5)}</Text></View>
          <Text style={styles.servicePlan}>P{service.plannedLane}</Text>
          <Text style={[styles.serviceStatus, service.status === 'waiting' && styles.serviceStatusWarning]}>{statusText(service)}</Text>
        </View>
      ))}
    </View>
  );
}

function PlatformCard({ lane, train, demandGroups, onTrainPress, departureBlocked, now }) {
  const waitingHere = demandGroups.reduce((sum, item) => sum + item.count, 0);
  if (!train) {
    return (
      <View style={styles.platformCard}>
        <View style={styles.platformTop}><Text style={styles.platformTitle}>PERRON {lane}</Text><Text style={styles.freeBadge}>VRIJ</Text></View>
        <View style={styles.platformSchematic}><View style={styles.platformEdge} /><Text style={styles.platformLengthLabel}>240 m perron</Text></View>
        <Text style={styles.waitingBig}>{waitingHere}</Text><Text style={styles.waitingLabel}>reizigers op dit perron</Text>
        <View style={styles.demandList}>{demandGroups.length ? demandGroups.map((item) => <Text key={item.destination.id} style={styles.demandText}>{item.destination.name} {item.count}</Text>) : <Text style={styles.demandTextMuted}>Geen reizigers toegewezen</Text>}</View>
      </View>
    );
  }

  const fill = pct(train.onboard, train.capacity);
  const matchingWaiting = demandGroups.find((item) => item.destination.id === train.destination.id)?.count || 0;
  const timing = departureInfo(train, now);
  const canDepart = train.status === 'ready' && timing.canTimeDepart && !departureBlocked;
  const timingStyle = timing.state === 'window' ? styles.departureTimingReady : timing.state === 'late' ? styles.departureTimingLate : styles.departureTimingEarly;

  return (
    <View style={[styles.platformCard, canDepart && styles.platformCardReady]}>
      <View style={styles.platformTop}>
        <View><Text style={styles.platformTitle}>PERRON {lane}</Text><Text style={styles.trainName}>{train.id} → {train.destination.name}</Text></View>
        <Text style={[styles.statusBadge, train.status === 'ready' && styles.readyBadge]}>{train.status === 'ready' ? 'GEREED' : train.status === 'departing' ? 'VERTREKT' : `${train.remaining}s HALTE`}</Text>
      </View>

      <Pressable hitSlop={8} onPress={() => onTrainPress(lane)} style={styles.platformTrainTap}>
        <View style={styles.platformSchematic}>
          <View style={styles.platformEdge} />
          <TrainComposition train={train} canDepart={canDepart} />
          <Text style={styles.platformLengthLabel}>{train.length} m • {train.sets} stellen • tik op trein</Text>
        </View>
      </Pressable>

      <View style={[styles.departureTiming, timingStyle]}>
        <View><Text style={styles.departureTimingLabel}>GEPLAND VERTREK</Text><Text style={styles.departureTimingClock}>{formatClock(train.departureAt)}</Text></View>
        <View style={styles.departureTimingRight}><Text style={styles.departureTimingTitle}>{departureBlocked ? 'RIJWEG BEZET' : timing.title}</Text><Text style={styles.departureTimingDetail}>{departureBlocked ? 'wacht tot rijweg vrij is' : timing.detail}</Text></View>
      </View>

      <View style={styles.exchangeRow}>
        <View style={styles.exchangeCell}><Text style={styles.exchangeLabel}>UITGESTAPT</Text><Text style={styles.exchangeValue}>{train.lastAlight || 0}</Text></View>
        <View style={styles.exchangeCell}><Text style={styles.exchangeLabel}>OVERSTAP</Text><Text style={styles.exchangeValue}>{train.lastTransfer || 0}</Text></View>
        <View style={styles.exchangeCell}><Text style={styles.exchangeLabel}>IN TREIN</Text><Text style={styles.exchangeValue}>{train.onboard}/{train.capacity}</Text></View>
      </View>
      <View style={styles.boardingRow}><Text style={styles.boardingLabel}>WACHT VOOR {train.destination.name.toUpperCase()}</Text><Text style={styles.boardingValue}>{matchingWaiting} • trein {fill}% vol</Text></View>
      <View style={styles.demandList}>{demandGroups.map((item) => <Text key={item.destination.id} style={[styles.demandText, item.destination.id === train.destination.id && styles.demandTextActive]}>{item.destination.name} {item.count}</Text>)}</View>
      <Text style={[styles.tapHint, canDepart && styles.tapHintReady]}>{canDepart ? 'TIK OP DE TREIN OM TE VERTREKKEN' : train.status !== 'ready' ? 'Nog bezig met reizigerswissel' : timing.state === 'early' ? `Vertrek toegestaan over ${train.departureAt - now}s` : departureBlocked ? 'Wacht op vrije uitrijweg' : 'Tik op de trein'}</Text>
    </View>
  );
}

export default function App() {
  const [phase, setPhase] = useState('menu');
  const [serviceTime, setServiceTime] = useState(0);
  const [timetable, setTimetable] = useState([]);
  const [passengers, setPassengers] = useState({ noorddam: 90, havenstad: 120, oostpoort: 70, luchthaven: 100 });
  const [outside, setOutside] = useState([]);
  const [platforms, setPlatforms] = useState({ 1: null, 2: null, 3: null });
  const [arrivalTrain, setArrivalTrain] = useState(null);
  const [arrivalLane, setArrivalLane] = useState(null);
  const [departureTrain, setDepartureTrain] = useState(null);
  const [departureLane, setDepartureLane] = useState(null);
  const [boardSize, setBoardSize] = useState({ width: 0, height: 0 });
  const [message, setMessage] = useState('');
  const [handled, setHandled] = useState(0);
  const [departedPassengers, setDepartedPassengers] = useState(0);
  const [delay, setDelay] = useState(0);
  const [platformChanges, setPlatformChanges] = useState(0);

  const arrivalProgress = useRef(new Animated.Value(0)).current;
  const departureProgress = useRef(new Animated.Value(0)).current;
  const timeRef = useRef(0);
  const timetableRef = useRef([]);
  const passengersRef = useRef({ noorddam: 90, havenstad: 120, oostpoort: 70, luchthaven: 100 });
  const outsideRef = useRef([]);
  const platformsRef = useRef({ 1: null, 2: null, 3: null });
  const arrivalBusyRef = useRef(false);
  const departureBusyRef = useRef(false);
  const arrivalLaneRef = useRef(null);
  const departureLaneRef = useRef(null);
  const sequence = useRef(1700);
  const serviceCounter = useRef(0);
  const nextServiceAt = useRef(3);

  const syncTimetable = (next) => { timetableRef.current = next; setTimetable(next); };
  const syncPassengers = (next) => { passengersRef.current = next; setPassengers(next); };
  const syncOutside = (next) => { outsideRef.current = next; setOutside(next); };
  const syncPlatforms = (next) => { platformsRef.current = next; setPlatforms(next); };

  const createService = (scheduledAt) => {
    const index = serviceCounter.current++;
    sequence.current += index % 3 === 0 ? 4 : 2;
    const type = TRAIN_TYPES[index % TRAIN_TYPES.length];
    const destination = DESTINATIONS[index % DESTINATIONS.length];
    const plannedLane = LANE_PATTERN[index % LANE_PATTERN.length];
    const sets = type.minSets + (index % (type.maxSets - type.minSets + 1));
    const capacity = type.setCapacity * sets;
    const onboard = Math.round(capacity * (0.45 + ((index * 13) % 35) / 100));
    const departureAt = scheduledAt + Math.ceil(ARRIVAL_MS / 1000) + type.dwell;
    return {
      serviceId: `svc-${index}-${scheduledAt}`,
      id: `${type.code} ${sequence.current}`,
      type,
      destination,
      plannedLane,
      actualLane: null,
      scheduledAt,
      departureAt,
      sets,
      length: type.setLength * sets,
      capacity,
      onboard,
      status: 'scheduled',
      wait: 0,
    };
  };

  const updateService = (serviceId, patch) => {
    const next = timetableRef.current.map((service) => service.serviceId === serviceId ? { ...service, ...patch } : service);
    syncTimetable(next);
  };

  const arrivalConflict = (lane) => departureBusyRef.current && routesConflict(ARRIVAL_ROUTES[lane], DEPARTURE_ROUTES[departureLaneRef.current]);
  const departureConflict = (lane) => arrivalBusyRef.current && routesConflict(DEPARTURE_ROUTES[lane], ARRIVAL_ROUTES[arrivalLaneRef.current]);

  const addTransfers = (count, avoidDestinationId) => {
    if (!count) return passengersRef.current;
    const next = { ...passengersRef.current };
    const choices = DESTINATIONS.filter((d) => d.id !== avoidDestinationId);
    let remaining = count;
    choices.forEach((destination, index) => {
      const amount = index === choices.length - 1 ? remaining : Math.min(remaining, Math.round(count / choices.length));
      next[destination.id] += amount;
      remaining -= amount;
    });
    return next;
  };

  const startArrival = (train, lane, diverted = false) => {
    if (!train || arrivalBusyRef.current || platformsRef.current[lane] || arrivalConflict(lane)) return false;
    arrivalBusyRef.current = true;
    arrivalLaneRef.current = lane;
    syncOutside(outsideRef.current.filter((item) => item.serviceId !== train.serviceId));
    updateService(train.serviceId, { status: 'arriving', actualLane: lane });
    const movingTrain = { ...train, actualLane: lane };
    setArrivalTrain(movingTrain);
    setArrivalLane(lane);
    arrivalProgress.setValue(0);
    if (diverted) {
      setPlatformChanges((value) => value + 1);
      setMessage(`Perronwijziging: ${train.id} wijkt uit van P${train.plannedLane} naar P${lane}. Reizigers lopen om.`);
    } else {
      setMessage(`${train.id} naar ${train.destination.name} rijdt automatisch binnen op P${lane}.`);
    }

    Animated.timing(arrivalProgress, { toValue: 1, duration: ARRIVAL_MS, useNativeDriver: true }).start(({ finished }) => {
      arrivalBusyRef.current = false;
      arrivalLaneRef.current = null;
      if (!finished) return;
      const alight = Math.min(movingTrain.onboard, Math.round(movingTrain.onboard * (0.24 + Math.random() * 0.20)));
      const transfer = Math.round(alight * (0.28 + Math.random() * 0.30));
      const remainingOnboard = Math.max(0, movingTrain.onboard - alight);
      const platformTrain = {
        ...movingTrain,
        lane,
        onboard: remainingOnboard,
        status: 'dwelling',
        remaining: movingTrain.type.dwell,
        readyWait: 0,
        lastAlight: alight,
        lastTransfer: transfer,
      };
      syncPassengers(addTransfers(transfer, movingTrain.destination.id));
      syncPlatforms({ ...platformsRef.current, [lane]: platformTrain });
      updateService(movingTrain.serviceId, { status: 'at_platform', actualLane: lane });
      setArrivalTrain(null);
      setArrivalLane(null);
      setMessage(`${movingTrain.id} op P${lane}: ${alight} uitgestapt, ${transfer} stappen over. Vertrek gepland ${formatClock(movingTrain.departureAt)}.`);
      setTimeout(() => tryAutoArrival(), 80);
    });
    return true;
  };

  const tryAutoArrival = () => {
    if (arrivalBusyRef.current || outsideRef.current.length === 0) return;
    const train = outsideRef.current[0];
    const lane = train.plannedLane;
    if (platformsRef.current[lane] || arrivalConflict(lane)) return;
    startArrival(train, lane, false);
  };

  const divertOutside = (lane) => {
    const train = outsideRef.current[0];
    if (!train || lane === train.plannedLane || platformsRef.current[lane]) return;
    if (arrivalConflict(lane)) { setMessage(`P${lane} is vrij, maar de rijweg is bezet.`); return; }
    startArrival(train, lane, true);
  };

  const depart = (lane) => {
    const train = platformsRef.current[lane];
    if (!train || departureBusyRef.current) return;
    if (train.status !== 'ready') {
      setMessage(`${train.id} kan nog niet vertrekken: reizigerswissel nog ${train.remaining || 0}s.`);
      return;
    }
    const timing = departureInfo(train, timeRef.current);
    if (!timing.canTimeDepart) {
      setMessage(`${train.id} mag nog niet vertrekken. Gepland vertrek ${formatClock(train.departureAt)} — nog ${train.departureAt - timeRef.current}s.`);
      return;
    }
    if (departureConflict(lane)) {
      setMessage(`${train.id} mag qua tijd vertrekken, maar de uitrijweg is nog bezet.`);
      return;
    }

    departureBusyRef.current = true;
    departureLaneRef.current = lane;
    const departureDelay = Math.max(0, timeRef.current - train.departureAt);
    syncPlatforms({ ...platformsRef.current, [lane]: { ...train, status: 'departing' } });
    updateService(train.serviceId, { status: 'departing', actualDepartureAt: timeRef.current, departureDelay });
    setDepartureTrain(train);
    setDepartureLane(lane);
    departureProgress.setValue(0);
    setMessage(`${train.id} vertrekt naar ${train.destination.name}. ${departureDelay <= DELAY_MARGIN_SECONDS ? `Binnen marge (${Math.max(0, DELAY_MARGIN_SECONDS - departureDelay)}s over).` : `+${departureDelay - DELAY_MARGIN_SECONDS}s buiten marge.`}`);

    Animated.timing(departureProgress, { toValue: 1, duration: DEPARTURE_MS, useNativeDriver: true }).start(({ finished }) => {
      departureBusyRef.current = false;
      departureLaneRef.current = null;
      if (!finished) return;
      syncPlatforms({ ...platformsRef.current, [lane]: null });
      updateService(train.serviceId, { status: 'departed' });
      setDepartureTrain(null);
      setDepartureLane(null);
      setHandled((value) => value + 1);
      setDepartedPassengers((value) => value + train.onboard);
      setMessage(`${train.id} is onderweg naar ${train.destination.name}. P${lane} vrij.`);
      setTimeout(() => tryAutoArrival(), 80);
    });
  };

  useEffect(() => {
    if (phase !== 'playing') return undefined;
    const clock = setInterval(() => {
      const now = timeRef.current + 1;
      timeRef.current = now;
      setServiceTime(now);

      let nextTable = [...timetableRef.current];
      const futureCount = nextTable.filter((service) => service.status === 'scheduled').length;
      if (futureCount < 6) {
        for (let i = 0; i < 6; i += 1) {
          nextTable.push(createService(nextServiceAt.current));
          nextServiceAt.current += SERVICE_INTERVAL;
        }
      }

      const newlyDue = [];
      nextTable = nextTable.map((service) => {
        if (service.status === 'scheduled' && service.scheduledAt <= now) {
          const waitingService = { ...service, status: 'waiting', wait: 0 };
          newlyDue.push(waitingService);
          return waitingService;
        }
        return service;
      });
      syncTimetable(nextTable);

      if (newlyDue.length) syncOutside([...outsideRef.current, ...newlyDue]);
      if (outsideRef.current.length) {
        const updatedOutside = outsideRef.current.map((train) => ({ ...train, wait: (train.wait || 0) + 1 }));
        syncOutside(updatedOutside);
        setDelay((value) => value + updatedOutside.length);
      }

      const nextPassengers = { ...passengersRef.current };
      DESTINATIONS.forEach((destination, index) => {
        nextPassengers[destination.id] += 3 + ((now + index * 3) % 7);
      });

      const nextPlatforms = { ...platformsRef.current };
      let addedDelay = 0;
      LANES.forEach((lane) => {
        const current = nextPlatforms[lane];
        if (!current || current.status === 'departing') return;
        const train = { ...current };
        const assignedLane = assignedLaneForDestination(train.destination.id, timetableRef.current);
        if (assignedLane === lane) {
          const free = Math.max(0, train.capacity - train.onboard);
          const board = Math.min(free, nextPassengers[train.destination.id], train.type.boardRate);
          if (board > 0) {
            nextPassengers[train.destination.id] -= board;
            train.onboard += board;
          }
        }
        if (train.status === 'dwelling') {
          train.remaining = Math.max(0, train.remaining - 1);
          if (train.remaining === 0) train.status = 'ready';
        }
        if (train.status === 'ready') {
          train.readyWait = (train.readyWait || 0) + 1;
          if (now > train.departureAt + DELAY_MARGIN_SECONDS) addedDelay += 1;
        }
        nextPlatforms[lane] = train;
      });
      syncPassengers(nextPassengers);
      syncPlatforms(nextPlatforms);
      if (addedDelay) setDelay((value) => value + addedDelay);
      setTimeout(() => tryAutoArrival(), 30);
    }, 1000);
    return () => clearInterval(clock);
  }, [phase]);

  const startGame = () => {
    timeRef.current = 0;
    sequence.current = 1700;
    serviceCounter.current = 0;
    nextServiceAt.current = 3;
    arrivalBusyRef.current = false;
    departureBusyRef.current = false;
    arrivalLaneRef.current = null;
    departureLaneRef.current = null;
    const initialTable = [];
    for (let i = 0; i < 12; i += 1) {
      initialTable.push(createService(nextServiceAt.current));
      nextServiceAt.current += SERVICE_INTERVAL;
    }
    const initialPassengers = { noorddam: 90, havenstad: 120, oostpoort: 70, luchthaven: 100 };
    syncTimetable(initialTable);
    syncPassengers(initialPassengers);
    syncOutside([]);
    syncPlatforms({ 1: null, 2: null, 3: null });
    setServiceTime(0);
    setArrivalTrain(null); setArrivalLane(null); setDepartureTrain(null); setDepartureLane(null);
    setHandled(0); setDepartedPassengers(0); setDelay(0); setPlatformChanges(0);
    setMessage(`Dienst gestart. Treinen mogen vanaf hun geplande vertrektijd vertrekken; marge ${DELAY_MARGIN_SECONDS}s.`);
    setPhase('playing');
  };

  if (phase === 'menu') {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="light-content" />
        <View style={styles.menuWrap}>
          <Text style={styles.kicker}>DEPARTURE CONTROL / V0.7.1</Text>
          <Text style={styles.title}>RAIL{`\n`}RUSH HOUR</Text>
          <Text style={styles.subtitle}>Treinen rijden automatisch binnen. Jij bewaakt de vertrektijd: tik op een trein zodra hij groen is en vertrek binnen de vertragingmarge.</Text>
          <Pressable style={styles.primaryButton} onPress={startGame}><Text style={styles.primaryButtonText}>START DIENST</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const totalWaiting = Object.values(passengers).reduce((a, b) => a + b, 0);
  const blockedTrain = outside[0] && platforms[outside[0].plannedLane] ? outside[0] : null;
  const demandForLane = (lane) => DESTINATIONS.map((destination) => ({ destination, count: assignedLaneForDestination(destination.id, timetable) === lane ? passengers[destination.id] : 0 })).filter((item) => item.count > 0);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <View style={styles.hud}>
        <View style={styles.hudCell}><Text style={styles.hudLabel}>KLOK</Text><Text style={styles.hudValue}>{formatClock(serviceTime).slice(0, 5)}</Text></View>
        <View style={[styles.hudCell, styles.hudCenter]}><Text style={styles.hudLabel}>WACHTEND</Text><Text style={styles.hudValue}>{totalWaiting}</Text></View>
        <View style={[styles.hudCell, styles.hudCenter]}><Text style={styles.hudLabel}>VERTROKKEN</Text><Text style={styles.hudValue}>{handled}</Text></View>
        <View style={[styles.hudCell, styles.hudRight]}><Text style={styles.hudLabel}>BUITEN MARGE</Text><Text style={styles.hudValue}>{delay}s</Text></View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Timetable timetable={timetable} now={serviceTime} />
        <DestinationBoard passengers={passengers} timetable={timetable} />

        {blockedTrain ? (
          <View style={styles.blockedCard}>
            <View style={styles.blockedTop}><View><Text style={styles.blockedLabel}>TREIN WACHT VOOR STATION</Text><Text style={styles.blockedTrain}>{blockedTrain.id} → {blockedTrain.destination.name}</Text></View><Text style={styles.blockedTime}>+{blockedTrain.wait}s</Text></View>
            <Text style={styles.blockedReason}>Gepland P{blockedTrain.plannedLane} is bezet. Wacht tot het spoor vrijkomt of wijk uit.</Text>
            <View style={styles.divertRow}>{LANES.filter((lane) => lane !== blockedTrain.plannedLane).map((lane) => {
              const occupied = Boolean(platforms[lane]);
              const conflict = arrivalConflict(lane);
              return <Pressable key={lane} disabled={occupied || conflict} style={[styles.divertButton, (occupied || conflict) && styles.buttonDisabled]} onPress={() => divertOutside(lane)}><Text style={styles.divertSmall}>{occupied ? 'BEZET' : conflict ? 'RIJWEG BEZET' : 'WIJK UIT'}</Text><Text style={styles.divertBig}>P{lane}</Text></Pressable>;
            })}</View>
          </View>
        ) : null}

        <DispatcherTableau
          boardSize={boardSize}
          onLayout={({ width, height }) => setBoardSize({ width, height })}
          platforms={platforms}
          arrivalTrain={arrivalTrain}
          arrivalLane={arrivalLane}
          arrivalProgress={arrivalProgress}
          departureTrain={departureTrain}
          departureLane={departureLane}
          departureProgress={departureProgress}
          onTrainPress={depart}
          now={serviceTime}
        />
        <View style={styles.messageStrip}><View style={styles.messageLamp} /><Text style={styles.messageText}>{message}</Text></View>

        <Text style={styles.stationHeading}>PERRONS — TIK OP DE TREIN OM TE VERTREKKEN</Text>
        {LANES.map((lane) => (
          <PlatformCard
            key={lane}
            lane={lane}
            train={platforms[lane]}
            demandGroups={demandForLane(lane)}
            onTrainPress={depart}
            departureBlocked={Boolean(platforms[lane]?.status === 'ready' && departureConflict(lane))}
            now={serviceTime}
          />
        ))}

        <View style={styles.summaryCard}><Text style={styles.summaryTitle}>DIENSTRESULTAAT</Text><Text style={styles.summaryText}>{departedPassengers} reizigers vertrokken • {platformChanges} perronwijzigingen • {delay}s buiten vertragingmarge</Text></View>
      </ScrollView>

      <View style={styles.footer}><Text style={styles.footerText}>V0.7.1 • TIK TREIN = VERTREK • GEPLANDE VERTREKTIJD • {DELAY_MARGIN_SECONDS}s MARGE</Text></View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#070d12' }, scroll: { flex: 1 }, content: { paddingHorizontal: 11, paddingBottom: 30 },
  menuWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }, kicker: { color: '#78a8c6', fontSize: 10, fontWeight: '900', letterSpacing: 2.2, marginBottom: 12 },
  title: { color: '#edf4f7', fontSize: 48, lineHeight: 45, fontWeight: '900', letterSpacing: -2, textAlign: 'center' }, subtitle: { color: '#94a4ae', fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 20, marginBottom: 28, maxWidth: 370 },
  primaryButton: { backgroundColor: '#ffd65a', minWidth: 230, paddingVertical: 16, alignItems: 'center', borderRadius: 9, borderWidth: 2, borderColor: '#ffe795' }, primaryButtonText: { color: '#101820', fontWeight: '900', fontSize: 15, letterSpacing: 1.2 },

  hud: { flexDirection: 'row', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#16232c' }, hudCell: { flex: 1 }, hudCenter: { alignItems: 'center' }, hudRight: { alignItems: 'flex-end' },
  hudLabel: { color: '#5f717d', fontSize: 7.5, fontWeight: '900', letterSpacing: 1 }, hudValue: { color: '#e3edf1', fontSize: 16, fontWeight: '900', marginTop: 2 },

  timetableCard: { marginTop: 9, backgroundColor: '#0d161d', borderWidth: 1, borderColor: '#2b3b45', borderRadius: 10, padding: 10 }, cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionLabel: { color: '#718591', fontSize: 7.2, fontWeight: '900', letterSpacing: 1.1 }, queueCount: { color: '#78909e', fontSize: 8, fontWeight: '900' }, clock: { color: '#ffd65a', fontSize: 14, fontWeight: '900' },
  serviceRow: { minHeight: 39, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#182630' }, serviceTime: { width: 42, color: '#70d29a', fontSize: 9, fontWeight: '900' },
  serviceMain: { flex: 1 }, serviceId: { color: '#e2ebef', fontSize: 10, fontWeight: '900' }, serviceDestination: { color: '#7c919c', fontSize: 7.1, fontWeight: '800' }, servicePlan: { width: 28, color: '#58b9ff', fontSize: 9, fontWeight: '900', textAlign: 'center' }, serviceStatus: { width: 78, color: '#68d995', fontSize: 6.8, fontWeight: '900', textAlign: 'right' }, serviceStatusWarning: { color: '#ffbe5c' },

  destinationBoard: { marginTop: 8, backgroundColor: '#0d161d', borderWidth: 1, borderColor: '#2b3b45', borderRadius: 10, padding: 10 }, destinationRow: { minHeight: 43, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#182630' },
  destinationNameWrap: { flex: 1 }, destinationName: { color: '#e4edf1', fontSize: 11, fontWeight: '900' }, destinationSub: { color: '#687d88', fontSize: 7.3, fontWeight: '700', marginTop: 2 }, destinationCount: { color: '#f0f5f7', fontSize: 17, fontWeight: '900', marginRight: 10 },
  platformBadge: { minWidth: 38, paddingVertical: 6, borderRadius: 5, backgroundColor: '#102333', alignItems: 'center' }, platformBadgeText: { color: '#68c5ff', fontSize: 11, fontWeight: '900' },

  blockedCard: { marginTop: 8, backgroundColor: '#271a0d', borderWidth: 1.5, borderColor: '#d1953d', borderRadius: 10, padding: 10 }, blockedTop: { flexDirection: 'row', justifyContent: 'space-between' }, blockedLabel: { color: '#b79056', fontSize: 7, fontWeight: '900', letterSpacing: 1 }, blockedTrain: { color: '#ffe6b1', fontSize: 16, fontWeight: '900', marginTop: 2 }, blockedTime: { color: '#ffbc55', fontSize: 17, fontWeight: '900' }, blockedReason: { color: '#ba9d70', fontSize: 8.5, lineHeight: 12, marginTop: 7 },
  divertRow: { flexDirection: 'row', gap: 7, marginTop: 8 }, divertButton: { flex: 1, minHeight: 48, borderRadius: 7, borderWidth: 1, borderColor: '#d1953d', backgroundColor: '#33230f', alignItems: 'center', justifyContent: 'center' }, divertSmall: { color: '#c3a36b', fontSize: 6.5, fontWeight: '900' }, divertBig: { color: '#ffda91', fontSize: 17, fontWeight: '900' },

  tableauFrame: { marginTop: 8, backgroundColor: '#0a1218', borderWidth: 1, borderColor: '#263741', borderRadius: 11, overflow: 'hidden' }, tableauHeader: { minHeight: 35, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#263741' }, tableauTitle: { color: '#9eb0bb', fontSize: 7.2, fontWeight: '900', letterSpacing: 0.7 }, tableauStatus: { color: '#ffd65a', fontSize: 7, fontWeight: '900' }, svgArea: { height: 220, position: 'relative', overflow: 'hidden' },
  consistWrap: { alignItems: 'center', justifyContent: 'center' }, consistTouchable: { paddingHorizontal: 3, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#43545e', backgroundColor: 'rgba(7,13,18,0.72)' }, consistReady: { borderColor: '#43df82', backgroundColor: 'rgba(20,65,42,0.82)' }, consistLate: { borderColor: '#ff6677', backgroundColor: 'rgba(72,25,31,0.85)' },
  consistUnits: { flexDirection: 'row', alignItems: 'center', height: 19 }, consistUnit: { height: 17, backgroundColor: '#d9edf8', borderWidth: 1.5, borderColor: '#081016', borderRadius: 3, overflow: 'hidden', justifyContent: 'center' }, cabBand: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: '#6ba5c3' }, windowsRow: { position: 'absolute', left: 7, right: 3, top: 3, flexDirection: 'row', justifyContent: 'space-around' }, windowDot: { width: 4, height: 3, borderRadius: 1, backgroundColor: '#31566c' }, consistCode: { color: '#173443', fontSize: 5.5, fontWeight: '900', textAlign: 'center', marginTop: 5 }, coupler: { width: 5, height: 3, backgroundColor: '#6f7c84' }, consistId: { color: '#d8e8ef', fontSize: 6.3, lineHeight: 8, fontWeight: '900', backgroundColor: '#101920', paddingHorizontal: 3, borderRadius: 2, marginTop: 1 }, consistDetail: { color: '#9fc1d2', fontSize: 5.4, lineHeight: 7, fontWeight: '900', backgroundColor: '#101920', paddingHorizontal: 2, borderRadius: 2 }, movingConsist: { position: 'absolute', left: 0, top: 0 },

  messageStrip: { minHeight: 40, flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#0a1218', borderWidth: 1, borderColor: '#20303a', borderRadius: 8 }, messageLamp: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#58b9ff', marginRight: 8 }, messageText: { flex: 1, color: '#a3b1ba', fontSize: 9, lineHeight: 12, fontWeight: '700' },

  stationHeading: { color: '#78909c', fontSize: 7.5, fontWeight: '900', letterSpacing: 1.2, textAlign: 'center', marginTop: 14, marginBottom: 7 }, platformCard: { marginBottom: 8, backgroundColor: '#0d161d', borderWidth: 1, borderColor: '#263842', borderRadius: 10, padding: 10 }, platformCardReady: { borderColor: '#3ccf78' }, platformTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, platformTitle: { color: '#7d919c', fontSize: 7, fontWeight: '900', letterSpacing: 1 }, trainName: { color: '#e4edf1', fontSize: 14, fontWeight: '900', marginTop: 2 }, statusBadge: { color: '#ffd65a', fontSize: 8, fontWeight: '900', backgroundColor: '#27210e', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 5 }, readyBadge: { color: '#54e78d', backgroundColor: '#10251a' }, freeBadge: { color: '#54e78d', fontSize: 8, fontWeight: '900', backgroundColor: '#10251a', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 5 },
  platformTrainTap: { borderRadius: 7 }, platformSchematic: { marginTop: 8, paddingTop: 7, paddingBottom: 5, minHeight: 38, justifyContent: 'center' }, platformEdge: { position: 'absolute', left: 0, right: 0, top: 1, height: 6, borderRadius: 2, backgroundColor: '#26343d', borderTopWidth: 1, borderTopColor: '#64737c' }, platformLengthLabel: { color: '#596d78', fontSize: 6.5, fontWeight: '800', marginTop: 4 }, compositionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 7 }, compositionCoupler: { width: 5, height: 3, backgroundColor: '#71808a' }, setBlock: { maxWidth: 105, minWidth: 45, height: 14, backgroundColor: '#40677d', borderRadius: 3, alignItems: 'center', justifyContent: 'center' }, setBlockReady: { backgroundColor: '#2b8c58' }, setBlockText: { color: '#d8edf7', fontSize: 6, fontWeight: '900' },

  departureTiming: { marginTop: 8, minHeight: 51, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 7, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, departureTimingEarly: { backgroundColor: '#221f12', borderColor: '#756831' }, departureTimingReady: { backgroundColor: '#10271a', borderColor: '#3dcf77' }, departureTimingLate: { backgroundColor: '#2b1519', borderColor: '#d45161' }, departureTimingLabel: { color: '#70808a', fontSize: 5.8, fontWeight: '900', letterSpacing: 0.5 }, departureTimingClock: { color: '#eef5f7', fontSize: 15, fontWeight: '900', marginTop: 1 }, departureTimingRight: { alignItems: 'flex-end', flex: 1, marginLeft: 10 }, departureTimingTitle: { color: '#e5edf1', fontSize: 8.7, fontWeight: '900', textAlign: 'right' }, departureTimingDetail: { color: '#8da0aa', fontSize: 7.2, fontWeight: '800', marginTop: 2, textAlign: 'right' },

  waitingBig: { color: '#e6eef2', fontSize: 28, fontWeight: '900', marginTop: 9 }, waitingLabel: { color: '#758893', fontSize: 8, fontWeight: '800', marginBottom: 6 }, demandList: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 }, demandText: { color: '#92a4ae', fontSize: 7.4, fontWeight: '800', backgroundColor: '#121e25', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 }, demandTextActive: { color: '#7bd1ff', backgroundColor: '#102536' }, demandTextMuted: { color: '#566873', fontSize: 7.5, fontWeight: '700' },
  exchangeRow: { flexDirection: 'row', gap: 6, marginTop: 7 }, exchangeCell: { flex: 1, backgroundColor: '#091117', borderRadius: 6, paddingVertical: 6, alignItems: 'center' }, exchangeLabel: { color: '#5f7480', fontSize: 5.8, fontWeight: '900', letterSpacing: 0.5 }, exchangeValue: { color: '#dce7ec', fontSize: 11, fontWeight: '900', marginTop: 2 }, boardingRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 9 }, boardingLabel: { color: '#647985', fontSize: 6.5, fontWeight: '900' }, boardingValue: { color: '#d5e0e5', fontSize: 8, fontWeight: '900' },
  tapHint: { color: '#7b8d97', fontSize: 7.3, lineHeight: 11, textAlign: 'center', marginTop: 9, fontWeight: '900', letterSpacing: 0.4 }, tapHintReady: { color: '#58e691' }, buttonDisabled: { opacity: 0.30 },

  summaryCard: { backgroundColor: '#0b141a', borderWidth: 1, borderColor: '#22333d', borderRadius: 8, padding: 10, marginTop: 3 }, summaryTitle: { color: '#667b87', fontSize: 6.5, fontWeight: '900', letterSpacing: 1 }, summaryText: { color: '#9aaab3', fontSize: 8.5, fontWeight: '800', marginTop: 4 },
  footer: { alignItems: 'center', paddingVertical: 7, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: '#14212a' }, footerText: { color: '#42535e', fontSize: 6.2, fontWeight: '900', textAlign: 'center' },
});