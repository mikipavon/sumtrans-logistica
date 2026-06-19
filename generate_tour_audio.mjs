/**
 * generate_tour_audio.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Genera TODOS los audios de los tutoriales con ElevenLabs y los guarda
 * en /public/audio/tours/ como archivos MP3.
 *
 * Se ejecuta UNA SOLA VEZ — después todos los conductores escuchan
 * los mismos archivos sin gastar más créditos.
 *
 * USO:
 *   1. Pon tu API key en ELEVENLABS_API_KEY (línea ~20)
 *   2. node generate_tour_audio.mjs
 *
 * REQUISITO: npm install @elevenlabs/elevenlabs-js
 */

import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ─── CONFIGURACIÓN ─────────────────────────────────────────────────────────────
const ELEVENLABS_API_KEY = 'sk_56a95f9b147a20cca70a46a74901c81871e478545372eb23';
const VOICE_ID           = 'CwhRBWXzGAHq8TQ4Fs17'; // Roger (multilingual)
const MODEL_ID           = 'eleven_multilingual_v2';
const OUTPUT_FORMAT      = 'mp3_44100_128';

// Carpeta de salida
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = join(__dirname, 'public', 'audio', 'tours');

// ─── TODOS LOS AUDIOS ─────────────────────────────────────────────────────────
// Formato: { id: 'nombre-archivo', text: 'texto a narrar' }
const AUDIO_SCRIPTS = [

  // ── TOUR PRINCIPAL (DriverGuidedTour) ──────────────────────────────────────
  {
    id: 'guided_01_bienvenida',
    text: '¡Bienvenido! Esta es tu pantalla principal de trabajo. Aquí arriba ves tu nombre, el estado del GPS, y los botones para agrandar o reducir la letra según te sea más cómodo. Vamos a ver juntos cada sección.',
  },
  {
    id: 'guided_02_reparto',
    text: 'Esta es la pestaña de Reparto — la más importante. Aquí tienes todos los envíos que debes entregar hoy, ordenados por tu ruta. Al empezar el día, empieza siempre por aquí.',
  },
  {
    id: 'guided_03_asignar',
    text: 'La pestaña Asignar. Si cargas un paquete en la furgoneta y no aparece en tu reparto, entra aquí, búscalo por el número de albarán y asígnatelo tú mismo. Así queda registrado.',
  },
  {
    id: 'guided_04_entregas',
    text: 'Aquí en Entregas aparecen todos los envíos que ya has completado hoy. Si necesitas revisar algo — una firma, una foto, un dato — lo encuentras en esta pestaña.',
  },
  {
    id: 'guided_05_cobros',
    text: 'Cobros Pendientes. Aquí están los envíos donde tienes que cobrar dinero en efectivo al cliente. Muy importante: registra cada cobro en la aplicación para que la contabilidad cuadre al final del día.',
  },
  {
    id: 'guided_06_cuenta',
    text: 'Tu Cuenta es el resumen económico de tu jornada. Aquí ves cuánto has cobrado en portes, los reembolsos, y el total de efectivo que llevas encima. Lo usarás al hacer la liquidación con la oficina.',
  },
  {
    id: 'guided_07_tarjeta',
    text: 'Mira esta tarjeta de ejemplo. Cada parada es un envío. Ves el número de parada, el nombre del cliente, la dirección, y si hay una cantidad en verde, significa que tienes que cobrar dinero al entregar.',
  },
  {
    id: 'guided_08_confirmar',
    text: 'Cuando entregues un paquete, pulsa este botón verde que dice Confirmar Entrega. La aplicación te pedirá que el cliente firme con el dedo, y que hagas una foto del paquete. Eso queda guardado como justificante.',
  },
  {
    id: 'guided_09_incidencia',
    text: 'Si no puedes entregar — porque no hay nadie en casa, la dirección es incorrecta, o el paquete viene dañado — pulsa el botón de Incidencia. Escribe el motivo y la oficina recibirá el aviso automáticamente.',
  },
  {
    id: 'guided_10_final',
    text: '¡Perfecto! Ya conoces las partes principales de la aplicación. Recuerda que estás en Modo Prueba, así que todo lo que hagas aquí es una simulación — practica sin miedo. Cuando te sientas listo, díselo a la oficina y desactivarán el modo prueba. ¡Ánimo!',
  },

  // ── TOUR ALERTAS (DriverAlertsTour) ────────────────────────────────────────
  {
    id: 'alerts_01_intro',
    text: 'Bienvenido al tutorial de alertas. Voy a mostrarte todos los avisos especiales que pueden aparecer al confirmar una entrega. Los formularios que verás son reales, pero no se guardará ningún dato. Es solo formación.',
  },
  {
    id: 'alerts_02_pagado',
    text: 'Primer caso: el porte pagado. Cuando el remitente ya ha pagado los gastos de envío, no aparece ningún importe en la pantalla de cobros. Solo tienes que pedir la firma y hacer la foto. No cobres nada al destinatario.',
  },
  {
    id: 'alerts_03_efectivo',
    text: 'Ojo con este caso. Si el remitente es cliente de efectivo — es decir, no paga por factura — el importe puede aparecer en pantalla aunque el porte figure como pagado. Comprueba siempre el importe marcado antes de confirmar.',
  },
  {
    id: 'alerts_04_retorno',
    text: 'Muy importante: el banner rojo que parpadea. Cuando ves este aviso, significa que el cliente tiene que devolverte algo físico: una caja, unos documentos, o un palé. Recógelo siempre antes de marcharte del cliente.',
  },
  {
    id: 'alerts_05_firma_vuelta',
    text: 'Ahora el banner verde. Este aviso significa que el cliente tiene que firmar en el albarán de papel, no solo en la pantalla. Déjale que firme en el papel, después fotografía ese albarán con la cámara como prueba.',
  },
  {
    id: 'alerts_06_ambos',
    text: 'Puede que aparezcan los dos avisos a la vez — el rojo y el verde juntos. En ese caso sigue este orden. Primero recoge el retorno físico. Segundo, que el cliente firme en el albarán de papel. Tercero, fotografíalo. Y cuarto, confirma en la pantalla.',
  },
  {
    id: 'alerts_07_cod',
    text: 'Cuando aparecen dos líneas de cobro: el porte y el reembolso. Cobras las dos cantidades al destinatario. El total lo calcula la aplicación automáticamente. El dinero del reembolso lo devolverás después al remitente en la oficina.',
  },
  {
    id: 'alerts_08_campana',
    text: 'La campana que ves arriba a la derecha abre el Centro de Alertas. Aquí aparecen los avisos pendientes del día: envíos sin asignar, incidencias abiertas, y cobros por liquidar. Mira el panel de ejemplo.',
  },
  {
    id: 'alerts_09_oficina',
    text: 'Al abrir la aplicación, a veces aparece un aviso enviado por la oficina. Pueden ser instrucciones del día, recordatorios especiales, o alertas puntuales. Léelo siempre antes de salir a ruta.',
  },
  {
    id: 'alerts_10_vehiculo',
    text: 'Cada lunes, antes de salir a ruta, la aplicación te muestra automáticamente este checklist de revisión del vehículo. Hay que revisar el aceite, el refrigerante, los frenos, los neumáticos y las luces. Confírmalo siempre antes de arrancar.',
  },
  {
    id: 'alerts_11_final',
    text: '¡Enhorabuena! Ya conoces todos los tipos de aviso: cobros, retornos, firmas de vuelta y mensajes de la oficina. Si en algún momento tienes dudas, puedes volver a este tutorial desde el botón de tutoriales.',
  },

  // ── TOUR ALBARÁN (DriverShipmentTour) ─────────────────────────────────────
  {
    id: 'shipment_01_intro',
    text: 'En este tutorial te explico cómo crear un albarán paso a paso. Vamos a abrir el formulario real de la aplicación. Ningún dato se guardará — es solo formación. Tarda unos tres minutos.',
  },
  {
    id: 'shipment_02_abrir',
    text: 'Primero, pulsa el botón de crear nuevo albarán. Se abrirá el formulario real y a partir de ahí te iré explicando cada sección.',
  },
  {
    id: 'shipment_03_remitente',
    text: 'La primera sección es el remitente, que es quien envía el paquete. Escribe el nombre del cliente y la aplicación buscará en tu lista y rellenará la dirección automáticamente. Si vas a crear varios del mismo remitente seguidos, activa la opción de Envío Múltiple.',
  },
  {
    id: 'shipment_04_destinatario',
    text: 'Ahora el destinatario, que es quien va a recibir el paquete. Rellena el nombre, la dirección, el código postal, la ciudad y el teléfono. Si ya está en la lista de clientes, se autocompleta todo.',
  },
  {
    id: 'shipment_05_pago',
    text: 'Las condiciones de pago. Pagado significa que el remitente ya pagó y no cobras al entregar. Debido significa que cobras al entregar. Con Retorno significa que el cliente te devuelve algo. Y Firma de Documento significa que el cliente firma el albarán de papel.',
  },
  {
    id: 'shipment_06_articulos',
    text: 'Selecciona el tipo de bulto y la cantidad. El precio se calcula solo según la tarifa del cliente. Si aparece el campo de kilogramos, introduce el peso.',
  },
  {
    id: 'shipment_07_reembolso',
    text: 'Si el destinatario debe pagarte dinero en efectivo que luego devuelves al remitente, escribe el importe aquí. Esto activa el modo de reembolso y añade la comisión automáticamente.',
  },
  {
    id: 'shipment_08_precio',
    text: 'Si el precio está fijado en tarifa aparecerá en gris. Puedes pulsarlo para cambiarlo si es necesario. Normalmente no hace falta tocarlo porque se calcula solo.',
  },
  {
    id: 'shipment_09_guardar',
    text: 'Cuando hayas rellenado todos los datos, pulsa Generar Albarán. Quedará registrado en el sistema. En el tutorial, el botón no guarda nada real, pero puedes pulsarlo para avanzar.',
  },
  {
    id: 'shipment_10_despues',
    text: 'Una vez guardado, el albarán queda en el sistema esperando que la oficina lo asigne al conductor de reparto. Si lo creas por la mañana, va al reparto de tarde. Si lo creas por la tarde, va al reparto de la mañana siguiente.',
  },
  {
    id: 'shipment_11_asignacion',
    text: 'Así se ve la pantalla de asignación. Debajo de cada albarán aparece una fila con los repartidores sugeridos y un botón que parpadea en rojo indicando el turno más urgente.',
  },
  {
    id: 'shipment_12_cliente',
    text: 'Cuando te asignen el reparto, verás las tarjetas de tus envíos en la pestaña Reparto. Cuando llegues a la dirección, localiza la tarjeta y pulsa Confirmar Entrega.',
  },
  {
    id: 'shipment_13_cobros',
    text: 'Si hay importe a cobrar — porte debido o reembolso — aparece en rojo automáticamente. Puedes usar la calculadora de cambio si el cliente te da un billete grande.',
  },
  {
    id: 'shipment_14_agrupados',
    text: 'Si el cliente tenía albaranes anteriores sin cobrar, aparecen todos agrupados. Puedes cobrarlos todos a la vez o desmarcar los que no puedas cobrar en ese momento.',
  },
  {
    id: 'shipment_15_firma',
    text: 'Pide al cliente que escriba su nombre y firme con el dedo en la pantalla. En el tutorial no se guarda nada, así que puedes practicar.',
  },
  {
    id: 'shipment_16_confirmar',
    text: 'Pulsa Entregado para registrar la entrega con la prueba de firma o foto. En el tutorial este botón no guarda nada, pero en el trabajo real sí queda todo guardado.',
  },
  {
    id: 'shipment_17_final',
    text: '¡Ya sabes crear albaranes! El flujo completo es: rellenar el formulario, guardar, esperar la asignación, llegar al cliente, y confirmar con firma o foto. Puedes volver a este tutorial desde el botón de tutoriales.',
  },

  // ── TOUR REPARTO (DriverRepartaTour) ──────────────────────────────────────
  {
    id: 'reparto_01_intro',
    text: 'Ahora te explico todos los elementos de la pestaña Reparto usando la aplicación real. Verás cada botón y función tal como aparece en tu día a día.',
  },
  {
    id: 'reparto_02_arrastrar',
    text: 'Puedes cambiar el orden de las paradas fácilmente. Mantén pulsada cualquier tarjeta y arrástrala arriba o abajo para moverla en la ruta. Útil si necesitas cambiar el orden por tráfico o urgencias.',
  },
  {
    id: 'reparto_02b_reasignar_deslizar',
    text: 'Si te asignan por error un reparto que no es tuyo, desliza la tarjeta hacia la derecha. Aparecerá el botón de Devolver a Asignar. Al pulsarlo, el albarán desaparece de tu lista y vuelve al panel, ve a Asignación y se lo asignas al conductor correcto.',
  },
  {
    id: 'reparto_02c_reasignar_asignar',
    text: 'Una vez devuelto, ve a la pestaña Asignar. El albarán aparecerá ahí esperando. Busca la tarjeta y asígnala al transportista correcto desde el desplegable o los botones de turno.',
  },
  {
    id: 'reparto_03_optimizar',
    text: 'El botón morado de Optimizar Ruta agrupa automáticamente las paradas por pueblos y calcula el orden más eficiente. Después de pulsar aparece el botón Ver Mapa para ver la ruta en Google Maps.',
  },
  {
    id: 'reparto_04_gps',
    text: 'El icono de GPS azul de cada tarjeta abre Google Maps directamente con la dirección ya cargada. Si hay coordenadas exactas calcula la ruta. Si no, busca la dirección.',
  },
  {
    id: 'reparto_05_telefono',
    text: 'Si el destinatario tiene teléfono guardado, aparece el icono verde del teléfono junto al GPS. Al pulsarlo llamas directamente sin salir de la aplicación.',
  },
  {
    id: 'reparto_06_documentos',
    text: 'El icono de documento azul abre un menú con dos opciones: Imprimir Ticket, que imprime el albarán en formato pequeño, y Enviar WhatsApp, que manda un mensaje al cliente con los datos del envío.',
  },
  {
    id: 'reparto_07_cobros',
    text: 'Si una tarjeta muestra la etiqueta verde con el importe, significa que debes cobrar al entregar. El porte lo entregas en la oficina. El reembolso lo entregas al remitente con el justificante.',
  },
  {
    id: 'reparto_08_incidencia',
    text: 'Si no puedes entregar, pulsa el botón rojo de Incidencia en la tarjeta. Selecciona el motivo: ausente, dirección incorrecta, rechaza la entrega... El albarán queda marcado y la oficina recibe la notificación.',
  },
  {
    id: 'reparto_09_modal_incidencia',
    text: 'Al pulsar Incidencia se abre este formulario. Tienes tres formas de escribir el motivo: escribir manualmente, dictar por voz pulsando el botón Hablar, o usar los botones de acceso rápido de abajo.',
  },
  {
    id: 'reparto_10_atajos',
    text: 'Los botones de la parte inferior insertan el motivo de un solo toque, sin tener que escribir: cliente ausente, dirección incorrecta, paquete dañado, local cerrado, rechazado, o no dispone del reembolso.',
  },
  {
    id: 'reparto_08_confirmar_flujo',
    text: 'Al pulsar Confirmar Entrega, lo que pasa depende del tipo de albarán. Si es de facturación, va directo a la firma con el dedo o a hacer una foto. Pero si tiene cobro pendiente, primero aparece la pantalla con el importe exacto. Cobras el dinero, confirmas, y después pides la firma.',
  },
  {
    id: 'reparto_09_sello',
    text: 'Un truco importante para clientes con sello de empresa: pídele que selle la etiqueta del paquete, no el albarán de papel. Luego haz una foto de esa etiqueta sellada desde la app. Así quedan registrados el sello y la ubicación GPS exacta al mismo tiempo. Es el justificante más completo posible.',
  },
  {
    id: 'reparto_08b_confirmar_pagado',
    text: 'Cuando el albarán es de facturación, al pulsar Confirmar Entrega va directo a la pantalla de firma. No hay cobro. Solo pides la firma con el dedo o haces una foto del paquete.',
  },
  {
    id: 'reparto_09b_notas_entrega',
    text: 'Atención, hay reglas importantes para documentar las entregas. Para agencias como TXT, TSB y XPO, siempre debes firmar el albarán de la agencia y hacer una foto en la app. Si no llevas el albarán, haz una foto de la etiqueta firmada o sellada. Para el resto de clientes, si tienen sello, que sellen la etiqueta del paquete y haces foto. Y si no tienen sello, anota el nombre de quien recibe.',
  },
  {
    id: 'reparto_13_final',
    text: '¡Ya dominas el Reparto! Recuerda los puntos clave: arrastra para reordenar, el GPS abre Maps directamente, si hay cobro pendiente te aparecerá la pantalla de cobro antes de la firma, y si el cliente tiene sello de empresa, él sella la etiqueta del paquete y tú haces la foto para registrar sello y ubicación.',
  },

  // ── TOUR CAJA (DriverCajaTour) ────────────────────────────────────────────
  {
    id: 'caja_01_intro',
    text: 'Al final del día, la pestaña Cuenta muestra todo lo que has recaudado: portes cobrados, reembolsos y facturas simplificadas. Desde aquí también generas los justificantes para los remitentes.',
  },
  {
    id: 'caja_02_totales',
    text: 'Arriba aparecen dos tarjetas: Reembolsos, que es el dinero del COD que debes entregar al remitente; y Porte de Caja, que son los cobros de porte del día. El cuadro negro grande es el total recaudado.',
  },
  {
    id: 'caja_03_portes',
    text: 'Debajo aparece cada porte cobrado con el nombre del cliente y el importe. Puedes pulsar en cualquier línea para ver el albarán completo. El botón de imprimir genera el resumen de portes del día.',
  },
  {
    id: 'caja_04_reembolsos',
    text: 'En la sección de Detalle Reembolsos aparece cada cobro de tipo COD del día. Cada línea tiene un botón individual para imprimir ese justificante. El botón Imprimir Todos genera todos a la vez en formato A6.',
  },
  {
    id: 'caja_05_justificante',
    text: 'El justificante de reembolso es el documento que le das al remitente cuando le entregas el dinero que cobró su cliente. Incluye el nombre del remitente, el identificador del envío con código QR, el importe total, y espacio para firma y sello.',
  },
  {
    id: 'caja_06_como_imprimir',
    text: 'Para generar los justificantes: ve a la pestaña Cuenta al final del día, en Detalle Reembolsos pulsa el icono de imprimir junto a cada reembolso, o pulsa Imprimir Todos para sacar todos a la vez en formato A6, cuatro por folio.',
  },
  {
    id: 'caja_07_cierre',
    text: 'El botón Mi Cierre en PDF genera un resumen completo del día con todos los cobros. Úsalo al final de tu jornada para entregar en la oficina o guardar como comprobante.',
  },
  {
    id: 'caja_08_final',
    text: '¡Ya dominas la Caja! Al final de cada jornada: revisa los totales en Cuenta, imprime los justificantes de reembolso para los remitentes, y genera el Cierre en PDF para entregarlo en la oficina.',
  },

  // ── TOUR EDITAR ALBARÁN (DriverEditTour) ──────────────────────────────────
  {
    id: 'edit_01_intro',
    text: 'En este tutorial aprenderás cómo corregir un albarán si te has equivocado en el remitente, el destinatario, los portes o los artículos. Usaremos la aplicación real.',
  },
  {
    id: 'edit_02_pulsar',
    text: 'Para editar un albarán, pulsa directamente sobre la tarjeta en la zona del nombre o la dirección, pero no en los botones de acción. Eso abre el detalle del albarán.',
  },
  {
    id: 'edit_03_boton_editar',
    text: 'En la cabecera del albarán abierto verás un icono de lápiz en color azul. Púlsalo para activar el modo de edición. Todos los campos se vuelven editables.',
  },
  {
    id: 'edit_04_remitente',
    text: 'La sección azul de Origen tiene todos los datos del remitente: nombre, dirección, población, código postal y teléfono. Si cambias el nombre y está en tu lista de clientes, los demás campos se rellenan solos.',
  },
  {
    id: 'edit_05_destinatario',
    text: 'La sección verde de Destino tiene los datos del destinatario: nombre, dirección, población, código postal, teléfono y contacto. Igual que el remitente: si escribes un nombre de cliente conocido, se autocompleta todo.',
  },
  {
    id: 'edit_06_portes',
    text: 'En la sección de importes puedes añadir o quitar artículos, modificar el precio final del porte, y cambiar el importe del reembolso. Al cambiar los artículos, el importe total se recalcula automáticamente.',
  },
  {
    id: 'edit_07_guardar',
    text: 'Cuando hayas terminado de corregir, baja hasta el final del formulario y pulsa el botón azul de Guardar Cambios. Los cambios se guardan en la nube al instante y el albarán queda actualizado para todos.',
  },
  {
    id: 'edit_08_final',
    text: '¡Albarán corregido! El proceso es: pulsar la tarjeta, tocar el lápiz azul, editar lo que necesites, y guardar los cambios. Los cambios son instantáneos y se sincronizan con la oficina.',
  },
];

