import React from 'react';
import ReactDOMServer from 'react-dom/server';
import Shipments from './src/pages/Shipments.jsx';
import CreateShipmentModal from './src/components/shipments/CreateShipmentModal.jsx';
import ShipmentDetailsModal from './src/components/shipments/ShipmentDetailsModal.jsx';

try {
    const html = ReactDOMServer.renderToString(
        React.createElement(Shipments, { 
            shipments: [], 
            drivers: [], 
            clients: [], 
            allPoblaciones: [],
            tariffs: [],
            articles: [],
            familyOrder: []
        })
    );
    console.log("Rendered successfully length:", html.length);
} catch (e) {
    console.error("RUNTIME ERROR DURING SSR:", e);
}
