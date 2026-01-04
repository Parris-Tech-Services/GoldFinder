import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, Alert, Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DB = Platform.OS === 'web' ? null : SQLite.openDatabase('riverina.db');

export default function OfflineManager({ visible, onClose, region }) {
  const [token, setToken] = useState('');
  const [name, setName] = useState('East Riverina Pack');

  async function saveToken() {
    try {
      await AsyncStorage.setItem('MAPBOX_TOKEN', token);
      Alert.alert('Saved', 'Mapbox token saved to device storage.');
    } catch (e) {
      Alert.alert('Error', 'Could not save token.');
    }
  }

  function createOfflinePack() {
    if (Platform.OS === 'web') {
      Alert.alert('Unavailable', 'Offline tile packs are not available on web.');
      onClose && onClose();
      return;
    }
    if (!region) {
      Alert.alert('Region needed', 'Move the map to the area you want to save first.');
      return;
    }
    DB.transaction(tx => {
      tx.executeSql('create table if not exists offline_packs (id integer primary key not null, name text, north real, south real, east real, west real, created_at text);');
      tx.executeSql('insert into offline_packs (name, north, south, east, west, created_at) values (?, ?, ?, ?, ?, datetime("now"));', [
        name,
        region.latitude + (region.latitudeDelta/2),
        region.latitude - (region.latitudeDelta/2),
        region.longitude + (region.longitudeDelta/2),
        region.longitude - (region.longitudeDelta/2)
      ]);
    }, (err) => {
      Alert.alert('DB Error', String(err));
    }, () => {
      Alert.alert('Offline pack saved', 'Mock offline pack stored locally. Implement Mapbox SDK to download tiles.');
      onClose && onClose();
    });
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <Text style={styles.title}>Offline Tiles (Mapbox Scaffold)</Text>
        <Text style={styles.hint}>Enter a Mapbox token to enable real tile downloads (not performed by scaffold).</Text>

        <TextInput placeholder="Mapbox Access Token" value={token} onChangeText={setToken} style={styles.input} autoCapitalize="none" />
        <TouchableOpacity style={styles.btn} onPress={saveToken}><Text style={styles.btnText}>Save Token</Text></TouchableOpacity>

        <TextInput placeholder="Pack name" value={name} onChangeText={setName} style={styles.input} />
        <View style={styles.row}>
          <TouchableOpacity style={styles.btn} onPress={createOfflinePack}><Text style={styles.btnText}>Download Tiles (mock)</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.close]} onPress={onClose}><Text style={styles.btnText}>Close</Text></TouchableOpacity>
        </View>

        <Text style={styles.note}>Note: This component stores a mock pack bounding box in SQLite. To actually download tiles, integrate `@rnmapbox/maps` offline manager or Mapbox SDK and read the saved token from device storage.</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#07110a' },
  title: { color: '#d6c15a', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  hint: { color: '#9dd78a', marginBottom: 12 },
  input: { backgroundColor: '#0f2b18', color: '#dfeee0', padding: 10, borderRadius: 6, marginBottom: 10 },
  btn: { backgroundColor: '#15301f', padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 8 },
  btnText: { color: '#ffd166', fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  close: { backgroundColor: '#1a2220' },
  note: { color: '#9dd78a', marginTop: 16 }
});
