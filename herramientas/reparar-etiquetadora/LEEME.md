# Reparar etiquetadora

Para el cliente cuya etiquetadora de red "se desconfigura" porque el router le cambia la IP.

## Qué hace

No toca la impresora. Apunta su MAC (la matrícula de fábrica, que no cambia) y deja una
vigilancia en Windows: cada 15 minutos comprueba que la impresora sigue donde Windows la
busca y, si el router le ha dado otra IP, la encuentra por su matrícula y corrige el puerto.

El nombre de la impresora en Windows no cambia, así que el navegador la sigue recordando.

## Cómo se usa

1. Copiar esta carpeta a un lápiz USB.
2. En el ordenador del cliente, con la etiquetadora **encendida y conectada**, doble clic en
   `Reparar-Etiquetadora.cmd`.
3. Aceptar el permiso de administrador que pide Windows.
4. Si hay varias impresoras y no reconoce cuál es la etiquetadora, escribir su número.

Lo ideal es pasarla el día de la instalación, cuando todo funciona: así queda la matrícula
apuntada. Si se pasa con la impresora ya perdida, enseña las impresoras que hay encendidas
en la red y pregunta cuál es.

## Requisitos

- Windows 10 u 11.
- La etiquetadora ya instalada en Windows con su driver.
- Ordenador y etiquetadora en la misma red.

## Lo que no arregla

- **Impresoras por USB**: no tienen IP. Si Windows crea una "(Copia 1)" es por enchufarla en
  otra toma USB.
- **Impresora apagada o sin red**: avisa, pero no hay nada que corregir.
- **Impresora en otra red distinta a la del ordenador**: no se le ve la matrícula; ahí hay
  que fijar la IP en el router o en la propia impresora.

## Otros modos

| Orden | Qué hace |
|---|---|
| `Reparar-Etiquetadora.cmd simulacro` | Lo revisa todo y dice lo que haría, sin cambiar nada ni pedir permiso |
| `Quitar-vigilancia.cmd` | Desinstala la vigilancia; la impresora se queda como esté |

## Dónde deja sus cosas

En `C:\ProgramData\SUM-Etiquetadora\`:

- `etiquetadoras.json`: impresoras vigiladas y su matrícula.
- `diario.log`: cada cambio de IP corregido, con fecha y hora. Si el cliente llama, mirar aquí.
- una copia del propio `.cmd`, que es la que ejecuta la tarea programada `SUM Etiquetadora`.
