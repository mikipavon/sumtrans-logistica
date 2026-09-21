-- ============================================================================
-- RESTAURAR AL CONDUCTOR PACO (FRANCISCO JAVIER PAVON MAIZ, id 1774550544570)
-- ============================================================================
--
-- Se borró por error de la tabla drivers. La ficha de abajo es la que había en
-- la última copia de seguridad automática:
--
--     COPIAS SEGURIDAD APLICACION SUM/copia_logistica_2026-09-10_13-23.json
--     (copia del 10/09/2026 a las 13:23)
--
-- OJO: lo que cambiara en su ficha entre el 10 y el día del borrado no está en
-- esa copia (GPS, orden de reparto, PIN de firma y los cobros entregados de los
-- días 11 al 17 de septiembre).
--
-- La contraseña en claro que traía la copia NO se restaura: desde la fase 16 no
-- se guarda en la ficha, y la fase 29 la quitaría igualmente. Su cuenta de
-- Supabase Auth no se borró al borrar la fila, así que debería seguir entrando
-- con lo de siempre; si no, se le vuelve a dar acceso desde el panel.
--
-- Al conservar el mismo id, los envíos, fichajes y ausencias que lo apuntan
-- vuelven a encontrarlo solos.
--
-- CÓMO SE EJECUTA
--   Supabase → SQL Editor → pegar y Run.
--   Si la fila ya existiera, no toca nada (ON CONFLICT DO NOTHING).
-- ============================================================================

BEGIN;

