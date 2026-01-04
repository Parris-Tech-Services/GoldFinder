import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, ActivityIndicator, Alert, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as SQLite from 'expo-sqlite';
import dummyMines from '../data/dummyMines.json';
import dummyGeology from '../data/dummyGeology.json';
import OfflineManager from '../components/OfflineManager';

// optional external mines file: if you place `src/data/mines.json` it will be used instead of the dummy
let externalMines = null;
try {
  externalMines = require('../data/mines.json');
} catch (e) {
  externalMines = null;
}

const DB = SQLite.openDatabase('riverina.db');
const NARRANDERA = {
  latitude: -34.74,
  longitude: 146.55,
  latitudeDelta: 0.3,
  longitudeDelta: 0.3
};

export default function MapScreen() {
  const [mapType, setMapType] = useState('standard');
  const [geologyLayer, setGeologyLayer] = useState(true);
  const [mines, setMines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tracking, setTracking] = useState(false);
  const [trail, setTrail] = useState([]);
  const watchRef = useRef(null);
  const mapRef = useRef(null);
  const [showOfflineManager, setShowOfflineManager] = useState(false);
  const [currentRegion, setCurrentRegion] = useState(null);
  const RNMaps = Platform.OS !== 'web' ? require('react-native-maps') : null;
  const { default: MapView, Marker, Polyline, Polygon, PROVIDER_GOOGLE } = RNMaps || {};

  useEffect(() => {
    initDB();
    loadDummyMines();
    return () => stopTracking();
  }, []);

  function initDB() {
    if (Platform.OS === 'web') return;
    DB.transaction(tx => {
      tx.executeSql(
        'create table if not exists mines (id integer primary key not null, name text, lat real, lon real, type text);'
      );
    });
  }

  function loadDummyMines() {
    // Simulate async fetch + store to SQLite
    setTimeout(() => {
      const source = externalMines && externalMines.features ? externalMines : dummyMines;
      const features = source.features || [];
      if (Platform.OS === 'web') {
        const arr = features.map((f, i) => {
          const props = f.properties || {};
          let lon, lat;
          if (f.geometry.type === 'Point') {
            [lon, lat] = f.geometry.coordinates;
          } else if (f.geometry.type === 'LineString') {
            [lon, lat] = f.geometry.coordinates[0];
          } else if (f.geometry.type === 'Polygon') {
            [lon, lat] = f.geometry.coordinates[0][0];
          } else {
            [lon, lat] = [146.55, -34.74];
          }
          return { id: i + 1, name: props.name || `Mine ${i + 1}`, latitude: lat, longitude: lon, type: props.type || 'historical' };
        });
        setMines(arr);
        setLoading(false);
        return;
      }
      DB.transaction(tx => {
        features.forEach((f, i) => {
          const props = f.properties || {};
          let lon, lat;
          if (f.geometry.type === 'Point') {
            [lon, lat] = f.geometry.coordinates;
          } else if (f.geometry.type === 'LineString') {
            [lon, lat] = f.geometry.coordinates[0];
          } else if (f.geometry.type === 'Polygon') {
            [lon, lat] = f.geometry.coordinates[0][0];
          } else {
            [lon, lat] = [146.55, -34.74];
          }
          tx.executeSql('insert into mines (name, lat, lon, type) values (?, ?, ?, ?);', [props.name || `Mine ${i+1}`, lat, lon, props.type || 'historical']);
        });
      }, null, () => {
        // load from db
        DB.transaction(tx => {
          tx.executeSql('select * from mines;', [], (_, { rows }) => {
            const arr = rows._array.map(r => ({ id: r.id, name: r.name, latitude: r.lat, longitude: r.lon, type: r.type }));
            setMines(arr);
            setLoading(false);
          });
        });
      });
    }, 600);
  }

  async function startTracking() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Location permission is needed for GPS tracking.');
      return;
    }
    setTrail([]);
    const watchId = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Highest, distanceInterval: 2 },
      (loc) => {
        const coord = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setTrail(t => [...t, coord]);
        if (mapRef.current) mapRef.current.animateToRegion({ ...coord, latitudeDelta: 0.005, longitudeDelta: 0.005 }, 500);
      }
    );
    watchRef.current = watchId;
    setTracking(true);
  }

  function stopTracking() {
    if (watchRef.current) {
      watchRef.current.remove();
      watchRef.current = null;
    }
    setTracking(false);
  }

  function dropPin(type = 'Found Gold') {
    // Add a marker at center of map
    if (Platform.OS === 'web') {
      const reg = currentRegion || NARRANDERA;
      const coord = { latitude: reg.latitude, longitude: reg.longitude };
      setMines(prev => [
        ...prev,
        { id: Date.now(), name: type, latitude: coord.latitude, longitude: coord.longitude, type: 'user' }
      ]);
      return;
    }
    if (mapRef.current) {
      mapRef.current.getCamera().then(cam => {
        const coord = { latitude: cam.center.latitude, longitude: cam.center.longitude };
        DB.transaction(tx => {
          tx.executeSql('insert into mines (name, lat, lon, type) values (?, ?, ?, ?);', [type, coord.latitude, coord.longitude, 'user']);
          tx.executeSql('select * from mines;', [], (_, { rows }) => {
            const arr = rows._array.map(r => ({ id: r.id, name: r.name, latitude: r.lat, longitude: r.lon, type: r.type }));
            setMines(arr);
          });
        });
      });
    }
  }

  function toggleMapType() {
    setMapType(t => (t === 'standard' ? 'satellite' : 'standard'));
  }

  return (
    <View style={styles.container}>
      {Platform.OS === 'web' ? (
        <View style={styles.map}>
          <View style={styles.webNotice}>
            <Text style={styles.webTitle}>Web preview</Text>
            <Text style={styles.webText}>Map rendering is disabled on web in this scaffold.</Text>
            <Text style={styles.webText}>Use the controls to manage layers and pins.</Text>
          </View>
        </View>
      ) : (
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          mapType={mapType}
          initialRegion={NARRANDERA}
          onRegionChangeComplete={(reg) => setCurrentRegion(reg)}
        >
          {geologyLayer && dummyGeology.features.map((f, idx) => {
            if (f.geometry.type === 'LineString') {
              const coords = f.geometry.coordinates.map(c => ({ latitude: c[1], longitude: c[0] }));
              return <Polyline key={`fault-${idx}`} coordinates={coords} strokeColor="#ff6b6b" strokeWidth={3} lineDashPattern={[6,4]} />;
            }
            if (f.geometry.type === 'Polygon') {
              const coords = f.geometry.coordinates[0].map(c => ({ latitude: c[1], longitude: c[0] }));
              return <Polygon key={`poly-${idx}`} coordinates={coords} fillColor={f.properties.unit === 'Silurian' ? 'rgba(255,215,130,0.25)' : 'rgba(160,220,160,0.2)'} strokeColor={'rgba(200,200,200,0.6)'} />;
            }
            return null;
          })}
          {mines.map(m => (
            <Marker key={m.id} coordinate={{ latitude: m.latitude, longitude: m.longitude }} title={m.name} pinColor={m.type === 'user' ? '#ffd166' : '#f4a261'} />
          ))}
          {trail.length > 1 && <Polyline coordinates={trail} strokeColor="#a8ff6f" strokeWidth={4} />}
        </MapView>
      )}

      <View style={styles.controls}>
        <View style={styles.row}>
          <TouchableOpacity style={styles.btn} onPress={toggleMapType}>
            <Text style={styles.btnText}>{mapType === 'standard' ? 'Satellite' : 'Topographic'}</Text>
          </TouchableOpacity>

          <View style={styles.layerToggle}>
            <Text style={styles.label}>Geology</Text>
            <Switch value={geologyLayer} onValueChange={setGeologyLayer} thumbColor="#d6c15a" trackColor={{ true: '#1b4720' }} />
          </View>
        </View>

        <View style={styles.row}>
          <TouchableOpacity style={styles.action} onPress={() => dropPin('Found Gold')}>
            <Text style={styles.actionText}>Drop: Gold</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.action} onPress={() => dropPin('Quartz Reef')}>
            <Text style={styles.actionText}>Drop: Quartz</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.action} onPress={() => dropPin('Camping Spot')}>
            <Text style={styles.actionText}>Drop: Camp</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.row}>
          <TouchableOpacity style={[styles.trackBtn, tracking ? styles.trackOn : null]} onPress={() => (tracking ? stopTracking() : startTracking())}>
            <Text style={styles.trackText}>{tracking ? 'Stop Track' : 'Start Track'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tenementBtn} onPress={() => Alert.alert('Tenement Overlay', 'Tenement polygons toggled (mock).')}>
            <Text style={styles.trackText}>Tenement Checker</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tenementBtn} onPress={() => setShowOfflineManager(true)}>
            <Text style={styles.trackText}>Offline Tiles</Text>
          </TouchableOpacity>
        </View>

        {loading && (
          <View style={styles.loading}>
            <ActivityIndicator color="#d6c15a" />
            <Text style={styles.loadingText}>Loading geological data...</Text>
          </View>
        )}
      </View>
      <OfflineManager visible={showOfflineManager} onClose={() => setShowOfflineManager(false)} region={currentRegion || NARRANDERA} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#07110a' },
  map: { flex: 1 },
  webNotice: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  webTitle: { color: '#d6c15a', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  webText: { color: '#9dd78a' },
  controls: { position: 'absolute', top: 12, left: 12, right: 12, padding: 8 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  btn: { backgroundColor: '#102012', padding: 10, borderRadius: 8, marginRight: 10, minWidth: 110, alignItems: 'center' },
  btnText: { color: '#d6c15a', fontWeight: '700' },
  layerToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 1, paddingRight: 8 },
  label: { color: '#a6f28b', marginRight: 8, fontWeight: '600' },
  action: { backgroundColor: '#15301f', padding: 8, borderRadius: 8, marginRight: 8 },
  actionText: { color: '#ffd166', fontWeight: '700' },
  trackBtn: { backgroundColor: '#12321f', padding: 10, borderRadius: 8, marginRight: 8 },
  trackOn: { backgroundColor: '#274e2f' },
  trackText: { color: '#bff29a', fontWeight: '700' },
  tenementBtn: { backgroundColor: '#18302a', padding: 10, borderRadius: 8 },
  loading: { position: 'absolute', bottom: 12, left: 12, right: 12, backgroundColor: '#08140b', padding: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center' },
  loadingText: { color: '#9dd78a', marginLeft: 8 }
});
