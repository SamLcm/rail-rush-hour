import React, { useEffect, useMemo, useRef, useState } from 'react';
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

const DESTINATIONS = [
  { id: 'noorddam', name: 'Noorddam', code: 'NDR', fare: 1, unlock: 1, color: '#4aa8ff' },
  { id: 'havenstad', name: 'Havenstad', code: 'HVN', fare: 2, unlock: 1, color: '#43d88e' },
  { id: 'oostpoort', name: 'Oostpoort', code: 'OOS', fare: 3, unlock: 2, color: '#ffad55' },
  { id: 'luchthaven', name: 'Luchthaven', code: 'AIR', fare: 4, unlock: 3, color: '#b38cff' },
];

const TRAIN_TYPES = [
  { code: 'SPR', name: 'Sprinter', setCapacity: 180, dwell: 7 },
  { code: 'IC', name: 'Intercity', setCapacity: 260, dwell: 9 },
  { code: 'EXP', name: 'Express', setCapacity: 340, dwell: 11 },
];

const SAVE_KEY = 'rail-rush-hour-v012';
const LEGACY_SAVE_KEY = 'rail-rush-hour-v011';
const TICK_MS = 1000;
const SERVICE_INTERVAL = 16;
const DELAY_MARGIN = 12;
const WORLD_WIDTH = 1180;

const money = (value) => `€${Math.max(0, Math.round(value)).toLocaleString('nl-NL')}`;
const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
const clampPct = (value, max) => Math.max(0, Math.min(100, Math.round((value / Math.max(1, max)) * 100)));
const levelTarget = (level) => 450 + level * 250;
const parkingCap = (lv) => 45 + lv * 55;
const parkingInflow = (lv) => 2 + lv * 3;
const parkingCost = (lv) => 450 + lv * 520;
const entranceBuffer = (lv) => 30 + lv * 35;
const gateRate = (lv) => 4 + lv * 5;
const gateCost = (lv) => 600 + lv * 620;
const hallCap = (lv) => 120 + lv * 190;
const hallRate = (lv) => 6 + lv * 6;
const hallCost = (lv) => 800 + lv * 760;
const platformCap = (lv) => 75 + lv * 85;
const platformCost = (lv) => 950 + lv * 850;
const fleetCost = (lv) => 1200 + lv * 1050;
const retailCost = (lv) => 700 + lv * 650;
const ticketCost = (lv) => 850 + lv * 700;
const platform3Cost = 2800;
const retailIncome = (lv) => 1 + lv * 2;
const fareMultiplier = (lv) => 1 + (lv - 1) * 0.12;
const emptyDemand = () => ({ noorddam: 0, havenstad: 0, oostpoort: 0, luchthaven: 0 });

const clock = (seconds) => {
  const total = 8 * 3600 + Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600) % 24;
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const safeLoad = () => {
  try {
    if (!globalThis?.localStorage) return null;
    const current = globalThis.localStorage.getItem(SAVE_KEY);
    if (current) return JSON.parse(current);
    const legacy = globalThis.localStorage.getItem(LEGACY_SAVE_KEY);
    return legacy ? JSON.parse(legacy) : null;
  } catch {
    return null;
  }
};

const safeSave = (data) => {
  try {
    if (globalThis?.localStorage) globalThis.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Web prototype keeps running without persistence.
  }
};

function CapacityPill({ label, value, max }) {
  const p = clampPct(value, max);
  return (
    <View style={[styles.capacityPill, p >= 90 && styles.capacityPillDanger]}>
      <Text style={styles.capacityPillLabel}>{label}</Text>
      <Text style={styles.capacityPillValue}>{value}/{max}</Text>
      <View style={styles.capacityMiniTrack}><View style={[styles.capacityMiniFill, p >= 90 && styles.capacityMiniFillDanger, { width: `${p}%` }]} /></View>
    </View>
  );
}

function IsoFloor({ width, height, hot }) {
  return (
    <>
      <View style={[styles.isoShadow, { width, height, left: 8, top: 12 }]} />
      <View style={[styles.isoFloor, hot && styles.isoFloorHot, { width, height }]} />
    </>
  );
}

function TinyPeople({ count, max = 20, accent }) {
  const dots = Math.min(max, Math.max(0, Math.ceil(count / 8)));
  return (
    <View style={styles.tinyPeople}>
      {Array.from({ length: dots }).map((_, index) => (
        <View key={index} style={styles.tinyPersonWrap}>
          <View style={[styles.tinyHead, accent && index % 4 === 0 && { backgroundColor: accent }]} />
          <View style={styles.tinyBody} />
        </View>
      ))}
    </View>
  );
}

function FlowStream({ left, top, width, amount, color = '#65d9ff', label }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(anim, { toValue: 1, duration: 1900, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [anim]);

  const people = Math.min(8, Math.max(1, Math.ceil(amount / 4)));
  const move = anim.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(20, width - 36)] });
  return (
    <View pointerEvents="none" style={[styles.flowStream, { left, top, width }]}> 
      <View style={[styles.flowLine, { backgroundColor: color }]} />
      <Text style={styles.flowStreamLabel}>{label}</Text>
      {Array.from({ length: people }).map((_, index) => (
        <Animated.View key={index} style={[styles.flowTraveler, { left: 5 - index * 18, transform: [{ translateX: move }] }]}>
          <View style={[styles.flowHead, { backgroundColor: color }]} />
          <View style={styles.flowBody} />
        </Animated.View>
      ))}
      <Text style={[styles.flowArrow, { color }]}>›››</Text>
    </View>
  );
}

function CarParkIso({ level, queue, hot }) {
  const slots = Math.min(18, 6 + level * 3);
  const busy = Math.min(slots, Math.round((queue / Math.max(1, parkingCap(level))) * slots));
  return (
    <View style={[styles.isoZone, { left: 25, top: 120, width: 220, height: 230 }]}>
      <IsoFloor width={205} height={112} hot={hot} />
      <View style={styles.zoneFloatTitle}><Text style={styles.zoneNumber}>1</Text><View><Text style={styles.zoneName}>PARKEREN</Text><Text style={styles.zoneSub}>Lv {level} • +{parkingInflow(level)}/s vraag</Text></View></View>
      <View style={styles.parkingGridIso}>
        {Array.from({ length: slots }).map((_, index) => <View key={index} style={[styles.parkingSlotIso, index < busy && styles.parkingSlotIsoBusy]}><View style={[styles.carIso, index % 3 === 1 && styles.carIsoAlt]} /></View>)}
      </View>
      <View style={styles.zoneBottom}><CapacityPill label="BEZET" value={queue} max={parkingCap(level)} /><TinyPeople count={queue} accent="#65d9ff" /></View>
      {hot ? <Text style={styles.hotBadge}>⚠ KNELPUNT</Text> : null}
    </View>
  );
}

function GatesIso({ level, queue, hot }) {
  const gates = Math.min(6, 1 + level);
  return (
    <View style={[styles.isoZone, { left: 285, top: 105, width: 205, height: 245 }]}>
      <IsoFloor width={190} height={112} hot={hot} />
      <View style={styles.zoneFloatTitle}><Text style={styles.zoneNumber}>2</Text><View><Text style={styles.zoneName}>POORTJES</Text><Text style={styles.zoneSub}>Lv {level} • {gateRate(level)}/s</Text></View></View>
      <View style={styles.gateDeck}>
        {Array.from({ length: gates }).map((_, index) => <View key={index} style={styles.gateIso}><View style={styles.gateIsoTop} /><View style={styles.gateIsoLight} /></View>)}
      </View>
      <View style={styles.queueLane}><TinyPeople count={queue * 1.4} max={18} accent={hot ? '#ff7b61' : '#ffd36a'} /></View>
      <View style={styles.zoneBottom}><CapacityPill label="WACHTRIJ" value={queue} max={entranceBuffer(level)} /></View>
      {hot ? <Text style={styles.hotBadge}>⚠ UITBREIDEN</Text> : null}
    </View>
  );
}