INSERT INTO public.drivers (id, username, data)
VALUES (
  1774550544570,
  'PACOPAVON',
  $json${
  "id": 1774550544570,
  "name": "FRANCISCO JAVIER PAVON MAIZ",
  "alias": "PACO",
  "email": "pacopavon74@gmail.com",
  "phone": "637791367",
  "routeId": "",
  "isActive": true,
  "username": "PACOPAVON",
  "currentLat": 37.89997921291156,
  "currentLng": -4.728676784407829,
  "isTestMode": false,
  "routeOrder": [
    "SUM-882",
    "REC-481",
    "SUM-840"
  ],
  "morningTowns": [],
  "lastGpsUpdate": "2026-09-10T10:51:05.252Z",
  "afternoonTowns": [],
  "signaturePinHash": null,
  "collectedCollections_2026-06-18": [
    {
      "id": "COL-1781801165378-HAB-4-porte-cygh",
      "date": "2026-06-18",
      "type": "Porte",
      "amount": "20.00",
      "client": "Chacon",
      "sender": "BAEZA S.A.",
      "partType": "porte",
      "shipmentId": "HAB-4"
    }
  ],
  "collectedCollections_2026-06-19": [
    {
      "id": "COL-1781854865580-HAB-47-porte-2t3l",
      "date": "2026-06-19",
      "type": "Porte",
      "amount": "24.00",
      "client": "HERMANOS LOPEZ",
      "sender": "NEUMATICOS PUENTE GENIL",
      "partType": "porte",
      "shipmentId": "HAB-47"
    },
    {
      "id": "COL-1781854865580-HAB-47-reembolso-fjgb",
      "date": "2026-06-19",
      "type": "Reembolso",
      "amount": "249.99",
      "client": "HERMANOS LOPEZ",
      "sender": "NEUMATICOS PUENTE GENIL",
      "partType": "reembolso",
      "shipmentId": "HAB-47"
    },
    {
      "id": "COL-1781855951061-HAB-47-porte-t123",
      "date": "2026-06-19",
      "type": "Porte",
      "amount": "24.00",
      "client": "HERMANOS LOPEZ",
      "sender": "NEUMATICOS PUENTE GENIL",
      "partType": "porte",
      "shipmentId": "HAB-47"
    },
    {
      "id": "COL-1781855951061-HAB-47-reembolso-nc6b",
      "date": "2026-06-19",
      "type": "Reembolso",
      "amount": "250.00",
      "client": "HERMANOS LOPEZ",
      "sender": "NEUMATICOS PUENTE GENIL",
      "partType": "reembolso",
      "shipmentId": "HAB-47"
    },
    {
      "id": "COL-1781862748678-HAB-47-porte-u6tl",
      "date": "2026-06-19",
      "type": "Porte",
      "amount": "24.00",
      "client": "HERMANOS LOPEZ",
      "sender": "NEUMATICOS PUENTE GENIL",
      "partType": "porte",
      "shipmentId": "HAB-47"
    },
    {
      "id": "COL-1781862748678-HAB-47-reembolso-uoib",
      "date": "2026-06-19",
      "type": "Reembolso",
      "amount": "250.00",
      "client": "HERMANOS LOPEZ",
      "sender": "NEUMATICOS PUENTE GENIL",
      "partType": "reembolso",
      "shipmentId": "HAB-47"
    },
    {
      "id": "COL-1781863694372-HAB-48-porte-s9yf",
      "date": "2026-06-19",
      "type": "Porte",
      "amount": "24.00",
      "client": "Hermanos López ",
      "sender": "NEUMATICOS PUENTE GENIL",
      "partType": "porte",
      "shipmentId": "HAB-48"
    },
    {
      "id": "COL-1781863694379-HAB-48-reembolso-v82d",
      "date": "2026-06-19",
      "type": "Reembolso",
      "amount": "250.00",
      "client": "Hermanos López ",
      "sender": "NEUMATICOS PUENTE GENIL",
      "partType": "reembolso",
      "shipmentId": "HAB-48"
    },
    {
      "id": "COL-1781801165378-HAB-4-porte-cygh",
      "date": "2026-06-18",
      "type": "Porte",
      "amount": "20.00",
      "client": "Chacon",
      "sender": "BAEZA S.A.",
      "partType": "porte",
      "shipmentId": "HAB-4"
    }
  ],
  "collectedCollections_2026-07-11": [],
  "collectedCollections_2026-07-27": [],
  "collectedCollections_2026-07-29": [],
  "collectedCollections_2026-07-30": [],
  "collectedCollections_2026-07-31": [],
  "collectedCollections_2026-08-09": [],
  "collectedCollections_2026-08-15": [],
  "collectedCollections_2026-08-17": [],
  "collectedCollections_2026-08-19": [],
  "collectedCollections_2026-08-21": [],
  "collectedCollections_2026-08-23": [],
  "collectedCollections_2026-09-01": [],
  "collectedCollections_2026-09-02": [],
  "collectedCollections_2026-09-03": [],
  "collectedCollections_2026-09-04": [],
  "collectedCollections_2026-09-07": [],
  "collectedCollections_2026-09-08": [],
  "collectedCollections_2026-09-09": [
    {
      "id": "COL-1788942162837-HAB-135-porte-t01v",
      "date": "2026-09-09",
      "type": "Porte",
      "amount": "7.00",
      "client": "Zuricar ",
      "sender": "HYUNDAI",
      "partType": "porte",
      "shipmentId": "HAB-135"
    },
    {
      "id": "COL-1788942162838-HAB-135-reembolso-hkzw",
      "date": "2026-09-09",
      "type": "Reembolso",
      "amount": "10.73",
      "client": "Zuricar ",
      "sender": "HYUNDAI",
      "partType": "reembolso",
      "shipmentId": "HAB-135"
    },
    {
      "id": "COL-1788950241063-HAB-152-porte-hsbh",
      "date": "2026-09-09",
      "type": "Porte",
      "amount": "7.00",
      "client": "Motos García ",
      "sender": "Galomotor",
      "partType": "porte",
      "shipmentId": "HAB-152"
    },
    {
      "id": "COL-1788969142442-HAB-185-porte-r991",
      "date": "2026-09-09",
      "type": "Porte",
      "amount": "7.00",
      "client": "NEUMATICOS MULTIMARCA MANOLO",
      "sender": "RECAMBIOS REVOLUCIONARIOS. S.L.U.",
      "partType": "porte",
      "shipmentId": "HAB-185"
    },
    {
      "id": "COL-1788971538701-HAB-159-porte-7vwg",
      "date": "2026-09-09",
      "type": "Porte",
      "amount": "7.00",
      "client": "David chacon",
      "sender": "TIPECAM TUTTI RECAMBI AGRICOLI PER CAMPO. S.L",
      "partType": "porte",
      "shipmentId": "HAB-159"
    },
    {
      "id": "COL-1788972540543-HAB-172-porte-byfq",
      "date": "2026-09-09",
      "type": "Porte",
      "amount": "12.00",
      "client": "Damve pigroup",
      "sender": "AGROTRACTOR ROCHI OCCIDENTAL S.L. (TRIVIUM)",
      "partType": "porte",
      "shipmentId": "HAB-172"
    },
    {
      "id": "COL-1788974152586-HAB-105-porte",
      "date": "2026-09-09",
      "type": "Porte",
      "amount": "7.00",
      "client": "El  Yunque Maquinaria y recambios ",
      "sender": "COMERCIAL FENIX . FONTI",
      "partType": "porte",
      "shipmentId": "HAB-105"
    },
    {
      "id": "COL-1788974153799-HAB-50-porte",
      "date": "2026-09-09",
      "type": "Porte",
      "amount": "7.00",
      "client": "El  Yunque Maquinaria y recambios ",
      "sender": "COMAFER",
      "partType": "porte",
      "shipmentId": "HAB-50"
    },
    {
      "id": "COL-1788974155903-HAB-93-porte",
      "date": "2026-09-09",
      "type": "Porte",
      "amount": "7.00",
      "client": "El  Yunque Maquinaria y recambios El yunque",
      "sender": "Cabello de alba ",
      "partType": "porte",
      "shipmentId": "HAB-93"
    }
  ],
  "collectedCollections_2026-09-10": [
    {
      "id": "COL-1789022524511-SUM-667-reembolso-pmsm",
      "date": "2026-09-10",
      "type": "Reembolso",
      "amount": "112.84",
      "client": "ISPAVICARS",
      "sender": "PROSERVICE",
      "partType": "reembolso",
      "shipmentId": "SUM-667"
    },
    {
      "id": "COL-1789022537851-SUM-694-reembolso-bqw9",
      "date": "2026-09-10",
      "type": "Reembolso",
      "amount": "53.45",
      "client": "ISPAVICARS",
      "sender": "PROSERVICE",
      "partType": "reembolso",
      "shipmentId": "SUM-694"
    },
    {
      "id": "COL-1789024685858-HAB-187-porte-mhib",
      "date": "2026-09-10",
      "type": "Porte",
      "amount": "7.00",
      "client": "Hnos agric Luque ",
      "sender": "RODAMIENTOS ANDALUCIA S.COOP.AND",
      "partType": "porte",
      "shipmentId": "HAB-187"
    },
    {
      "id": "COL-1789024723463-HAB-166-porte-3ypk",
      "date": "2026-09-10",
      "type": "Porte",
      "amount": "20.00",
      "client": "Hns luque",
      "sender": "CICROCOR",
      "partType": "porte",
      "shipmentId": "HAB-166"
    },
    {
      "id": "COL-1789029456985-HAB-178-porte-3cxk",
      "date": "2026-09-10",
      "type": "Porte",
      "amount": "15.00",
      "client": "Talleres Jomar",
      "sender": "RADIADORES CORDOBA S.C",
      "partType": "porte",
      "shipmentId": "HAB-178"
    },
    {
      "id": "COL-1789029456985-HAB-178-reembolso-dwwj",
      "date": "2026-09-10",
      "type": "Reembolso",
      "amount": "52.70",
      "client": "Talleres Jomar",
      "sender": "RADIADORES CORDOBA S.C",
      "partType": "reembolso",
      "shipmentId": "HAB-178"
    },
    {
      "id": "COL-1789034879447-HAB-145-porte",
      "date": "2026-09-10",
      "type": "Porte",
      "amount": "19.00",
      "client": "Mundo fiesta",
      "sender": "Mundo fiesta",
      "partType": "porte",
      "shipmentId": "HAB-145"
    },
    {
      "id": "COL-1789034895843-HAB-143-porte",
      "date": "2026-09-10",
      "type": "Porte",
      "amount": "10.00",
      "client": "Mundo fiesta",
      "sender": "Mundo fiesta",
      "partType": "porte",
      "shipmentId": "HAB-143"
    },
    {
      "id": "COL-1789034937930-HAB-140-porte",
      "date": "2026-09-10",
      "type": "Porte",
      "amount": "10.00",
      "client": "Mundo fiesta",
      "sender": "Mundo fiesta",
      "partType": "porte",
      "shipmentId": "HAB-140"
    },
    {
      "id": "COL-1789034951026-HAB-123-porte",
      "date": "2026-09-10",
      "type": "Porte",
      "amount": "10.00",
      "client": "Mundo fiesta",
      "sender": "Mundo fiesta",
      "partType": "porte",
      "shipmentId": "HAB-123"
    },
    {
      "id": "COL-1789034984513-HAB-122-porte",
      "date": "2026-09-10",
      "type": "Porte",
      "amount": "15.00",
      "client": "Mundo fiesta",
      "sender": "Mundo fiesta",
      "partType": "porte",
      "shipmentId": "HAB-122"
    },
    {
      "id": "COL-1789034995131-HAB-120-porte",
      "date": "2026-09-10",
      "type": "Porte",
      "amount": "15.00",
      "client": "Mundo fiesta",
      "sender": "Mundo fiesta",
      "partType": "porte",
      "shipmentId": "HAB-120"
    },
    {
      "id": "COL-1789035020114-HAB-141-porte",
      "date": "2026-09-10",
      "type": "Porte",
      "amount": "10.00",
      "client": "Mundo fiesta",
      "sender": "Mundo fiesta",
      "partType": "porte",
      "shipmentId": "HAB-141"
    }
  ]
}$json$::jsonb
)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Comprobación: debe devolver una fila con el nombre y el alias PACO.
SELECT id,
       username,
       data->>'name'  AS nombre,
       data->>'alias' AS alias,
       data->>'email' AS correo,
       (data ? 'password') AS lleva_contrasena
  FROM public.drivers
 WHERE id = 1774550544570;
