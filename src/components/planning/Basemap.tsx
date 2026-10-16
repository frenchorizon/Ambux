import { useEffect, useRef, useState } from "react";
import { TileLayer, useMap } from "react-leaflet";
import { useDark } from "../../lib/theme";

/** Fonds sans clé. Le premier qui répond reste affiché. */
const PROVIDERS = [
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  "https://tile.openstreetmap.de/{z}/{x}/{y}.png",
  "https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png",
];

const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export function Basemap() {
  const dark = useDark();
  const map = useMap();
  const [index, setIndex] = useState(0);
  const advancing = useRef(false);
  const url = PROVIDERS[Math.min(index, PROVIDERS.length - 1)]!;

  useEffect(() => {
    advancing.current = false;
  }, [url]);

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
          if (advancing.current || index >= PROVIDERS.length - 1) return;
          advancing.current = true;
          setIndex((current) => current + 1);
        },
      }}
    />
  );
}
