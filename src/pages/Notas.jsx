import { useEffect, useMemo, useRef, useState } from 'react';
import { StickyNote, KeyRound, Plus, Trash2, Search, Lock, Unlock, Eye, EyeOff, Copy, Check, Pencil, X, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  crearComprobante,
  abrirConComprobante,
  cifrarClave,
  descifrarClave,
  validarNuevaLlaveMaestra,
} from '../utils/cifrarClaves';
import { subirImagen, borrarImagenes, imagenesDelPortapapeles } from '../utils/imagenesDeNotas';
import ImagenesDeNota, { BotonAnadirImagen } from '../components/notas/ImagenesDeNota';

// Pestaña "Notas" de Administración: apuntes sueltos (lo que antes iba a
// OneNote) y una libreta de contraseñas cifrada con una llave maestra.
// Tabla y permisos: supabase/36_notas_de_la_oficina.sql.

const TABLA = 'notas_oficina';

const fechaCorta = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) + ' ' +
    d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
};

const tituloDeNota = (n) => n.titulo?.trim() || n.texto?.trim().split('\n')[0]?.slice(0, 60) || 'Nota sin título';

const coincide = (textos, busqueda) => {
  const q = busqueda.trim().toLowerCase();
  if (!q) return true;
  return textos.some((t) => (t || '').toLowerCase().includes(q));
};

const mensajeDeError = (error) => {
  if (/imagenes/i.test(error?.message || '')) {
    return 'Falta la columna de imágenes: hay que ejecutar supabase/37_imagenes_en_las_notas.sql en el SQL Editor de Supabase.';
  }
  if (error?.code === '42P01' || /does not exist|schema cache/i.test(error?.message || '')) {
    return 'Falta crear la tabla de notas: hay que ejecutar supabase/36_notas_de_la_oficina.sql en el SQL Editor de Supabase.';
  }
  return error?.message || 'No se pudo hablar con el servidor.';
};

export default function Notas() {
  const [pestana, setPestana] = useState('notas');
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vivo = true;
    supabase.from(TABLA).select('*').order('updated_at', { ascending: false }).then(({ data, error }) => {
      if (!vivo) return;
      if (error) setError(mensajeDeError(error));
      else setFilas(data || []);
      setCargando(false);
    });
    return () => { vivo = false; };
  }, []);

  const notas = filas.filter((f) => f.tipo === 'nota');
  const claves = filas.filter((f) => f.tipo === 'clave');
  const comprobante = filas.find((f) => f.tipo === 'comprobante') || null;

  const insertar = async (fila) => {
    const { data, error } = await supabase.from(TABLA).insert(fila).select().single();
    if (error) throw new Error(mensajeDeError(error));
    setFilas((prev) => [data, ...prev]);
    return data;
  };

  const actualizar = async (id, cambios) => {
    const conFecha = { ...cambios, updated_at: new Date().toISOString() };
    const { data, error } = await supabase.from(TABLA).update(conFecha).eq('id', id).select();
    if (error) throw new Error(mensajeDeError(error));
    if (!data?.length) throw new Error('No se guardó: el servidor no devolvió la nota (¿sesión de oficina?).');
    setFilas((prev) => prev.map((f) => (f.id === id ? data[0] : f)));
  };

  const borrar = async (id) => {
    const imagenes = filas.find((f) => f.id === id)?.imagenes;
    const { error } = await supabase.from(TABLA).delete().eq('id', id);
    if (error) throw new Error(mensajeDeError(error));
    setFilas((prev) => prev.filter((f) => f.id !== id));
    await borrarImagenes(imagenes);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Notas</h1>
          <p className="text-slate-500 text-sm">Apuntes de la oficina y contraseñas guardadas. Sólo lo ve Administración.</p>
        </div>
        <div className="flex bg-slate-100 rounded-xl p-1">
          <button
            onClick={() => setPestana('notas')}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${pestana === 'notas' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <StickyNote size={16} /> Notas ({notas.length})
          </button>
          <button
            onClick={() => setPestana('claves')}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${pestana === 'claves' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <KeyRound size={16} /> Contraseñas ({claves.length})
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-4 text-sm font-medium">{error}</div>
      )}

      {cargando ? (
        <div className="text-slate-400 text-sm p-8 text-center">Cargando notas…</div>
      ) : !error && (
        pestana === 'notas'
          ? <LibretaDeNotas notas={notas} onCrear={insertar} onGuardar={actualizar} onBorrar={borrar} />
          : <LibretaDeClaves claves={claves} comprobante={comprobante} onCrear={insertar} onGuardar={actualizar} onBorrar={borrar} />
      )}
    </div>
  );
}

