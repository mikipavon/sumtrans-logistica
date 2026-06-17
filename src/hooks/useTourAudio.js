/**
 * useTourAudio — Narración de voz para los tutoriales del conductor
 *
 * USA EXCLUSIVAMENTE los MP3 generados con ElevenLabs (voz Roger).
 * Si un MP3 no carga, el paso es silencioso — nunca mezcla voces.
 *
 * Archivos en: public/audio/tours/*.mp3
 * Uso:
 *   const { speak, stop, isMuted, toggleMute } = useTourAudio();
 *   speak("Texto de respaldo", "audioId_del_mp3");
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// Clave para persistir la preferencia de silencio
const MUTED_KEY = 'sumtrans_tour_audio_muted';

export function useTourAudio() {
  const [isMuted, setIsMuted] = useState(() => {
    try { return localStorage.getItem(MUTED_KEY) === 'true'; }
    catch { return false; }
  });
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef(null);

  // Limpieza al desmontar
  useEffect(() => { return () => { stopInternal(); }; }, []);

  const stopInternal = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setIsSpeaking(false);
  };

  /**
   * speak(text, audioId)
   *   text    — ignorado (solo por compatibilidad con llamadas existentes)
   *   audioId — nombre del MP3 sin extensión (ej: 'guided_01_bienvenida')
   *
   * Reproduce el MP3 de Roger. Si no existe o falla, silencio.
   */
  const speak = useCallback(async (_text, audioId) => {
    if (!audioId) return;   // sin audioId → silencio
    stopInternal();
    if (isMuted) return;

    const mp3Url = `/audio/tours/${audioId}.mp3`;
    const audio  = new Audio(mp3Url);
    audioRef.current = audio;

    audio.onplay  = () => setIsSpeaking(true);
    audio.onended = () => { setIsSpeaking(false); audioRef.current = null; };
    audio.onerror = () => { setIsSpeaking(false); audioRef.current = null; }; // silencio

    try {
      await audio.play();
    } catch {
      // Autoplay bloqueado por el navegador → silencio (no mezcla voces)
      setIsSpeaking(false);
      audioRef.current = null;
    }
  }, [isMuted]); // eslint-disable-line react-hooks/exhaustive-deps

  const stop = useCallback(() => { stopInternal(); }, []);

  const toggleMute = useCallback(() => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    try { localStorage.setItem(MUTED_KEY, newMuted ? 'true' : 'false'); }
    catch { /* ignora */ }
    if (newMuted) stopInternal();
  }, [isMuted]); // eslint-disable-line react-hooks/exhaustive-deps

  return { speak, stop, isMuted, toggleMute, isSpeaking };
}
