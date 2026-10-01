import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X, Loader2 } from 'lucide-react';
import { enlaceDeImagen } from '../../utils/imagenesDeNotas';

// Miniaturas de las imágenes de una nota o contraseña. Pinchando se ven en
// grande; con `onQuitar` sale la X para quitarlas.
export default function ImagenesDeNota({ imagenes, llave = null, onQuitar }) {
  const [grande, setGrande] = useState(null);
  if (!imagenes?.length) return null;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {imagenes.map((img) => (
          <Miniatura key={img.ruta} imagen={img} llave={llave} onAbrir={setGrande} onQuitar={onQuitar && (() => onQuitar(img))} />
        ))}
      </div>
      {grande && (
        <div onClick={() => setGrande(null)} className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 cursor-zoom-out">
          <img src={grande} alt="" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
          <button onClick={() => setGrande(null)} className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full">
            <X size={22} />
          </button>
        </div>
      )}
    </>
  );
}

function Miniatura({ imagen, llave, onAbrir, onQuitar }) {
  const [url, setUrl] = useState(null);
  const [fallo, setFallo] = useState(null);

  useEffect(() => {
    let vivo = true;
    let soltar = null;
    enlaceDeImagen(imagen, llave)
      .then(({ url, liberar }) => {
        if (liberar) soltar = url;
        if (vivo) setUrl(url); else if (liberar) URL.revokeObjectURL(url);
      })
      .catch((e) => { if (vivo) setFallo(e.message); });
    return () => {
      vivo = false;
      if (soltar) URL.revokeObjectURL(soltar);
    };
    // Cada guardado de la nota trae objetos nuevos de la misma imagen: se mira
    // la ruta para no volver a bajarla (y descifrarla) a cada tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagen.ruta, llave]);

  return (
    <div className="relative group w-28 h-28 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
      {url ? (
        <img src={url} alt={imagen.nombre} onClick={() => onAbrir(url)} className="w-full h-full object-cover cursor-zoom-in" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400 p-2 text-center" title={fallo || ''}>
          {fallo ? 'No se puede abrir' : <Loader2 size={18} className="animate-spin" />}
        </div>
      )}
      {onQuitar && (
        <button
          type="button"
          onClick={onQuitar}
          title="Quitar imagen"
          className="absolute top-1 right-1 p-1 bg-white/90 hover:bg-red-50 text-slate-500 hover:text-red-600 rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/** Botón para elegir imágenes del ordenador. */
export function BotonAnadirImagen({ onFicheros, ocupado }) {
  const entrada = useRef(null);
  return (
    <>
      <button
        type="button"
        onClick={() => entrada.current?.click()}
        disabled={ocupado}
        className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 flex items-center gap-1.5"
      >
        {ocupado ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
        {ocupado ? 'Subiendo…' : 'Añadir imagen'}
      </button>
      <input
        ref={entrada}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const ficheros = Array.from(e.target.files || []);
          e.target.value = '';
          if (ficheros.length) onFicheros(ficheros);
        }}
      />
    </>
  );
}