// ─── FUNCIÓN PRINCIPAL ────────────────────────────────────────────────────────
async function main() {
  console.log('🎙️  Generador de Audio para Tutoriales — SUMTRANS');
  console.log('───────────────────────────────────────────────────');

  if (ELEVENLABS_API_KEY === 'PON_AQUI_TU_API_KEY') {
    console.error('❌ Error: Debes poner tu API key de ElevenLabs en la línea 20.');
    process.exit(1);
  }

  // Crear carpeta de salida
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
    console.log(`📁 Carpeta creada: public/audio/tours/`);
  }

  const client = new ElevenLabsClient({ apiKey: ELEVENLABS_API_KEY });

  console.log(`🔊 Voz: Roger (${VOICE_ID})`);
  console.log(`📦 Total de audios a generar: ${AUDIO_SCRIPTS.length}`);
  console.log('');

  let ok = 0;
  let errors = 0;

  for (const script of AUDIO_SCRIPTS) {
    const outFile = join(OUT_DIR, `${script.id}.mp3`);

    // Saltar si ya existe (no gastar créditos innecesariamente)
    if (existsSync(outFile)) {
      console.log(`⏭️  Ya existe: ${script.id}.mp3`);
      ok++;
      continue;
    }

    try {
      process.stdout.write(`🎤 Generando: ${script.id} ... `);

      const audioStream = await client.textToSpeech.convert(VOICE_ID, {
        text: script.text,
        modelId: MODEL_ID,
        outputFormat: OUTPUT_FORMAT,
      });

      // Convertir stream a buffer
      const chunks = [];
      for await (const chunk of audioStream) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      writeFileSync(outFile, buffer);
      console.log(`✅ OK (${(buffer.length / 1024).toFixed(0)} KB)`);
      ok++;

      // Pausa pequeña para no saturar la API
      await new Promise(r => setTimeout(r, 300));

    } catch (err) {
      console.log(`❌ ERROR: ${err.message}`);
      errors++;
    }
  }

  console.log('');
  console.log('───────────────────────────────────────────────────');
  console.log(`✅ Generados: ${ok}/${AUDIO_SCRIPTS.length}`);
  if (errors > 0) {
    console.log(`❌ Errores:   ${errors} — vuelve a ejecutar el script para reintentar`);
  }
  console.log('');
  console.log('📁 Archivos guardados en: public/audio/tours/');
  console.log('🚀 Ahora activa USE_ELEVENLABS = true en useTourAudio.js');
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