function HallIso({ hallLevel, retailLevel, ticketLevel, count, hot }) {
  return (
    <View style={[styles.isoZone, { left: 535, top: 67, width: 255, height: 295 }]}>
      <IsoFloor width={240} height={135} hot={hot} />
      <View style={styles.zoneFloatTitle}><Text style={styles.zoneNumber}>3</Text><View><Text style={styles.zoneName}>STATIONSHAL</Text><Text style={styles.zoneSub}>Lv {hallLevel} • verdeling naar perrons</Text></View></View>
      <View style={[styles.stationBuildingIso, { width: 120 + hallLevel * 8 }]}>
        <View style={styles.stationRoofIso}><Text style={styles.stationRoofText}>CENTRAAL</Text></View>
        <View style={styles.stationWindowsIso}>{Array.from({ length: 5 }).map((_, i) => <View key={i} style={styles.stationWindowIso} />)}</View>
      </View>
      <View style={styles.shopRowIso}>
        <View style={styles.shopIso}><Text style={styles.shopEmoji}>☕</Text><Text style={styles.shopText}>CAFÉ {retailLevel}</Text></View>
        <View style={styles.shopIso}><Text style={styles.shopEmoji}>🎫</Text><Text style={styles.shopText}>SERVICE {ticketLevel}</Text></View>
      </View>
      <View style={styles.hallPeopleIso}><TinyPeople count={count} max={28} accent="#ffd36a" /></View>
      <View style={styles.zoneBottom}><CapacityPill label="HAL" value={count} max={hallCap(hallLevel)} /></View>
      {hot ? <Text style={styles.hotBadge}>⚠ TE DRUK</Text> : null}
    </View>
  );
}

