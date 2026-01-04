import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, ActivityIndicator, Alert } from 'react-native';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl from 'maplibre-gl';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import dummyMines from '../data/dummyMines.json';
import OfflineManager from '../components/OfflineManager';
import dummyGeology from '../data/dummyGeology.json';

let externalMines = null;
try {
  externalMines = require('../data/mines.json');
} catch (e) {
  externalMines = null;
}

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
  const [showOfflineManager, setShowOfflineManager] = useState(false);
  const [currentRegion, setCurrentRegion] = useState(NARRANDERA);
  const watchRef = useRef(null);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [mapboxToken, setMapboxToken] = useState(null);
  const [styleReady, setStyleReady] = useState(false);
  const DEFAULT_STYLE = 'osm';
  const FALLBACK_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

  useEffect(() => {
    const source = externalMines && externalMines.features ? externalMines : dummyMines;
    const features = source.features || [];
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
  }, []);

  useEffect(() => {
    AsyncStorage.getItem('MAPBOX_TOKEN').then(t => {
      if (t) setMapboxToken(t);
    }).catch(() => {});
  }, []);

  function buildOsmStyle() {
    return {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: [
            'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
          ],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors'
        }
      },
      layers: [
        { id: 'osm', type: 'raster', source: 'osm' }
      ]
    };
  }

  function buildTopoStyle() {
    return {
      version: 8,
      sources: {
        topo: {
          type: 'raster',
          tiles: [
            'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
            'https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
            'https://c.tile.opentopomap.org/{z}/{x}/{y}.png'
          ],
          tileSize: 256,
          attribution: '© OpenTopoMap (CC-BY-SA), © OpenStreetMap contributors'
        }
      },
      layers: [
        { id: 'topo', type: 'raster', source: 'topo' }
      ]
    };
  }

  function buildSatelliteStyle(token) {
    return `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12?access_token=${token}`;
  }

  useEffect(() => {
    const center = [currentRegion.longitude, currentRegion.latitude];
    const style = DEFAULT_STYLE === 'osm' ? buildOsmStyle() : DEFAULT_STYLE;
    const container = mapRef.current;
    if (!container) return;
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new maplibregl.Map({
        container,
        style,
        center,
        zoom: 10
      });
      mapInstanceRef.current.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
      mapInstanceRef.current.on('error', (e) => {
        try {
          if (mapInstanceRef.current && mapInstanceRef.current.getStyle().sprite && !styleReady) {
            return;
          }
        } catch (_) {}
        if (mapInstanceRef.current) {
          mapInstanceRef.current.setStyle(FALLBACK_STYLE);
          setStyleReady(false);
          mapInstanceRef.current.once('idle', () => {
            setStyleReady(true);
            renderGeologyLayers();
            renderMinesMarkers();
          });
        }
      });
      mapInstanceRef.current.on('moveend', () => {
        const c = mapInstanceRef.current.getCenter();
        setCurrentRegion({ latitude: c.lat, longitude: c.lng, latitudeDelta: 0.3, longitudeDelta: 0.3 });
      });
      mapInstanceRef.current.on('idle', () => {
        setStyleReady(true);
        renderGeologyLayers();
        renderMinesMarkers();
      });
    } else {
      mapInstanceRef.current.setCenter(center);
    }
  }, [currentRegion.longitude, currentRegion.latitude]);

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    if (!styleReady) {
      mapInstanceRef.current.once('idle', () => {
        setStyleReady(true);
        clearGeologyLayers();
        if (geologyLayer) renderGeologyLayers();
      });
      return;
    }
    clearGeologyLayers();
    if (geologyLayer) renderGeologyLayers();
  }, [geologyLayer, styleReady]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    let toStyle = null;
    if (mapType === 'satellite') {
      toStyle = mapboxToken ? buildSatelliteStyle(mapboxToken) : null;
    } else if (mapType === 'topographic') {
      toStyle = buildTopoStyle();
    } else {
      toStyle = buildOsmStyle();
    }
    if (!toStyle) {
      Alert.alert('Satellite requires token', 'Save your Mapbox token in Offline Tiles to enable satellite.');
      return;
    }
    map.setStyle(toStyle);
    setStyleReady(false);
    map.once('idle', () => {
      setStyleReady(true);
      renderGeologyLayers();
      renderMinesMarkers();
    });
  }, [mapType, mapboxToken]);

  function renderGeologyLayers() {
    const map = mapInstanceRef.current;
    if (!map || !styleReady || !map.isStyleLoaded()) return;
    const lines = {
      type: 'FeatureCollection',
      features: dummyGeology.features.filter(f => f.geometry.type === 'LineString')
    };
    const polys = {
      type: 'FeatureCollection',
      features: dummyGeology.features.filter(f => f.geometry.type === 'Polygon')
    };
    if (!map.getSource('geology-lines')) {
      map.addSource('geology-lines', { type: 'geojson', data: lines });
      map.addLayer({
        id: 'geology-lines',
        type: 'line',
        source: 'geology-lines',
        paint: { 'line-color': '#ff6b6b', 'line-width': 3, 'line-dasharray': [6, 4] }
      });
    }
    if (!map.getSource('geology-polys')) {
      map.addSource('geology-polys', { type: 'geojson', data: polys });
      map.addLayer({
        id: 'geology-polys',
        type: 'fill',
        source: 'geology-polys',
        paint: { 'fill-color': ['case', ['==', ['get', 'unit'], 'Silurian'], 'rgba(255,215,130,0.25)', 'rgba(160,220,160,0.2)'], 'fill-outline-color': 'rgba(200,200,200,0.6)' }
      });
    }
  }

  function clearGeologyLayers() {
    const map = mapInstanceRef.current;
    if (!map || !styleReady || !map.isStyleLoaded()) return;
    ['geology-lines', 'geology-polys'].forEach(id => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    ['geology-lines', 'geology-polys'].forEach(id => {
      if (map.getSource(id)) map.removeSource(id);
    });
  }

  function renderMinesMarkers() {
    const map = mapInstanceRef.current;
    if (!map) return;
    const container = mapRef.current;
    if (!container) return;
    const existing = container.querySelectorAll('.mine-marker');
    existing.forEach(el => el.remove());
    mines.forEach(m => {
      const el = document.createElement('div');
      el.className = 'mine-marker';
      el.style.width = '14px';
      el.style.height = '14px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = m.type === 'user' ? '#ffd166' : '#f4a261';
      el.style.border = '2px solid #1a1a1a';
      const marker = new maplibregl.Marker(el).setLngLat([m.longitude, m.latitude]).addTo(map);
      el.setAttribute('data-marker', '1');
    });
    if (trail.length > 1 && styleReady && map.isStyleLoaded()) {
      const trailGeo = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: trail.map(t => [t.longitude, t.latitude]) }
        }]
      };
      if (map.getSource('trail')) {
        map.getSource('trail').setData(trailGeo);
      } else {
        map.addSource('trail', { type: 'geojson', data: trailGeo });
        map.addLayer({
          id: 'trail',
          type: 'line',
          source: 'trail',
          paint: { 'line-color': '#a8ff6f', 'line-width': 4 }
        });
      }
    } else {
      if (styleReady && map.isStyleLoaded()) {
        if (map.getLayer('trail')) map.removeLayer('trail');
        if (map.getSource('trail')) map.removeSource('trail');
      }
    }
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
        setCurrentRegion({ ...coord, latitudeDelta: 0.005, longitudeDelta: 0.005 });
        renderMinesMarkers();
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

  async function toggleMapType() {
    setMapType(t => (t === 'standard' ? 'satellite' : 'standard'));
    if (!mapboxToken) {
      try {
        const token = await AsyncStorage.getItem('MAPBOX_TOKEN');
        if (token) setMapboxToken(token);
      } catch (e) {}
    }
  }

  function dropPin(type = 'Found Gold') {
    const map = mapInstanceRef.current;
    const c = map ? map.getCenter() : { lat: currentRegion.latitude, lng: currentRegion.longitude };
    const coord = { latitude: c.lat || currentRegion.latitude, longitude: c.lng || currentRegion.longitude };
    setMines(prev => [
      ...prev,
      { id: Date.now(), name: type, latitude: coord.latitude, longitude: coord.longitude, type: 'user' }
    ]);
    renderMinesMarkers();
  }

  return (
    <View style={styles.container}>
      <View style={styles.map} ref={mapRef} />

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
