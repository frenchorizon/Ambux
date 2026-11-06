import { useEffect, useRef, useState } from "react";
import { TileLayer, useMap } from "react-leaflet";
import { useDark } from "../../lib/theme";
import { noteTileProvider, readTileTemplate, useTileProvider } from "../../lib/tiles";

interface TileProvider {
  url: string;
  france: boolean;
}

/** Fonds sans clé. Le premier qui répond reste affiché. */
const PROVIDERS: TileProvider[] = [
  { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", france: false },
  { url: "https://tile.openstreetmap.de/{z}/{x}/{y}.png", france: false },
  { url: "https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png", france: true },
];

const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function tileProviders(): TileProvider[] {
  const custom = readTileTemplate();
  if (!custom) return PROVIDERS;
  return [{ url: custom, france: false }, ...PROVIDERS];
}

export function OsmAttribution() {
  const index = useTileProvider();
  const france = tileProviders()[index]?.france === true;
  return (
    <p className="osm-attribution">
      ©{" "}
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
        OpenStreetMap
      </a>{" "}
      contributors
      {france ? (
        <>
          {" "}
          · ©{" "}
          <a href="https://www.openstreetmap.fr/" target="_blank" rel="noreferrer">
            OpenStreetMap France
          </a>
        </>
      ) : null}
    </p>
  );
}

export function Basemap() {
  const dark = useDark();
  const map = useMap();
  const [index, setIndex] = useState(0);
  const advancing = useRef(false);
  const providers = tileProviders();
  const url = providers[Math.min(index, providers.length - 1)]!.url;

  useEffect(() => {
    advancing.current = false;
    noteTileProvider(Math.min(index, providers.length - 1));
  }, [index, providers.length, url]);

  useEffect(() => {
    map.getContainer().classList.toggle("basemap-dark", dark);
  }, [dark, map]);

  return (
    <TileLayer
      key={url}
      attribution={ATTRIBUTION}
      url={url}
      maxZoom={19}
      eventHandlers={{
        tileerror: () => {
          if (advancing.current || index >= providers.length - 1) return;
          advancing.current = true;
          setIndex((current) => current + 1);
        },
      }}
    />
  );
}