function TrainConsist({ train, ready, late, onPress, color }) {
  if (!train) return null;
  const body = (
    <View style={styles.trainRowIso}>
      {Array.from({ length: train.sets }).map((_, index) => (
        <React.Fragment key={index}>
          {index > 0 ? <View style={styles.couplerIso} /> : null}
          <View style={[styles.trainSetIso, { borderColor: color }, ready && styles.trainSetIsoReady, late && styles.trainSetIsoLate]}>
            <View style={[styles.trainNoseIso, { backgroundColor: color }]} />
            <View style={styles.trainWindowsIso}><View style={styles.trainWindowIso} /><View style={styles.trainWindowIso} /><View style={styles.trainWindowIso} /></View>
            <Text style={styles.trainCodeIso}>{train.type.code}</Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
  if (!onPress) return body;
  return <Pressable hitSlop={12} onPress={onPress} style={styles.trainTapIso}>{body}</Pressable>;
}

function PlatformsIso({ platformLevel, platform3, services, platformDemand, platforms, now, onDepart, bottleneck }) {
  return (
    <View style={[styles.isoZone, { left: 825, top: 40, width: 315, height: 365 }]}>
      <IsoFloor width={300} height={175} hot={bottleneck === 'PERRONS' || bottleneck === 'TREINEN'} />
      <View style={styles.zoneFloatTitle}><Text style={styles.zoneNumber}>4</Text><View><Text style={styles.zoneName}>PERRONS & TREINEN</Text><Text style={styles.zoneSub}>Lv {platformLevel} • tik groene trein voor vertrek</Text></View></View>
      <View style={styles.platformStackIso}>
        {[1, 2, 3].map((lane) => {
          const locked = lane === 3 && !platform3;
          const waiting = DESTINATIONS.reduce((acc, d) => {
            const service = services.find((s) => s.destination.id === d.id && s.status !== 'departed');
            return acc + ((service?.actualLane || service?.plannedLane) === lane ? platformDemand[d.id] : 0);
          }, 0);
          const train = platforms[lane];
          const depIn = train ? train.departureAt - now : 0;
          const ready = Boolean(train && train.status === 'ready' && depIn <= 0 && depIn >= -DELAY_MARGIN);
          const late = Boolean(train && train.status === 'ready' && depIn < -DELAY_MARGIN);
          const color = train?.destination?.color || '#5fa8d0';
          return (
            <View key={lane} style={[styles.platformIso, locked && styles.platformIsoLocked]}>
              <View style={[styles.platformSlabIso, { borderLeftColor: locked ? '#727272' : color }]} />
              <View style={styles.railIso}><View style={styles.railLineIso} /><View style={styles.railLineIso} /></View>
              <View style={styles.platformSignIso}><Text style={styles.platformSignNum}>P{lane}</Text><Text style={[styles.platformSignDest, { color }]}>{locked ? 'BOUW' : train ? train.destination.code : 'VRIJ'}</Text></View>
              {!locked && train ? <View style={styles.trainPositionIso}><TrainConsist train={train} ready={ready} late={late} onPress={() => onDepart(lane)} color={color} /><Text style={[styles.trainStatusIso, ready && styles.readyText, late && styles.dangerText]}>{train.number} • {train.status === 'ready' ? (depIn > 0 ? `${depIn}s` : depIn >= -DELAY_MARGIN ? `VERTREK • ${DELAY_MARGIN + depIn}s` : `+${Math.abs(depIn + DELAY_MARGIN)}s`) : `${train.remaining}s halte`}</Text></View> : null}
              {!locked ? <View style={styles.platformCrowdIso}><TinyPeople count={waiting} max={14} accent={color} /><Text style={styles.platformCountIso}>{waiting}/{platformCap(platformLevel)}</Text></View> : <Text style={styles.buildTextIso}>NIEUW PERRON</Text>}
            </View>
          );
        })}
      </View>
      {(bottleneck === 'PERRONS' || bottleneck === 'TREINEN') ? <Text style={styles.hotBadge}>⚠ {bottleneck === 'TREINEN' ? 'TREINEN TE KLEIN' : 'PERRONS VOL'}</Text> : null}
    </View>
  );
}

function FutureIso({ stationLevel }) {
  return (
    <View style={[styles.isoZone, { left: 1085, top: 155, width: 90, height: 150 }]}>
      <View style={styles.futureGround} />
      <Text style={styles.futureArrow}>»</Text>
      <Text style={styles.futureTitle}>WERELD{`\n`}VERDER</Text>
      <Text style={styles.futureSub}>opstelterrein{`\n`}bus • taxi{`\n`}metro later</Text>
      <Text style={styles.futureLevel}>Lv {stationLevel}+</Text>
    </View>
  );
}

function IsometricWorld({
  scrollRef,
  parkingLevel,
  gateLevel,
  hallLevel,
  retailLevel,
  ticketLevel,
  platformLevel,
  stationLevel,
  platform3,
  parkingQueue,
  entranceQueue,
  hallDemand,
  platformDemand,
  platforms,
  services,
  now,
  bottleneck,
  onDepart,
}) {
  const hallTotal = sum(hallDemand);
  const platformTotal = sum(platformDemand);
  return (
    <View style={styles.worldFrame}>
      <View style={styles.worldFrameHead}>
        <View><Text style={styles.worldKicker}>ISOMETRISCH STATION • LIVE</Text><Text style={styles.worldTitle}>SWIPE DOOR JE STATION</Text></View>
        <Text style={styles.swipeHint}>↔ SCROLL</Text>
      </View>
      <View style={styles.jumpRow}>
        <Pressable style={styles.jumpButton} onPress={() => scrollRef.current?.scrollTo({ x: 0, animated: true })}><Text style={styles.jumpText}>🚗 PARKEREN</Text></Pressable>
        <Pressable style={styles.jumpButton} onPress={() => scrollRef.current?.scrollTo({ x: 430, animated: true })}><Text style={styles.jumpText}>🏢 STATION</Text></Pressable>
        <Pressable style={styles.jumpButton} onPress={() => scrollRef.current?.scrollTo({ x: 760, animated: true })}><Text style={styles.jumpText}>🚆 PERRONS</Text></Pressable>
      </View>
      <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.worldScrollContent} nestedScrollEnabled>
        <View style={styles.worldCanvas}>
          <View style={styles.worldGrass} />
          <View style={styles.worldRoad} />
          <FlowStream left={205} top={218} width={120} amount={Math.min(parkingQueue, gateRate(gateLevel))} label="naar entree" />
          <FlowStream left={445} top={205} width={125} amount={Math.min(entranceQueue, gateRate(gateLevel))} color="#ffd36a" label="door poortjes" />
          <FlowStream left={735} top={197} width={125} amount={Math.min(hallTotal, hallRate(hallLevel))} color="#8be29c" label="naar perron" />
          <CarParkIso level={parkingLevel} queue={parkingQueue} hot={bottleneck === 'PARKEREN'} />
          <GatesIso level={gateLevel} queue={entranceQueue} hot={bottleneck === 'ENTREE'} />
          <HallIso hallLevel={hallLevel} retailLevel={retailLevel} ticketLevel={ticketLevel} count={hallTotal} hot={bottleneck === 'HAL'} />
          <PlatformsIso platformLevel={platformLevel} platform3={platform3} services={services} platformDemand={platformDemand} platforms={platforms} now={now} onDepart={onDepart} bottleneck={bottleneck} />
          <FutureIso stationLevel={stationLevel} />
          <View style={styles.worldLegend}><Text style={styles.worldLegendText}>👥 {parkingQueue + entranceQueue + hallTotal + platformTotal} reizigers in systeem</Text><Text style={styles.worldLegendText}>🛍 {money(retailIncome(retailLevel))}/s</Text></View>
        </View>
      </ScrollView>
    </View>
  );
}

function BalanceBar({ data }) {
  const worst = [...data].sort((a, b) => b.pressure - a.pressure)[0];
  return (
    <View style={styles.balanceCard}>
      <View style={styles.balanceHead}><Text style={styles.balanceTitle}>CAPACITEITSBALANS</Text><Text style={styles.balanceWorst}>KNELPUNT: {worst.label}</Text></View>
      <View style={styles.balanceStages}>
        {data.map((item, index) => <React.Fragment key={item.label}>{index > 0 ? <Text style={styles.balanceArrow}>›</Text> : null}<View style={[styles.balanceStage, item.pressure >= 90 && styles.balanceStageBad]}><Text style={styles.balanceStageLabel}>{item.label}</Text><Text style={styles.balanceStageValue}>{Math.min(999, item.pressure)}%</Text></View></React.Fragment>)}
      </View>
    </View>
  );
}

function Timetable({ services, now }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}><Text style={styles.cardTitle}>VOLGENDE TREINEN</Text><Text style={styles.clock}>{clock(now)}</Text></View>
      {services.filter((s) => s.status !== 'departed').slice(0, 5).map((s) => {
        const depIn = s.departureAt - now;
        const status = s.status === 'scheduled' ? `IN ${Math.max(0, s.arrivalAt - now)}s` : s.status === 'waiting' ? 'WACHT BUITEN' : s.status === 'arriving' ? `→ P${s.actualLane}` : depIn > 0 ? `V OVER ${depIn}s` : depIn >= -DELAY_MARGIN ? `${Math.max(0, DELAY_MARGIN + depIn)}s MARGE` : `+${Math.abs(depIn + DELAY_MARGIN)}s`;
        return <View key={s.id} style={styles.serviceRow}><Text style={styles.serviceTime}>{clock(s.departureAt).slice(0, 5)}</Text><View style={styles.serviceMain}><Text style={styles.serviceId}>{s.number}</Text><Text style={[styles.serviceDest, { color: s.destination.color }]}>→ {s.destination.name}</Text></View><Text style={styles.servicePlatform}>P{s.actualLane || s.plannedLane}</Text><Text style={styles.serviceStatus}>{status}</Text></View>;
      })}
    </View>
  );
}

function Upgrade({ icon, title, level, description, cost, cash, onPress, focus, done }) {
  return (
    <Pressable disabled={done} onPress={onPress} style={[styles.upgrade, cash >= cost && !done && styles.upgradeAffordable, focus && styles.upgradeFocus, done && styles.upgradeDone]}>
      <Text style={styles.upgradeIcon}>{icon}</Text><Text style={styles.upgradeTitle}>{title}</Text><Text style={styles.upgradeLevel}>{done ? 'OPEN' : `LEVEL ${level}`}</Text><Text style={styles.upgradeDesc}>{description}</Text><View style={styles.upgradeButton}><Text style={styles.upgradeButtonText}>{done ? 'ACTIEF' : `UPGRADE  ${money(cost)}`}</Text></View>
    </Pressable>
  );
}

export default function App() {
  const saved = useRef(safeLoad()).current;
  const worldScrollRef = useRef(null);
  const [phase, setPhase] = useState('menu');
  const [now, setNow] = useState(0);
  const [message, setMessage] = useState('');
  const [cash, setCash] = useState(saved?.cash ?? 500);
  const [stationLevel, setStationLevel] = useState(saved?.stationLevel ?? 1);
  const [xp, setXp] = useState(saved?.xp ?? 0);
  const [parkingLevel, setParkingLevel] = useState(saved?.parkingLevel ?? 1);
  const [gateLevel, setGateLevel] = useState(saved?.gateLevel ?? 1);
  const [hallLevel, setHallLevel] = useState(saved?.hallLevel ?? 1);
  const [platformLevel, setPlatformLevel] = useState(saved?.platformLevel ?? 1);
  const [fleetLevel, setFleetLevel] = useState(saved?.fleetLevel ?? 1);
  const [retailLevel, setRetailLevel] = useState(saved?.retailLevel ?? 1);
  const [ticketLevel, setTicketLevel] = useState(saved?.ticketLevel ?? 1);
  const [platform3, setPlatform3] = useState(Boolean(saved?.platform3));
  const [parkingQueue, setParkingQueue] = useState(15);
  const [entranceQueue, setEntranceQueue] = useState(8);
  const [hallDemand, setHallDemand] = useState(emptyDemand());
  const [platformDemand, setPlatformDemand] = useState(emptyDemand());
  const [platforms, setPlatforms] = useState({ 1: null, 2: null, 3: null });
  const [services, setServices] = useState([]);
  const [outside, setOutside] = useState([]);
  const [handled, setHandled] = useState(saved?.handled ?? 0);
  const [lost, setLost] = useState(saved?.lost ?? 0);
  const [transported, setTransported] = useState(saved?.transported ?? 0);
  const [onTime, setOnTime] = useState(saved?.onTime ?? 0);

  const nowRef = useRef(0);
  const cashRef = useRef(cash);
  const stationLevelRef = useRef(stationLevel);
  const xpRef = useRef(xp);
  const parkingLevelRef = useRef(parkingLevel);
  const gateLevelRef = useRef(gateLevel);
  const hallLevelRef = useRef(hallLevel);
  const platformLevelRef = useRef(platformLevel);
  const fleetLevelRef = useRef(fleetLevel);
  const retailLevelRef = useRef(retailLevel);
  const ticketLevelRef = useRef(ticketLevel);
  const platform3Ref = useRef(platform3);
  const parkingRef = useRef(15);
  const entranceRef = useRef(8);
  const hallRef = useRef(emptyDemand());
  const platformDemandRef = useRef(emptyDemand());
  const platformsRef = useRef({ 1: null, 2: null, 3: null });
  const servicesRef = useRef([]);
  const outsideRef = useRef([]);
  const handledRef = useRef(handled);
  const lostRef = useRef(lost);
  const transportedRef = useRef(transported);
  const onTimeRef = useRef(onTime);
  const serviceIndex = useRef(0);
  const nextServiceAt = useRef(3);
  const demandCursor = useRef(0);
  const arrivalBusy = useRef(false);

  const syncParking = (v) => { parkingRef.current = v; setParkingQueue(v); };
  const syncEntrance = (v) => { entranceRef.current = v; setEntranceQueue(v); };
  const syncHall = (v) => { hallRef.current = v; setHallDemand(v); };
  const syncPlatformDemand = (v) => { platformDemandRef.current = v; setPlatformDemand(v); };
  const syncPlatforms = (v) => { platformsRef.current = v; setPlatforms(v); };
  const syncServices = (v) => { servicesRef.current = v; setServices(v); };
  const syncOutside = (v) => { outsideRef.current = v; setOutside(v); };

  const persist = () => safeSave({ cash: Math.round(cashRef.current), stationLevel: stationLevelRef.current, xp: Math.round(xpRef.current), parkingLevel: parkingLevelRef.current, gateLevel: gateLevelRef.current, hallLevel: hallLevelRef.current, platformLevel: platformLevelRef.current, fleetLevel: fleetLevelRef.current, retailLevel: retailLevelRef.current, ticketLevel: ticketLevelRef.current, platform3: platform3Ref.current, handled: handledRef.current, lost: lostRef.current, transported: transportedRef.current, onTime: onTimeRef.current, lastSaved: Date.now() });
  const addCash = (value) => { cashRef.current += value; setCash(Math.round(cashRef.current)); };
  const spend = (value) => { if (cashRef.current < value) return false; cashRef.current -= value; setCash(Math.round(cashRef.current)); return true; };
  const awardXp = (value) => {
    let nextXp = xpRef.current + value;
    let nextLevel = stationLevelRef.current;
    while (nextXp >= levelTarget(nextLevel)) { nextXp -= levelTarget(nextLevel); nextLevel += 1; }
    xpRef.current = nextXp; stationLevelRef.current = nextLevel; setXp(Math.round(nextXp)); setStationLevel(nextLevel);
  };

  const makeService = (arrivalAt) => {
    const i = serviceIndex.current++;
    const type = TRAIN_TYPES[i % TRAIN_TYPES.length];
    const destinations = DESTINATIONS.filter((d) => d.unlock <= stationLevelRef.current);
    const destination = destinations[i % destinations.length];
    const lanes = platform3Ref.current ? [1, 2, 3] : [1, 2];
    const plannedLane = lanes[i % lanes.length];
    const sets = fleetLevelRef.current <= 1 ? 1 + (i % 2) : fleetLevelRef.current === 2 ? 2 + (i % 2) : 3;
    const capacity = type.setCapacity * sets;
    return { id: `svc-${i}-${arrivalAt}`, number: `${type.code} ${1700 + i * 4 + 2}`, type, destination, plannedLane, actualLane: null, arrivalAt, departureAt: arrivalAt + type.dwell + 5, sets, capacity, onboard: Math.round(capacity * 0.38), status: 'scheduled', remaining: type.dwell, wait: 0 };
  };

  const updateService = (id, patch) => syncServices(servicesRef.current.map((s) => s.id === id ? { ...s, ...patch } : s));
  const tryArrival = () => {
    if (arrivalBusy.current || !outsideRef.current.length) return;
    const train = outsideRef.current[0];
    const planned = train.plannedLane;
    if (!platformsRef.current[planned]) {
      arrivalBusy.current = true; syncOutside(outsideRef.current.slice(1)); updateService(train.id, { status: 'arriving', actualLane: planned });
      setTimeout(() => { syncPlatforms({ ...platformsRef.current, [planned]: { ...train, status: 'dwelling', actualLane: planned, remaining: train.type.dwell } }); updateService(train.id, { status: 'platform', actualLane: planned }); arrivalBusy.current = false; setMessage(`${train.number} rijdt automatisch P${planned} binnen.`); }, 2200);
    }
  };

  const divert = (lane) => {
    const train = outsideRef.current[0];
    if (!train || platformsRef.current[lane] || (lane === 3 && !platform3Ref.current)) return;
    arrivalBusy.current = true; syncOutside(outsideRef.current.slice(1)); updateService(train.id, { status: 'arriving', actualLane: lane }); setMessage(`${train.number}: P${train.plannedLane} → P${lane}. Reizigers verplaatsen mee.`);
    setTimeout(() => { syncPlatforms({ ...platformsRef.current, [lane]: { ...train, status: 'dwelling', actualLane: lane, remaining: train.type.dwell } }); updateService(train.id, { status: 'platform', actualLane: lane }); arrivalBusy.current = false; }, 2200);
  };

  const depart = (lane) => {
    const train = platformsRef.current[lane];
    if (!train) return;
    if (train.status !== 'ready') return setMessage(`${train.number}: nog ${train.remaining}s reizigerswissel.`);
    if (nowRef.current < train.departureAt) return setMessage(`${train.number} mag over ${train.departureAt - nowRef.current}s vertrekken.`);
    const delay = nowRef.current - train.departureAt;
    const within = delay <= DELAY_MARGIN;
    const revenue = Math.round(train.onboard * train.destination.fare * fareMultiplier(ticketLevelRef.current));
    syncPlatforms({ ...platformsRef.current, [lane]: null }); updateService(train.id, { status: 'departed' }); handledRef.current += 1; transportedRef.current += train.onboard; if (within) onTimeRef.current += 1;
    setHandled(handledRef.current); setTransported(transportedRef.current); setOnTime(onTimeRef.current); addCash(revenue + (within ? 75 : 0)); awardXp(Math.round(train.onboard / 4) + (within ? 45 : 10)); setMessage(`${train.number} → ${train.destination.name}: ${money(revenue)}${within ? ' + €75 op-tijdbonus' : ''}.`); persist(); setTimeout(tryArrival, 100);
  };

  useEffect(() => {
    if (phase !== 'playing') return undefined;
    const timer = setInterval(() => {
      const t = nowRef.current + 1; nowRef.current = t; setNow(t);
      let nextServices = [...servicesRef.current];
      while (nextServices.filter((s) => s.status === 'scheduled').length < 6) { nextServices.push(makeService(nextServiceAt.current)); nextServiceAt.current += SERVICE_INTERVAL; }
      const newlyDue = [];
      nextServices = nextServices.map((s) => { if (s.status === 'scheduled' && s.arrivalAt <= t) { const due = { ...s, status: 'waiting', wait: 0 }; newlyDue.push(due); return due; } return s; });
      syncServices(nextServices); if (newlyDue.length) syncOutside([...outsideRef.current, ...newlyDue]); if (outsideRef.current.length) syncOutside(outsideRef.current.map((s) => ({ ...s, wait: (s.wait || 0) + 1 })));

      const inflow = parkingInflow(parkingLevelRef.current);
      const freeParking = Math.max(0, parkingCap(parkingLevelRef.current) - parkingRef.current);
      const enterParking = Math.min(inflow, freeParking);
      const rejected = inflow - enterParking;
      if (rejected > 0) { lostRef.current += rejected; setLost(lostRef.current); }
      let nextParking = parkingRef.current + enterParking;
      const freeEntrance = Math.max(0, entranceBuffer(gateLevelRef.current) - entranceRef.current);
      const toEntrance = Math.min(nextParking, gateRate(gateLevelRef.current), freeEntrance);
      nextParking -= toEntrance;
      let nextEntrance = entranceRef.current + toEntrance;
      const nextHall = { ...hallRef.current };
      const hallSpace = Math.max(0, hallCap(hallLevelRef.current) - sum(nextHall));
      const throughGates = Math.min(nextEntrance, gateRate(gateLevelRef.current), hallSpace);
      nextEntrance -= throughGates;
      const unlocked = DESTINATIONS.filter((d) => d.unlock <= stationLevelRef.current);
      for (let i = 0; i < throughGates; i += 1) { const d = unlocked[(demandCursor.current + i) % unlocked.length]; nextHall[d.id] += 1; }
      demandCursor.current += throughGates;

      const nextPlatformDemand = { ...platformDemandRef.current };
      let hallFlowBudget = hallRate(hallLevelRef.current);
      unlocked.forEach((d) => {
        if (hallFlowBudget <= 0 || nextHall[d.id] <= 0) return;
        const nextService = servicesRef.current.find((s) => s.destination.id === d.id && s.status !== 'departed');
        const lane = nextService?.actualLane || nextService?.plannedLane;
        if (!lane || (lane === 3 && !platform3Ref.current)) return;
        const waitingOnLane = unlocked.reduce((acc, candidate) => { const cs = servicesRef.current.find((s) => s.destination.id === candidate.id && s.status !== 'departed'); return acc + ((cs?.actualLane || cs?.plannedLane) === lane ? nextPlatformDemand[candidate.id] : 0); }, 0);
        const moved = Math.min(nextHall[d.id], hallFlowBudget, Math.max(0, platformCap(platformLevelRef.current) - waitingOnLane));
        nextHall[d.id] -= moved; nextPlatformDemand[d.id] += moved; hallFlowBudget -= moved;
      });

      const nextPlatforms = { ...platformsRef.current };
      [1, 2, 3].forEach((lane) => {
        const current = nextPlatforms[lane]; if (!current) return;
        const train = { ...current };
        const board = Math.min(nextPlatformDemand[train.destination.id] || 0, Math.max(0, train.capacity - train.onboard), 30 + train.sets * 12);
        nextPlatformDemand[train.destination.id] -= board; train.onboard += board;
        if (train.status === 'dwelling') { train.remaining = Math.max(0, train.remaining - 1); if (train.remaining === 0) train.status = 'ready'; }
        nextPlatforms[lane] = train;
      });

      syncParking(nextParking); syncEntrance(nextEntrance); syncHall(nextHall); syncPlatformDemand(nextPlatformDemand); syncPlatforms(nextPlatforms); addCash(retailIncome(retailLevelRef.current)); if (t % 10 === 0) persist(); setTimeout(tryArrival, 30);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [phase]);

  const begin = () => {
    nowRef.current = 0; serviceIndex.current = 0; nextServiceAt.current = 3; arrivalBusy.current = false; demandCursor.current = 0;
    syncParking(15); syncEntrance(8); syncHall({ noorddam: 8, havenstad: 10, oostpoort: stationLevelRef.current >= 2 ? 5 : 0, luchthaven: stationLevelRef.current >= 3 ? 4 : 0 }); syncPlatformDemand({ noorddam: 12, havenstad: 18, oostpoort: stationLevelRef.current >= 2 ? 7 : 0, luchthaven: stationLevelRef.current >= 3 ? 5 : 0 }); syncPlatforms({ 1: null, 2: null, 3: null }); syncOutside([]);
    const initial = []; for (let i = 0; i < 8; i += 1) { initial.push(makeService(nextServiceAt.current)); nextServiceAt.current += SERVICE_INTERVAL; }
    syncServices(initial); setNow(0); setMessage('Swipe door het station. De reizigersstroom laat zien waar je volgende uitbreiding nodig is.'); setPhase('playing');
  };

  const doUpgrade = (kind) => {
    const map = {
      parking: [parkingCost(parkingLevelRef.current), parkingLevelRef, setParkingLevel, 'Parkeren uitgebreid: meer capaciteit én meer reizigersaanvoer.'],
      gates: [gateCost(gateLevelRef.current), gateLevelRef, setGateLevel, 'Meer poortjes: de wachtrij stroomt sneller de hal in.'],
      hall: [hallCost(hallLevelRef.current), hallLevelRef, setHallLevel, 'Stationshal groter: meer ruimte en hogere doorstroming.'],
      platforms: [platformCost(platformLevelRef.current), platformLevelRef, setPlatformLevel, 'Perrons groter: meer wachtenden kunnen veilig worden verwerkt.'],
      fleet: [fleetCost(fleetLevelRef.current), fleetLevelRef, setFleetLevel, 'Treinvloot uitgebreid: toekomstige treinen krijgen meer stellen.'],
      retail: [retailCost(retailLevelRef.current), retailLevelRef, setRetailLevel, 'Winkelzone uitgebreid: meer passief inkomen.'],
      tickets: [ticketCost(ticketLevelRef.current), ticketLevelRef, setTicketLevel, 'Service verbeterd: hogere opbrengst per vervoerde reiziger.'],
    };
    const entry = map[kind]; if (!entry) return;
    const [cost, ref, setter, text] = entry;
    if (!spend(cost)) return setMessage('Niet genoeg geld voor deze uitbreiding.');
    ref.current += 1; setter(ref.current); setMessage(text); persist();
  };

  const buildP3 = () => { if (platform3Ref.current) return; if (!spend(platform3Cost)) return setMessage('Niet genoeg geld voor Perron 3.'); platform3Ref.current = true; setPlatform3(true); setMessage('Perron 3 gebouwd: de isometrische wereld krijgt een derde volwaardig perron.'); persist(); };

  if (phase === 'menu') {
    return <SafeAreaView style={styles.screen}><StatusBar barStyle="light-content" /><View style={styles.menu}><Text style={styles.kicker}>ISOMETRIC STATION / V0.12</Text><Text style={styles.logo}>RAIL{`\n`}RUSH HOUR</Text><Text style={styles.subtitle}>Een scrollbare stationwereld: kijk hoe reizigers vanaf parkeren via poortjes en hal naar hun trein stromen. Bouw zichtbaar uit en houd de hele keten in balans.</Text><Pressable style={styles.primary} onPress={begin}><Text style={styles.primaryText}>{saved ? 'GA VERDER' : 'OPEN STATION'}</Text></Pressable></View></SafeAreaView>;
  }

  const hallTotal = sum(hallDemand);
  const platformTotal = sum(platformDemand);
  const openPlatforms = platform3 ? 3 : 2;
  const maxPlatformWaiting = Math.max(0, ...[1, 2, 3].filter((lane) => lane !== 3 || platform3).map((lane) => DESTINATIONS.reduce((acc, d) => { const s = services.find((svc) => svc.destination.id === d.id && svc.status !== 'departed'); return acc + ((s?.actualLane || s?.plannedLane) === lane ? platformDemand[d.id] : 0); }, 0)));
  const trainCapacityNow = Object.values(platforms).filter(Boolean).reduce((acc, t) => acc + t.capacity, 0) || openPlatforms * 180 * Math.max(1, fleetLevel);
  const balance = [
    { label: 'PARKEREN', pressure: clampPct(parkingQueue, parkingCap(parkingLevel)) },
    { label: 'ENTREE', pressure: clampPct(entranceQueue, entranceBuffer(gateLevel)) },
    { label: 'HAL', pressure: clampPct(hallTotal, hallCap(hallLevel)) },
    { label: 'PERRONS', pressure: clampPct(maxPlatformWaiting, platformCap(platformLevel)) },
    { label: 'TREINEN', pressure: Math.min(199, Math.round((platformTotal / Math.max(1, trainCapacityNow)) * 100)) },
  ];
  const bottleneck = [...balance].sort((a, b) => b.pressure - a.pressure)[0].label;
  const blocked = outside[0] && platforms[outside[0].plannedLane] ? outside[0] : null;

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <View style={styles.hud}>
        <View style={styles.hudCell}><Text style={styles.hudLabel}>KAS</Text><Text style={styles.hudMoney}>{money(cash)}</Text></View>
        <View style={styles.hudCell}><Text style={styles.hudLabel}>STATION</Text><Text style={styles.hudValue}>Lv {stationLevel}</Text></View>
        <View style={styles.hudCell}><Text style={styles.hudLabel}>TIJD</Text><Text style={styles.hudValue}>{clock(now).slice(0, 5)}</Text></View>
        <View style={styles.hudCell}><Text style={styles.hudLabel}>KNELPUNT</Text><Text style={styles.hudWarn}>{bottleneck}</Text></View>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.levelCard}><View style={styles.levelTop}><Text style={styles.levelTitle}>STATIONNIVEAU {stationLevel}</Text><Text style={styles.levelXp}>{xp}/{levelTarget(stationLevel)} XP</Text></View><View style={styles.levelTrack}><View style={[styles.levelFill, { width: `${clampPct(xp, levelTarget(stationLevel))}%` }]} /></View><Text style={styles.levelHint}>{transported} vervoerd • {handled} treinen • {onTime} binnen marge • {lost} gemiste instroom</Text></View>
        <BalanceBar data={balance} />
        <IsometricWorld scrollRef={worldScrollRef} parkingLevel={parkingLevel} gateLevel={gateLevel} hallLevel={hallLevel} retailLevel={retailLevel} ticketLevel={ticketLevel} platformLevel={platformLevel} stationLevel={stationLevel} platform3={platform3} parkingQueue={parkingQueue} entranceQueue={entranceQueue} hallDemand={hallDemand} platformDemand={platformDemand} platforms={platforms} services={services} now={now} bottleneck={bottleneck} onDepart={depart} />
        <View style={styles.message}><View style={styles.messageLamp} /><Text style={styles.messageText}>{message}</Text></View>
        {blocked ? <View style={styles.blockedCard}><View style={styles.blockedTop}><View><Text style={styles.blockedLabel}>TREIN WACHT BUITEN</Text><Text style={styles.blockedTrain}>{blocked.number} → {blocked.destination.name}</Text></View><Text style={styles.blockedDelay}>+{blocked.wait}s</Text></View><Text style={styles.blockedReason}>P{blocked.plannedLane} is bezet. Laat wachten of wijk uit.</Text><View style={styles.divertRow}>{[1, 2, 3].filter((lane) => lane !== blocked.plannedLane && (lane !== 3 || platform3)).map((lane) => <Pressable key={lane} disabled={Boolean(platforms[lane])} onPress={() => divert(lane)} style={[styles.divert, platforms[lane] && styles.disabled]}><Text style={styles.divertSmall}>{platforms[lane] ? 'BEZET' : 'WIJK UIT'}</Text><Text style={styles.divertBig}>P{lane}</Text></Pressable>)}</View></View> : null}
        <Timetable services={services} now={now} />
        <Text style={styles.sectionHeading}>UITBREIDEN</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.upgradeRail} nestedScrollEnabled>
          <Upgrade icon="🚗" title="PARKEREN" level={parkingLevel} description={`${parkingCap(parkingLevel)} plaatsen • +${parkingInflow(parkingLevel)}/s vraag`} cost={parkingCost(parkingLevel)} cash={cash} onPress={() => doUpgrade('parking')} focus={bottleneck === 'PARKEREN'} />
          <Upgrade icon="🚪" title="POORTJES" level={gateLevel} description={`${gateRate(gateLevel)}/s doorstroom`} cost={gateCost(gateLevel)} cash={cash} onPress={() => doUpgrade('gates')} focus={bottleneck === 'ENTREE'} />
          <Upgrade icon="🏢" title="HAL" level={hallLevel} description={`${hallCap(hallLevel)} capaciteit`} cost={hallCost(hallLevel)} cash={cash} onPress={() => doUpgrade('hall')} focus={bottleneck === 'HAL'} />
          <Upgrade icon="🚉" title="PERRONS" level={platformLevel} description={`${platformCap(platformLevel)} wachtenden/perron`} cost={platformCost(platformLevel)} cash={cash} onPress={() => doUpgrade('platforms')} focus={bottleneck === 'PERRONS'} />
          <Upgrade icon="🚆" title="TREINVLOOT" level={fleetLevel} description="Langere toekomstige treinen" cost={fleetCost(fleetLevel)} cash={cash} onPress={() => doUpgrade('fleet')} focus={bottleneck === 'TREINEN'} />
          <Upgrade icon="➕" title="PERRON 3" level={1} description="Extra spoorcapaciteit" cost={platform3Cost} cash={cash} onPress={buildP3} done={platform3} />
          <Upgrade icon="☕" title="WINKELS" level={retailLevel} description={`${money(retailIncome(retailLevel))}/s passief`} cost={retailCost(retailLevel)} cash={cash} onPress={() => doUpgrade('retail')} />
          <Upgrade icon="🎫" title="SERVICE" level={ticketLevel} description={`+${Math.round((fareMultiplier(ticketLevel) - 1) * 100)}% ritopbrengst`} cost={ticketCost(ticketLevel)} cash={cash} onPress={() => doUpgrade('tickets')} />
        </ScrollView>
      </ScrollView>
      <View style={styles.footer}><Text style={styles.footerText}>V0.12 • ISOMETRISCHE SCROLLWERELD • TIK GROENE TREIN VOOR VERTREK</Text></View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#071017' }, scroll: { flex: 1 }, content: { paddingHorizontal: 10, paddingBottom: 28 },
  menu: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }, kicker: { color: '#77b9dc', fontSize: 10, fontWeight: '900', letterSpacing: 2, marginBottom: 11 }, logo: { color: '#f0f5f7', fontSize: 48, lineHeight: 44, fontWeight: '900', letterSpacing: -2, textAlign: 'center' }, subtitle: { color: '#98a9b2', fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 390, marginTop: 18, marginBottom: 25 }, primary: { backgroundColor: '#ffd45f', minWidth: 230, borderRadius: 10, paddingVertical: 16, alignItems: 'center' }, primaryText: { color: '#111820', fontSize: 15, fontWeight: '900', letterSpacing: 1 },
  hud: { flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 6, backgroundColor: '#0a151c', borderBottomWidth: 1, borderBottomColor: '#21333d' }, hudCell: { flex: 1, alignItems: 'center' }, hudLabel: { color: '#647a86', fontSize: 6.2, fontWeight: '900' }, hudValue: { color: '#e8eff2', fontSize: 12.5, fontWeight: '900', marginTop: 2 }, hudMoney: { color: '#67e396', fontSize: 12.5, fontWeight: '900', marginTop: 2 }, hudWarn: { color: '#ffca62', fontSize: 7.8, fontWeight: '900', marginTop: 4 },
  levelCard: { marginTop: 8, backgroundColor: '#0f1b22', borderWidth: 1, borderColor: '#315064', borderRadius: 10, padding: 9 }, levelTop: { flexDirection: 'row', justifyContent: 'space-between' }, levelTitle: { color: '#dce9ee', fontSize: 9, fontWeight: '900' }, levelXp: { color: '#82afc6', fontSize: 7.5, fontWeight: '900' }, levelTrack: { height: 7, marginTop: 6, backgroundColor: '#1c2a32', borderRadius: 4, overflow: 'hidden' }, levelFill: { height: '100%', backgroundColor: '#58b9ff' }, levelHint: { color: '#71858f', fontSize: 6.8, marginTop: 5, fontWeight: '700' },
  balanceCard: { marginTop: 8, backgroundColor: '#121b20', borderWidth: 1, borderColor: '#394a54', borderRadius: 9, padding: 9 }, balanceHead: { flexDirection: 'row', justifyContent: 'space-between' }, balanceTitle: { color: '#8b9ea7', fontSize: 6.4, fontWeight: '900' }, balanceWorst: { color: '#ffd267', fontSize: 6.6, fontWeight: '900' }, balanceStages: { flexDirection: 'row', alignItems: 'center', marginTop: 8 }, balanceArrow: { color: '#60717a', fontSize: 14, marginHorizontal: 2 }, balanceStage: { flex: 1, minHeight: 35, borderRadius: 5, borderWidth: 1, borderColor: '#2c3d46', backgroundColor: '#172229', alignItems: 'center', justifyContent: 'center' }, balanceStageBad: { borderColor: '#e16e5d', backgroundColor: '#2b1b1a' }, balanceStageLabel: { color: '#899aa4', fontSize: 5.1, fontWeight: '900' }, balanceStageValue: { color: '#eef2f4', fontSize: 9, fontWeight: '900', marginTop: 2 },
  worldFrame: { marginTop: 8, borderWidth: 1, borderColor: '#345464', borderRadius: 12, overflow: 'hidden', backgroundColor: '#0a151b' }, worldFrameHead: { minHeight: 50, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#0d1b22', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, worldKicker: { color: '#6d8b98', fontSize: 6.2, fontWeight: '900', letterSpacing: 1 }, worldTitle: { color: '#e7f0f3', fontSize: 13, fontWeight: '900', marginTop: 2 }, swipeHint: { color: '#79c9f5', fontSize: 8, fontWeight: '900' }, jumpRow: { flexDirection: 'row', gap: 5, padding: 6, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#223741' }, jumpButton: { flex: 1, backgroundColor: '#14242d', borderWidth: 1, borderColor: '#315266', paddingVertical: 6, borderRadius: 6, alignItems: 'center' }, jumpText: { color: '#b8d0db', fontSize: 6.2, fontWeight: '900' }, worldScrollContent: { minWidth: WORLD_WIDTH }, worldCanvas: { width: WORLD_WIDTH, height: 430, position: 'relative', overflow: 'hidden', backgroundColor: '#11251e' }, worldGrass: { position: 'absolute', inset: 0, backgroundColor: '#163225' }, worldRoad: { position: 'absolute', left: -20, right: -20, bottom: 32, height: 88, backgroundColor: '#1d282d', transform: [{ rotateZ: '-3deg' }] },
  isoZone: { position: 'absolute' }, isoShadow: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.38)', borderRadius: 15, transform: [{ rotateZ: '-7deg' }, { skewX: '-18deg' }] }, isoFloor: { position: 'absolute', backgroundColor: '#293d43', borderWidth: 2, borderColor: '#516a70', borderRadius: 12, transform: [{ rotateZ: '-7deg' }, { skewX: '-18deg' }] }, isoFloorHot: { borderColor: '#ff785e', backgroundColor: '#47322c' }, zoneFloatTitle: { position: 'absolute', top: 0, left: 8, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(8,18,24,0.88)', paddingHorizontal: 7, paddingVertical: 5, borderRadius: 7 }, zoneNumber: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#2c7fc0', color: '#fff', textAlign: 'center', lineHeight: 22, fontWeight: '900', fontSize: 10 }, zoneName: { color: '#f0f5f7', fontSize: 8.5, fontWeight: '900' }, zoneSub: { color: '#8aa0aa', fontSize: 5.5, fontWeight: '800', marginTop: 1 }, zoneBottom: { position: 'absolute', left: 6, right: 8, bottom: 4 }, hotBadge: { position: 'absolute', right: 5, top: 37, backgroundColor: '#a84635', color: '#fff3e8', fontSize: 6.5, fontWeight: '900', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 5, overflow: 'hidden' },
  capacityPill: { backgroundColor: 'rgba(9,20,26,0.9)', borderWidth: 1, borderColor: '#405965', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 5 }, capacityPillDanger: { borderColor: '#e87561', backgroundColor: 'rgba(60,28,25,0.92)' }, capacityPillLabel: { color: '#76909c', fontSize: 5.1, fontWeight: '900' }, capacityPillValue: { color: '#e8eef1', fontSize: 8, fontWeight: '900', marginTop: 1 }, capacityMiniTrack: { height: 4, backgroundColor: '#22333a', borderRadius: 2, overflow: 'hidden', marginTop: 3 }, capacityMiniFill: { height: '100%', backgroundColor: '#5cc1ee' }, capacityMiniFillDanger: { backgroundColor: '#ec755f' },
  parkingGridIso: { position: 'absolute', left: 18, top: 61, width: 168, flexDirection: 'row', flexWrap: 'wrap', gap: 4, transform: [{ rotateZ: '-6deg' }, { skewX: '-10deg' }] }, parkingSlotIso: { width: 37, height: 25, borderWidth: 1, borderColor: '#758188', backgroundColor: '#1b292e', alignItems: 'center', justifyContent: 'center' }, parkingSlotIsoBusy: { backgroundColor: '#293a40' }, carIso: { width: 24, height: 11, borderRadius: 4, backgroundColor: '#4aa8ff', borderWidth: 1, borderColor: '#bfe3ff' }, carIsoAlt: { backgroundColor: '#ef6965', borderColor: '#ffc0bd' },
  gateDeck: { position: 'absolute', left: 34, top: 72, flexDirection: 'row', gap: 7, transform: [{ rotateZ: '-6deg' }] }, gateIso: { width: 24, height: 42, backgroundColor: '#31464e', borderWidth: 1, borderColor: '#718991', borderRadius: 3, justifyContent: 'flex-start', alignItems: 'center' }, gateIsoTop: { width: 21, height: 7, backgroundColor: '#1d2e35' }, gateIsoLight: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#57e790', marginTop: 8 }, queueLane: { position: 'absolute', left: 16, right: 16, top: 125, minHeight: 46 },
  stationBuildingIso: { position: 'absolute', left: 40, top: 67, height: 80, backgroundColor: '#3c5663', borderWidth: 2, borderColor: '#6d8c99', borderRadius: 4, transform: [{ rotateZ: '-5deg' }] }, stationRoofIso: { height: 21, backgroundColor: '#253942', alignItems: 'center', justifyContent: 'center' }, stationRoofText: { color: '#dfeff5', fontSize: 6, fontWeight: '900', letterSpacing: 1 }, stationWindowsIso: { flexDirection: 'row', gap: 5, paddingHorizontal: 8, paddingTop: 12 }, stationWindowIso: { width: 17, height: 23, backgroundColor: '#79b2cb', borderWidth: 1, borderColor: '#bce1f2' }, shopRowIso: { position: 'absolute', left: 29, top: 157, flexDirection: 'row', gap: 7 }, shopIso: { width: 82, height: 38, backgroundColor: '#4b3d2a', borderWidth: 1, borderColor: '#90734a', borderRadius: 4, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 5, gap: 4 }, shopEmoji: { fontSize: 12 }, shopText: { color: '#f4dfb9', fontSize: 5.5, fontWeight: '900' }, hallPeopleIso: { position: 'absolute', left: 20, right: 12, top: 205 },
  tinyPeople: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'flex-end' }, tinyPersonWrap: { width: 8, height: 14, alignItems: 'center' }, tinyHead: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#e5b98d' }, tinyBody: { width: 6, height: 7, borderRadius: 2, backgroundColor: '#7e9cab', marginTop: 1 },
  flowStream: { position: 'absolute', height: 48, zIndex: 8, justifyContent: 'center', overflow: 'hidden' }, flowLine: { position: 'absolute', left: 0, right: 0, top: 25, height: 3, opacity: .45 }, flowTraveler: { position: 'absolute', top: 15, width: 9, height: 18, alignItems: 'center' }, flowHead: { width: 6, height: 6, borderRadius: 3 }, flowBody: { width: 7, height: 9, borderRadius: 2, backgroundColor: '#d6e2e7', marginTop: 1 }, flowStreamLabel: { position: 'absolute', top: 2, left: 0, right: 0, color: '#d0dee4', fontSize: 5.2, fontWeight: '900', textAlign: 'center' }, flowArrow: { position: 'absolute', right: 3, top: 17, fontSize: 14, fontWeight: '900' },
  platformStackIso: { position: 'absolute', left: 12, right: 7, top: 56 }, platformIso: { height: 91, position: 'relative', marginBottom: 3 }, platformSlabIso: { position: 'absolute', left: 4, right: 3, top: 9, height: 62, backgroundColor: '#46545a', borderLeftWidth: 7, transform: [{ skewX: '-12deg' }] }, railIso: { position: 'absolute', left: 7, right: 0, top: 55, height: 19, backgroundColor: '#182125', transform: [{ skewX: '-12deg' }], paddingTop: 5 }, railLineIso: { height: 2, marginBottom: 5, backgroundColor: '#8b969b' }, platformSignIso: { position: 'absolute', left: 7, top: 15, backgroundColor: '#0a171d', paddingHorizontal: 5, paddingVertical: 3, borderRadius: 4 }, platformSignNum: { color: '#fff', fontSize: 7.5, fontWeight: '900' }, platformSignDest: { fontSize: 5.5, fontWeight: '900' }, trainPositionIso: { position: 'absolute', left: 65, top: 35, alignItems: 'center' }, trainRowIso: { flexDirection: 'row', alignItems: 'center' }, trainSetIso: { width: 55, height: 21, borderWidth: 2, borderRadius: 5, backgroundColor: '#d9edf8', position: 'relative', overflow: 'hidden', transform: [{ skewX: '-8deg' }] }, trainSetIsoReady: { backgroundColor: '#b8f7cb' }, trainSetIsoLate: { backgroundColor: '#f7b0b7' }, trainNoseIso: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 7 }, trainWindowsIso: { position: 'absolute', top: 4, left: 12, right: 5, flexDirection: 'row', justifyContent: 'space-around' }, trainWindowIso: { width: 8, height: 4, borderRadius: 1, backgroundColor: '#31566b' }, trainCodeIso: { color: '#183848', fontSize: 5.5, fontWeight: '900', marginTop: 8, textAlign: 'center' }, couplerIso: { width: 5, height: 3, backgroundColor: '#89959a' }, trainTapIso: { padding: 2 }, trainStatusIso: { color: '#d5e2e7', fontSize: 5.2, fontWeight: '900', marginTop: 1, backgroundColor: '#102027', paddingHorizontal: 3, borderRadius: 2 }, platformCrowdIso: { position: 'absolute', left: 71, right: 8, top: 8 }, platformCountIso: { color: '#d5e0e5', fontSize: 5.3, fontWeight: '900', marginTop: 2 }, platformIsoLocked: { opacity: .45 }, buildTextIso: { position: 'absolute', left: 75, top: 28, color: '#d0b774', fontSize: 7, fontWeight: '900' }, readyText: { color: '#58e790' }, dangerText: { color: '#ff8875' },
  futureGround: { width: 80, height: 70, backgroundColor: '#26382e', borderWidth: 1, borderColor: '#50635a', borderStyle: 'dashed', transform: [{ rotateZ: '-7deg' }, { skewX: '-18deg' }] }, futureArrow: { color: '#75cfff', fontSize: 36, fontWeight: '900', textAlign: 'center', marginTop: -5 }, futureTitle: { color: '#d8e4e8', fontSize: 7, fontWeight: '900', textAlign: 'center' }, futureSub: { color: '#788d95', fontSize: 5.2, lineHeight: 8, textAlign: 'center', marginTop: 4 }, futureLevel: { color: '#ffce6e', fontSize: 6, fontWeight: '900', textAlign: 'center', marginTop: 3 }, worldLegend: { position: 'absolute', left: 14, bottom: 8, flexDirection: 'row', gap: 8 }, worldLegendText: { color: '#bfd0d7', backgroundColor: 'rgba(7,16,22,0.82)', fontSize: 6, fontWeight: '900', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 5 },
  message: { minHeight: 42, flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#0a1218', borderWidth: 1, borderColor: '#20323b', borderRadius: 8 }, messageLamp: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#5bbcf2', marginRight: 8 }, messageText: { flex: 1, color: '#a6b5bd', fontSize: 8.5, lineHeight: 12, fontWeight: '700' },
  blockedCard: { marginTop: 8, backgroundColor: '#2a1b0d', borderWidth: 1.5, borderColor: '#d3953c', borderRadius: 9, padding: 9 }, blockedTop: { flexDirection: 'row', justifyContent: 'space-between' }, blockedLabel: { color: '#bd9459', fontSize: 6.5, fontWeight: '900' }, blockedTrain: { color: '#ffe7b6', fontSize: 13, fontWeight: '900', marginTop: 2 }, blockedDelay: { color: '#ffc05b', fontSize: 15, fontWeight: '900' }, blockedReason: { color: '#bca071', fontSize: 8, marginTop: 6 }, divertRow: { flexDirection: 'row', gap: 7, marginTop: 8 }, divert: { flex: 1, minHeight: 44, borderRadius: 7, borderWidth: 1, borderColor: '#d1953d', backgroundColor: '#34240f', alignItems: 'center', justifyContent: 'center' }, divertSmall: { color: '#c4a46d', fontSize: 6, fontWeight: '900' }, divertBig: { color: '#ffda91', fontSize: 16, fontWeight: '900' }, disabled: { opacity: .3 },
  card: { marginTop: 8, backgroundColor: '#0d161d', borderWidth: 1, borderColor: '#2b3b45', borderRadius: 9, padding: 9 }, cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, cardTitle: { color: '#718591', fontSize: 6.8, fontWeight: '900' }, clock: { color: '#ffd65a', fontSize: 13, fontWeight: '900' }, serviceRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#182630' }, serviceTime: { width: 42, color: '#70d29a', fontSize: 8.5, fontWeight: '900' }, serviceMain: { flex: 1 }, serviceId: { color: '#e2ebef', fontSize: 9.5, fontWeight: '900' }, serviceDest: { fontSize: 6.8, fontWeight: '900' }, servicePlatform: { width: 26, color: '#58b9ff', fontSize: 8.5, fontWeight: '900', textAlign: 'center' }, serviceStatus: { width: 74, color: '#c5d1d7', fontSize: 6.3, fontWeight: '900', textAlign: 'right' },
  sectionHeading: { color: '#78909c', fontSize: 7.2, fontWeight: '900', letterSpacing: 1.1, textAlign: 'center', marginTop: 14, marginBottom: 7 }, upgradeRail: { paddingRight: 10, gap: 8 }, upgrade: { width: 145, minHeight: 170, backgroundColor: '#eef2f4', borderWidth: 2, borderColor: '#486375', borderRadius: 11, padding: 9, alignItems: 'center' }, upgradeAffordable: { borderColor: '#e1b54f' }, upgradeFocus: { borderColor: '#ef755e', borderWidth: 3 }, upgradeDone: { borderColor: '#45a873', backgroundColor: '#e7f6ec' }, upgradeIcon: { fontSize: 28 }, upgradeTitle: { color: '#19354a', fontSize: 9, fontWeight: '900', marginTop: 4 }, upgradeLevel: { color: '#3977a4', fontSize: 7, fontWeight: '900', marginTop: 2 }, upgradeDesc: { color: '#647985', fontSize: 6.4, textAlign: 'center', lineHeight: 9, marginTop: 7, flex: 1 }, upgradeButton: { width: '100%', backgroundColor: '#3c9f4b', borderRadius: 7, paddingVertical: 8, alignItems: 'center', marginTop: 8 }, upgradeButtonText: { color: '#fff', fontSize: 7, fontWeight: '900' }, footer: { alignItems: 'center', paddingVertical: 7, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: '#14212a' }, footerText: { color: '#42535e', fontSize: 6, fontWeight: '900', textAlign: 'center' },
});