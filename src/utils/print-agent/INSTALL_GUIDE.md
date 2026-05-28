# 📑 Guía de Instalación: Impresora Virtual SUM Logística

Esta guía describe los pasos necesarios para instalar y configurar el **Agente Impresora Virtual SUM** en el ordenador de tu cliente de forma rápida (menos de 2 minutos) y 100% nativa.

---

## 🛠️ Requisitos Previos

1. Tener **Node.js** instalado en el ordenador del cliente (Descarga recomendada LTS desde [nodejs.org](https://nodejs.org/)).
2. Conocer la dirección IP o el puerto local de la impresora física real donde saldrán las etiquetas físicas (ej: impresora Zebra en red con IP `192.168.1.100` o conectada por USB).

---

## 📥 Paso 1: Configurar el Agente Local

1. Copia la carpeta `print-agent` completa en el disco local del cliente (por ejemplo, en `C:\SUM_PrintAgent\`).
2. Abre el archivo [config.json](file:///c:/Users/sumtr/OneDrive%20-%20SUMTRANS%20LOGISTICA%20S.L.%20CIF%20B56131717/SUM%20MIGUEL/miguel/miaplicacionlogistica/src/utils/print-agent/config.json) con el Bloc de notas y configúralo:
   * **`localPort`**: Déjalo en `9100` (el puerto de impresión estándar de Windows).
   * **`forwarding`**:
     * Si la impresora de etiquetas es de RED: Pon `enabled: true`, la IP de la impresora y su puerto (habitualmente `9100`).
     * Si la impresora de etiquetas es USB: Deja `enabled: false`. Crearemos la redirección directamente en Windows (ver Paso 3).

---

## 🖨️ Paso 2: Crear la Impresora Virtual en Windows

Utilizaremos la funcionalidad de puertos TCP/IP estándar nativa de Windows.

1. Abre el **Panel de Control** de Windows y ve a **Dispositivos e Impresoras**.
2. Haz clic en **Agregar una impresora** en el menú superior.
3. Haz clic en **"La impresora que deseo no está en la lista"**.
4. Selecciona **"Agregar una impresora local o de red con configuración manual"** y pulsa Siguiente.
5. Elige la opción **"Crear un nuevo puerto"** y en el tipo de puerto selecciona **"Standard TCP/IP Port"**. Pulsa Siguiente.
6. En el campo **Nombre de host o dirección IP**, escribe:
   ```text
   127.0.0.1
   ```
   *(El nombre de puerto se rellenará automáticamente como `127.0.0.1_1`).*
7. Desmarca la casilla *"Consultar la impresora y seleccionar automáticamente..."* y pulsa Siguiente.
8. En la ventana de "Información adicional sobre el puerto":
   * Selecciona **Personalizado** y haz clic en **Configuración**.
   * Asegúrate de que el protocolo seleccionado sea **RAW** y el número de puerto sea **9100**.
   * Pulsa Aceptar y luego Siguiente.
9. **Selección de Controlador (Driver):**
   * Selecciona el fabricante de tu impresora real (ej: *Zebra Technologies* y el modelo de tu etiquetadora real) o selecciona **Genérica** -> **Generic / Text Only** (si usas ZPL térmico).
10. Ponle un nombre claro y profesional a la impresora virtual:
    ```text
    Impresora Virtual SUM Logistica
    ```
11. Pulsa Siguiente y finaliza el asistente seleccionando **No compartir esta impresora**.

---

## 🚀 Paso 3: Arrancar el Agente en segundo plano

Para que el agente arranque automáticamente al encender el PC del cliente:

### Opción A (La más sencilla y recomendada):
1. Pulsa las teclas `Windows + R`, escribe:
   ```text
   shell:startup
   ```
   y presiona Enter. Esto abrirá la carpeta de "Inicio" de Windows.
2. Crea un acceso directo aquí que ejecute el siguiente comando en segundo plano:
   ```cmd
   cmd.exe /c "node C:\SUM_PrintAgent\agent.js"
   ```

### Opción B (Como Servicio de Windows):
Puedes instalarlo como un servicio nativo e invisible usando la herramienta `qckwinsvc` o `nssm`. Desde una terminal de administrador ejecutas:
```bash
npx qckwinsvc --name "SUM Print Interceptor" --script "C:\SUM_PrintAgent\agent.js"
```

---

## 🛡️ Filtro de Privacidad y Seguridad

> [!NOTE]
> El sistema analiza cada documento interceptado. Si intentas imprimir un archivo privado como una nómina, el terminal del Agente mostrará la alerta `[FILTRO DE PRIVACIDAD] Documento privado detectado` y lo imprimirá en papel sin subir absolutamente nada a Supabase, garantizando el cumplimiento estricto del Reglamento General de Protección de Datos (RGPD).