// ─────────────────────────────── Notas ───────────────────────────────

function LibretaDeNotas({ notas, onCrear, onGuardar, onBorrar }) {
  const [busqueda, setBusqueda] = useState('');
  const [seleccion, setSeleccion] = useState(notas[0]?.id || null);
  const [aviso, setAviso] = useState(null);

  const visibles = notas.filter((n) => coincide([n.titulo, n.texto], busqueda));
  const nota = notas.find((n) => n.id === seleccion) || null;

  const nueva = async () => {
    try {
      const creada = await onCrear({ tipo: 'nota', titulo: '', texto: '' });
      setBusqueda('');
      setSeleccion(creada.id);
    } catch (e) {
      setAviso(e.message);
    }
  };

  const eliminar = async () => {
    if (!nota) return;
    if (!window.confirm(`¿Borrar la nota "${tituloDeNota(nota)}"? No se puede deshacer.`)) return;
    try {
      await onBorrar(nota.id);
      setSeleccion(null);
    } catch (e) {
      setAviso(e.message);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4 min-h-[65vh]">
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm flex flex-col overflow-hidden">
        <div className="p-3 border-b border-slate-100 space-y-2">
          <button onClick={nueva} className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2">
            <Plus size={16} /> Nueva nota
          </button>
          <Buscador valor={busqueda} onCambio={setBusqueda} />
        </div>
        <div className="flex-1 overflow-y-auto">
          {visibles.length === 0 && (
            <p className="text-slate-400 text-sm p-4 text-center">{notas.length ? 'Nada coincide con la búsqueda.' : 'Todavía no hay notas.'}</p>
          )}
          {visibles.map((n) => (
            <button
              key={n.id}
              onClick={() => setSeleccion(n.id)}
              className={`w-full text-left px-4 py-3 border-b border-slate-50 transition-colors ${n.id === seleccion ? 'bg-blue-50 border-l-4 border-l-blue-600' : 'hover:bg-slate-50'}`}
            >
              <div className="font-semibold text-slate-800 text-sm truncate">{tituloDeNota(n)}</div>
              <div className="text-[11px] text-slate-400">{fechaCorta(n.updated_at)}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm flex flex-col">
        {aviso && <div className="m-3 mb-0 bg-red-50 text-red-700 text-sm rounded-lg p-3">{aviso}</div>}
        {nota
          ? <EditorDeNota key={nota.id} nota={nota} onGuardar={onGuardar} onBorrar={eliminar} />
          : <div className="flex-1 flex items-center justify-center text-slate-400 text-sm p-8">Elige una nota o crea una nueva.</div>}
      </div>
    </div>
  );
}

// Guarda solo a los 800 ms de dejar de teclear, y al salir de la nota si
// quedaba algo por guardar: como en OneNote, no hay botón de Guardar.
function EditorDeNota({ nota, onGuardar, onBorrar }) {
  const [titulo, setTitulo] = useState(nota.titulo || '');
  const [texto, setTexto] = useState(nota.texto || '');
  const [estado, setEstado] = useState('guardado');
  const pendiente = useRef(null);
  const temporizador = useRef(null);

  const guardarYa = async () => {
    clearTimeout(temporizador.current);
    const cambios = pendiente.current;
    if (!cambios) return;
    pendiente.current = null;
    setEstado('guardando');
    try {
      await onGuardar(nota.id, cambios);
      setEstado(pendiente.current ? 'sin-guardar' : 'guardado');
    } catch {
      pendiente.current = { ...cambios, ...pendiente.current };
      setEstado('error');
    }
  };

  const cambiar = (campo, valor) => {
    if (campo === 'titulo') setTitulo(valor); else setTexto(valor);
    pendiente.current = { ...pendiente.current, [campo]: valor };
    setEstado('sin-guardar');
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(guardarYa, 800);
  };

  // Al cambiar de nota o de pantalla no se pierde lo último tecleado.
  const guardarYaRef = useRef(guardarYa);
  guardarYaRef.current = guardarYa;
  useEffect(() => () => { guardarYaRef.current(); }, []);

  // Las imágenes se guardan en cuanto se suben (botón o Ctrl+V en el texto).
  const [subiendo, setSubiendo] = useState(false);
  const [avisoImagen, setAvisoImagen] = useState(null);
  const imagenes = nota.imagenes || [];

  const anadirImagenes = async (ficheros) => {
    if (subiendo) return;
    setSubiendo(true);
    setAvisoImagen(null);
    const nuevas = [];
    try {
      for (const f of ficheros) nuevas.push(await subirImagen(f));
      await onGuardar(nota.id, { imagenes: [...imagenes, ...nuevas] });
    } catch (e) {
      await borrarImagenes(nuevas);
      setAvisoImagen(e.message);
    } finally {
      setSubiendo(false);
    }
  };

  const quitarImagen = async (img) => {
    if (!window.confirm('¿Quitar esta imagen de la nota?')) return;
    try {
      await onGuardar(nota.id, { imagenes: imagenes.filter((i) => i.ruta !== img.ruta) });
      await borrarImagenes([img]);
    } catch (e) {
      setAvisoImagen(e.message);
    }
  };

  const pegar = (e) => {
    const ficheros = imagenesDelPortapapeles(e);
    if (!ficheros.length) return;
    e.preventDefault();
    anadirImagenes(ficheros);
  };

  const rotulo = {
    guardado: 'Guardado',
    guardando: 'Guardando…',
    'sin-guardar': 'Sin guardar…',
    error: 'No se pudo guardar. Se reintentará al seguir escribiendo.',
  }[estado];

  return (
    <div className="flex-1 flex flex-col p-5 gap-3">
      <div className="flex items-center gap-3">
        <input
          value={titulo}
          onChange={(e) => cambiar('titulo', e.target.value)}
          onBlur={guardarYa}
          placeholder="Título"
          className="flex-1 text-xl font-bold text-slate-800 outline-none border-b border-transparent focus:border-slate-200 pb-1"
        />
        <BotonAnadirImagen onFicheros={anadirImagenes} ocupado={subiendo} />
        <span className={`text-xs font-medium ${estado === 'error' ? 'text-red-600' : 'text-slate-400'}`}>{rotulo}</span>
        <button onClick={onBorrar} title="Borrar nota" className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
          <Trash2 size={18} />
        </button>
      </div>
      <textarea
        value={texto}
        onChange={(e) => cambiar('texto', e.target.value)}
        onBlur={guardarYa}
        onPaste={pegar}
        placeholder="Escribe aquí… (puedes pegar capturas con Ctrl+V)"
        className="flex-1 min-h-[40vh] w-full resize-none outline-none text-slate-700 leading-relaxed text-[15px]"
      />
      {avisoImagen && <p className="text-red-600 text-sm">{avisoImagen}</p>}
      <ImagenesDeNota imagenes={imagenes} onQuitar={quitarImagen} />
    </div>
  );
}

// ───────────────────────────── Contraseñas ─────────────────────────────

function LibretaDeClaves({ claves, comprobante, onCrear, onGuardar, onBorrar }) {
  // La llave sólo vive aquí, en memoria: al salir de la pestaña se olvida.
  const [llave, setLlave] = useState(null);

  if (!llave) {
    return <CerraduraDeClaves comprobante={comprobante} onCrear={onCrear} onAbierta={setLlave} />;
  }
  return <ListaDeClaves llave={llave} claves={claves} onCrear={onCrear} onGuardar={onGuardar} onBorrar={onBorrar} onCerrar={() => setLlave(null)} />;
}

function CerraduraDeClaves({ comprobante, onCrear, onAbierta }) {
  const primeraVez = !comprobante;
  const [llaveMaestra, setLlaveMaestra] = useState('');
  const [repetida, setRepetida] = useState('');
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();
    setAviso(null);
    setOcupado(true);
    try {
      if (primeraVez) {
        const fallo = validarNuevaLlaveMaestra(llaveMaestra, repetida);
        if (fallo) { setAviso(fallo); return; }
        const { comprobante: nuevo, llave } = await crearComprobante(llaveMaestra);
        await onCrear({ tipo: 'comprobante', titulo: 'Comprobante de la llave maestra', clave_cifrada: nuevo });
        onAbierta(llave);
      } else {
        const llave = await abrirConComprobante(llaveMaestra, comprobante.clave_cifrada);
        if (!llave) { setAviso('Esa no es la llave maestra.'); return; }
        onAbierta(llave);
      }
    } catch (err) {
      setAviso(err.message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <form onSubmit={enviar} className="max-w-md mx-auto bg-white rounded-xl border border-slate-100 shadow-sm p-8 mt-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-amber-50 text-amber-600 rounded-lg"><Lock size={24} /></div>
        <div>
          <h2 className="text-lg font-bold text-slate-800">{primeraVez ? 'Crear la llave maestra' : 'Libreta cerrada'}</h2>
          <p className="text-slate-500 text-sm">{primeraVez ? 'Con ella se cifran todas las contraseñas.' : 'Teclea la llave maestra para ver las contraseñas.'}</p>
        </div>
      </div>

      {primeraVez && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg p-3">
          Apúntala en un papel y guárdalo en sitio seguro. <b>Si se olvida, las contraseñas guardadas no se pueden recuperar</b>: ni desde Supabase ni por nadie.
        </div>
      )}

      <input
        type="password"
        autoFocus
        value={llaveMaestra}
        onChange={(e) => setLlaveMaestra(e.target.value)}
        placeholder="Llave maestra"
        autoComplete={primeraVez ? 'new-password' : 'current-password'}
        className="w-full border border-slate-200 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
      />
      {primeraVez && (
        <input
          type="password"
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
          placeholder="Repite la llave maestra"
          autoComplete="new-password"
          className="w-full border border-slate-200 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}
      {aviso && <p className="text-red-600 text-sm font-medium">{aviso}</p>}
      <button disabled={ocupado} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2">
        <Unlock size={16} /> {ocupado ? 'Comprobando…' : primeraVez ? 'Crear y abrir' : 'Abrir'}
      </button>
    </form>
  );
}

const FICHA_VACIA = { titulo: '', web: '', usuario: '', clave: '', texto: '', imagenes: [] };

function ListaDeClaves({ llave, claves, onCrear, onGuardar, onBorrar, onCerrar }) {
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState(null); // null | 'nueva' | fila
  const [aviso, setAviso] = useState(null);

  const visibles = useMemo(
    () => claves
      .filter((c) => coincide([c.titulo, c.web, c.usuario, c.texto], busqueda))
      .sort((a, b) => (a.titulo || '').localeCompare(b.titulo || '', 'es')),
    [claves, busqueda]
  );

  const guardar = async (ficha) => {
    const fila = {
      titulo: ficha.titulo.trim(),
      web: ficha.web.trim(),
      usuario: ficha.usuario.trim(),
      texto: ficha.texto,
      clave_cifrada: await cifrarClave(llave, ficha.clave),
    };
    // Sólo se manda si hay imágenes de por medio: así una contraseña sin
    // imágenes se guarda aunque falte la columna (migración 37).
    const teniaImagenes = editando !== 'nueva' && editando.imagenes?.length;
    if (ficha.imagenes.length || teniaImagenes) fila.imagenes = ficha.imagenes;
    if (editando === 'nueva') await onCrear({ tipo: 'clave', ...fila });
    else await onGuardar(editando.id, fila);
    setEditando(null);
  };

  const eliminar = async (c) => {
    if (!window.confirm(`¿Borrar la contraseña de "${c.titulo}"? No se puede deshacer.`)) return;
    try { await onBorrar(c.id); } catch (e) { setAviso(e.message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => setEditando('nueva')} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
          <Plus size={16} /> Nueva contraseña
        </button>
        <div className="flex-1 min-w-[200px] max-w-sm"><Buscador valor={busqueda} onCambio={setBusqueda} /></div>
        <button onClick={onCerrar} className="ml-auto bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
          <Lock size={16} /> Cerrar libreta
        </button>
      </div>

      {aviso && <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3">{aviso}</div>}

      {editando && (
        <FormularioDeClave llave={llave} fila={editando === 'nueva' ? null : editando} onGuardar={guardar} onCancelar={() => setEditando(null)} />
      )}

      {visibles.length === 0 && !editando && (
        <p className="text-slate-400 text-sm p-8 text-center bg-white rounded-xl border border-slate-100">
          {claves.length ? 'Nada coincide con la búsqueda.' : 'Todavía no hay contraseñas guardadas.'}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {visibles.map((c) => (
          <TarjetaDeClave key={c.id} fila={c} llave={llave} onEditar={() => setEditando(c)} onBorrar={() => eliminar(c)} />
        ))}
      </div>
    </div>
  );
}

function TarjetaDeClave({ fila, llave, onEditar, onBorrar }) {
  const [clara, setClara] = useState(null);
  const [fallo, setFallo] = useState(false);

  const descifrar = async () => {
    try {
      return await descifrarClave(llave, fila.clave_cifrada);
    } catch {
      setFallo(true);
      return null;
    }
  };

  const alternar = async () => {
    if (clara !== null) { setClara(null); return; }
    setClara(await descifrar());
  };

  const enlace = fila.web && (/^https?:\/\//i.test(fila.web) ? fila.web : `https://${fila.web}`);

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-bold text-slate-800 truncate">{fila.titulo || 'Sin nombre'}</div>
          {fila.web && (
            <a href={enlace} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1 truncate">
              {fila.web} <ExternalLink size={11} />
            </a>
          )}
        </div>
        <button onClick={onEditar} title="Editar" className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Pencil size={16} /></button>
        <button onClick={onBorrar} title="Borrar" className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
      </div>

      {fila.usuario && (
        <Linea etiqueta="Usuario" valor={fila.usuario} onCopiar={async () => fila.usuario} />
      )}
      <Linea
        etiqueta="Contraseña"
        valor={fallo ? 'No se puede descifrar con esta llave' : clara ?? '••••••••'}
        mono={clara !== null}
        onCopiar={descifrar}
        extra={
          <button onClick={alternar} title={clara !== null ? 'Ocultar' : 'Ver'} className="p-1 text-slate-400 hover:text-slate-700">
            {clara !== null ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        }
      />
      {fila.texto && <p className="text-xs text-slate-500 whitespace-pre-wrap border-t border-slate-50 pt-2">{fila.texto}</p>}
      <ImagenesDeNota imagenes={fila.imagenes} llave={llave} />
    </div>
  );
}

function Linea({ etiqueta, valor, mono, onCopiar, extra }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    const texto = await onCopiar();
    if (texto == null) return;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch { /* sin permiso de portapapeles: no hay nada que hacer */ }
  };
  return (
    <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-1.5">
      <span className="text-[10px] font-bold text-slate-400 uppercase w-20 shrink-0">{etiqueta}</span>
      <span className={`flex-1 text-sm text-slate-700 truncate ${mono ? 'font-mono' : ''}`}>{valor}</span>
      {extra}
      <button onClick={copiar} title="Copiar" className="p-1 text-slate-400 hover:text-slate-700">
        {copiado ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
      </button>
    </div>
  );
}

function FormularioDeClave({ llave, fila, onGuardar, onCancelar }) {
  const [ficha, setFicha] = useState(FICHA_VACIA);
  const [verClave, setVerClave] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  // Las imágenes se suben cifradas en cuanto se añaden, pero la ficha no se
  // entera hasta Guardar. Si se cancela, se borran las subidas; las quitadas
  // sólo se borran del almacén cuando se ha guardado sin ellas.
  const subidas = useRef([]);
  const quitadas = useRef([]);
  const guardado = useRef(false);
  useEffect(() => () => { if (!guardado.current) borrarImagenes(subidas.current); }, []);

  const anadirImagenes = async (ficheros) => {
    if (subiendo) return;
    setSubiendo(true);
    setAviso(null);
    try {
      for (const f of ficheros) {
        const img = await subirImagen(f, llave);
        subidas.current.push(img);
        setFicha((prev) => ({ ...prev, imagenes: [...prev.imagenes, img] }));
      }
    } catch (e) {
      setAviso(e.message);
    } finally {
      setSubiendo(false);
    }
  };

  const quitarImagen = (img) => {
    quitadas.current.push(img);
    setFicha((prev) => ({ ...prev, imagenes: prev.imagenes.filter((i) => i.ruta !== img.ruta) }));
  };

  const pegar = (e) => {
    const ficheros = imagenesDelPortapapeles(e);
    if (!ficheros.length) return;
    e.preventDefault();
    anadirImagenes(ficheros);
  };

  useEffect(() => {
    if (!fila) { setFicha(FICHA_VACIA); return; }
    let vivo = true;
    const base = { titulo: fila.titulo || '', web: fila.web || '', usuario: fila.usuario || '', texto: fila.texto || '', clave: '', imagenes: fila.imagenes || [] };
    setFicha(base);
    descifrarClave(llave, fila.clave_cifrada)
      .then((clave) => { if (vivo) setFicha((f) => ({ ...f, clave })); })
      .catch(() => { if (vivo) setAviso('La contraseña guardada no se puede descifrar con esta llave: si la cambias, se guardará la nueva.'); });
    return () => { vivo = false; };
  }, [fila, llave]);

  const campo = (nombre) => ({
    value: ficha[nombre],
    onChange: (e) => setFicha((f) => ({ ...f, [nombre]: e.target.value })),
  });

  const enviar = async (e) => {
    e.preventDefault();
    if (!ficha.titulo.trim()) { setAviso('Ponle un nombre (por ejemplo, la web o el proveedor).'); return; }
    setOcupado(true);
    try {
      await onGuardar(ficha);
      guardado.current = true;
      await borrarImagenes(quitadas.current);
    } catch (err) {
      setAviso(err.message);
      setOcupado(false);
    }
  };

  const estilo = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <form onSubmit={enviar} onPaste={pegar} className="bg-white rounded-xl border border-blue-200 shadow-sm p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-800">{fila ? 'Editar contraseña' : 'Nueva contraseña'}</h3>
        <button type="button" onClick={onCancelar} className="p-1.5 text-slate-400 hover:text-slate-700"><X size={18} /></button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input {...campo('titulo')} placeholder="Nombre (p. ej. Factusol, SEUR, banco…)" className={estilo} autoFocus />
        <input {...campo('web')} placeholder="Web (opcional)" className={estilo} />
        <input {...campo('usuario')} placeholder="Usuario o correo" className={estilo} autoComplete="off" />
        <div className="relative">
          <input {...campo('clave')} type={verClave ? 'text' : 'password'} placeholder="Contraseña" className={`${estilo} pr-10`} autoComplete="new-password" />
          <button type="button" onClick={() => setVerClave((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700">
            {verClave ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </div>
      <textarea {...campo('texto')} placeholder="Notas (opcional; esto NO va cifrado)" rows={2} className={estilo} />
      <div className="flex items-center gap-3">
        <BotonAnadirImagen onFicheros={anadirImagenes} ocupado={subiendo} />
        <span className="text-xs text-slate-400">o pega una captura con Ctrl+V. Las imágenes de una contraseña van cifradas.</span>
      </div>
      <ImagenesDeNota imagenes={ficha.imagenes} llave={llave} onQuitar={quitarImagen} />
      {aviso && <p className="text-red-600 text-sm">{aviso}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className="px-4 py-2 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100">Cancelar</button>
        <button disabled={ocupado || subiendo} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-bold">
          {ocupado ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}

function Buscador({ valor, onCambio }) {
  return (
    <div className="relative">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        placeholder="Buscar…"
        className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}
