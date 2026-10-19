import { useEffect, useRef, useState } from 'react';
import { MapController, type MapControllerCallbacks, type MapControllerInit } from '../map/MapController';
import { Notice, Spinner } from './ui';

interface MapViewProps {
  init: MapControllerInit;
  callbacks: MapControllerCallbacks;
  onReady(controller: MapController): void;
}

/** Monta el mapa una sola vez; las actualizaciones se aplican con los métodos del controlador. */
export function MapView({ init, callbacks, onReady }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const initRef = useRef(init);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let controller: MapController | null = null;
    // Proxy estable: el controlador siempre llama a los callbacks más recientes de React.
    const proxy = new Proxy({} as MapControllerCallbacks, {
      get: (_, key: keyof MapControllerCallbacks) => (...args: never[]) =>
        (callbacksRef.current[key] as (...a: never[]) => void)(...args),
    });
    MapController.create(containerRef.current!, initRef.current, proxy)
      .then((c) => {
        if (cancelled) {
          c.destroy();
          return;
        }
        controller = c;
        setState('ready');
        onReadyRef.current(c);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error(err);
        const name = (err as { name?: string }).name ?? '';
        setError(
          /GPU|WebGL/i.test(name + String(err))
            ? 'Tu navegador o dispositivo no admite WebGL2, necesario para el mapa 3D. Prueba con un navegador actualizado.'
            : 'No se pudo iniciar el mapa. Revisa tu conexión y recarga la página.',
        );
        setState('error');
      });
    return () => {
      cancelled = true;
      controller?.destroy();
    };
  }, []);

  return (
    <div className="map-wrap">
      <div className="map" ref={containerRef} />
      {state === 'loading' && (
        <div className="map-overlay">
          <Spinner label="Cargando mapa 3D…" />
        </div>
      )}
      {state === 'error' && (
        <div className="map-overlay">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
    </div>
  );
}
