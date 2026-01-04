# Riverina Gold (Expo)

This scaffold provides a starting point for the Riverina Gold app (Narrandera, NSW). It includes a main map screen with an offline-first mindset and a dummy GeoJSON loader that simulates NSW MinView data.

Quick start

1. Install dependencies (from project root):

```bash
npm install
# or: yarn install
```

2. Start Expo:

```bash
npm start
# or: expo start
```

Notes & next steps

- Replace `src/data/dummyMines.json` with real GeoJSON exported from MinView.
- Add Map tile downloading/offline tile management (Mapbox offline packs or custom tile store).
- Integrate Supabase for sync of user finds.
 
Mapbox & Offline Tiles (scaffold)

- This repo includes a basic scaffold `src/components/OfflineManager.js` that saves a mock "offline pack" bbox to SQLite and stores a Mapbox token to device storage.
- To enable real offline tiles you should:
	1. Sign up at https://www.mapbox.com and create an access token.
	2. Install `@rnmapbox/maps` (native Mapbox SDK) and follow its installation steps for Expo/React Native. Note: some setups require EAS or the bare workflow.
	3. Update the app to use the Mapbox offline manager APIs to download tiles for a bounding box. The scaffold saves token to AsyncStorage key `MAPBOX_TOKEN` and stores pack bboxes in SQLite table `offline_packs`.

Dropping real MinView data

1. Export GeoJSON from MinView and save it as `src/data/mines.json`.
2. Restart the app — the map will prefer `src/data/mines.json` over the dummy dataset.

