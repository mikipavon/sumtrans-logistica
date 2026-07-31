import React from 'react';
import PropTypes from 'prop-types';
import { registrarError } from '../utils/errorLog';

/**
 * Red de seguridad de toda la aplicación.
 *
 * Había un ErrorBoundary, pero solo alrededor del panel del repartidor: un fallo en
 * cualquier otra pantalla dejaba la página en blanco y sin rastro. Este envuelve la
 * aplicación entera y, sobre todo, deja constancia en la nube de lo que pasó.
 *
 * El mensaje está escrito para quien lo va a leer: alguien en la carretera, con prisa.
 * Lo primero es recargar; el detalle técnico está debajo y plegado, por si hay que
 * dictarlo por teléfono.
 */
export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, componentStack: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ componentStack: errorInfo?.componentStack || null });
        console.error(`[ErrorBoundary${this.props.origen ? ` ${this.props.origen}` : ''}]`, error, errorInfo);
        registrarError(error, {
            origen: this.props.origen || 'ErrorBoundary',
            componentStack: errorInfo?.componentStack
        });
    }

    render() {
        if (!this.state.hasError) return this.props.children;

        return (
            <div className="min-h-screen bg-red-50 text-red-900 p-6 flex flex-col items-center justify-center">
                <div className="w-full max-w-md">
                    <h1 className="text-2xl font-bold mb-2">La aplicación se ha parado</h1>
                    <p className="mb-6 text-red-800">
                        Se ha avisado a la oficina automáticamente. Vuelve a abrirla y sigue con la ruta:
                        no se ha perdido ningún envío ni ningún cobro.
                    </p>

                    <button
                        className="w-full px-4 py-4 bg-red-600 text-white rounded-lg font-bold text-lg active:bg-red-700"
                        onClick={() => window.location.reload()}
                    >
                        Volver a abrir
                    </button>

                    <details className="mt-6 text-sm">
                        <summary className="cursor-pointer text-red-700">Detalle técnico</summary>
                        <pre className="mt-2 p-3 bg-white rounded border border-red-200 overflow-auto text-xs whitespace-pre-wrap">
                            {String(this.state.error || '')}
                            {this.state.componentStack || ''}
                        </pre>
                    </details>
                </div>
            </div>
        );
    }
}

ErrorBoundary.propTypes = {
    children: PropTypes.node,
    origen: PropTypes.string
};
