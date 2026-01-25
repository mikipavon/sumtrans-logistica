import React from 'react';
import { X, MapPin, Calendar, Clock, Package, User, Phone, FileText, Euro, CreditCard } from 'lucide-react';

export default function ShipmentDetailsModal({ isOpen, onClose, shipment }) {
    if (!isOpen || !shipment) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-gray-100 p-4 flex items-center justify-between z-10">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <Package className="text-blue-600" size={24} />
                            Detalles del Envío
                        </h2>
                        <p className="text-sm text-gray-500">REF: {shipment.id}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X size={24} className="text-gray-500" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Status Banner */}
                    <div className={`p-4 rounded-xl flex items-center justify-between ${shipment.status === 'Entregado' ? 'bg-green-50 text-green-700' :
                            shipment.status === 'En Reparto' ? 'bg-blue-50 text-blue-700' :
                                'bg-gray-50 text-gray-700'
                        }`}>
                        <span className="font-semibold flex items-center gap-2">
                            Status: {shipment.status}
                        </span>
                        {shipment.type && (
                            <span className="px-3 py-1 bg-white/50 rounded-lg text-sm font-medium border border-black/5">
                                {shipment.type}
                            </span>
                        )}
                    </div>

                    {/* Customer Info */}
                    <div className="bg-gray-50 p-4 rounded-xl space-y-3">
                        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                            <User size={18} />
                            Cliente
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <span className="text-xs text-gray-500 block">Nombre</span>
                                <span className="text-gray-900">{shipment.clientName || 'N/A'}</span>
                            </div>
                            <div>
                                <span className="text-xs text-gray-500 block">Teléfono</span>
                                <div className="flex items-center gap-2">
                                    <Phone size={14} className="text-gray-400" />
                                    <a href={`tel:${shipment.clientPhone}`} className="text-blue-600 hover:underline">
                                        {shipment.clientPhone || 'N/A'}
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Route Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Origin */}
                        <div className="space-y-2">
                            <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm uppercase tracking-wider">
                                <div className="w-2 h-2 rounded-full bg-blue-500" />
                                Origen
                            </h3>
                            <div className="bg-white border hover:border-blue-200 transition-colors p-3 rounded-xl shadow-sm h-full">
                                <p className="text-gray-800 font-medium mb-1">{shipment.senderName || 'Remitente'}</p>
                                <div className="flex items-start gap-2 text-gray-600 text-sm">
                                    <MapPin size={16} className="mt-1 flex-shrink-0 text-gray-400" />
                                    <p>{shipment.originAddress}</p>
                                </div>
                            </div>
                        </div>

                        {/* Destination */}
                        <div className="space-y-2">
                            <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm uppercase tracking-wider">
                                <div className="w-2 h-2 rounded-full bg-green-500" />
                                Destino
                            </h3>
                            <div className="bg-white border hover:border-green-200 transition-colors p-3 rounded-xl shadow-sm h-full">
                                <p className="text-gray-800 font-medium mb-1">{shipment.receiverName || 'Destinatario'}</p>
                                <div className="flex items-start gap-2 text-gray-600 text-sm">
                                    <MapPin size={16} className="mt-1 flex-shrink-0 text-gray-400" />
                                    <p>{shipment.destinationAddress}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div className="bg-gray-50 p-3 rounded-xl">
                            <span className="text-xs text-gray-500 flex items-center gap-1 mb-1">
                                <Package size={14} />
                                Bultos
                            </span>
                            <p className="font-semibold text-lg">{shipment.packages || 0}</p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-xl">
                            <span className="text-xs text-gray-500 flex items-center gap-1 mb-1">
                                <Euro size={14} />
                                Reembolso
                            </span>
                            {/* Check if codAmount exists and is non-zero */}
                            <p className={`font-semibold text-lg ${parseFloat(shipment.codAmount) > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                                {parseFloat(shipment.codAmount) > 0 ? `${shipment.codAmount}€` : 'No'}
                            </p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-xl">
                            <span className="text-xs text-gray-500 flex items-center gap-1 mb-1">
                                <CreditCard size={14} />
                                Portes
                            </span>
                            <p className="font-semibold text-lg">
                                {shipment.shippingCost ? `${shipment.shippingCost}€` : 'Pagados'}
                            </p>
                        </div>
                    </div>

                    {/* Dates */}
                    <div className="border-t border-gray-100 pt-4 flex gap-6 text-sm">
                        <div className="flex items-center gap-2 text-gray-600">
                            <Calendar size={16} />
                            <span>Creado: {new Date(shipment.createdAt).toLocaleDateString()}</span>
                        </div>
                        {shipment.deliveryDate && (
                            <div className="flex items-center gap-2 text-gray-600">
                                <Clock size={16} />
                                <span>Entrega: {new Date(shipment.deliveryDate).toLocaleDateString()}</span>
                            </div>
                        )}
                    </div>

                    {/* Observations */}
                    {shipment.observations && (
                        <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-100">
                            <h4 className="font-medium text-yellow-800 flex items-center gap-2 mb-2">
                                <FileText size={16} />
                                Observaciones
                            </h4>
                            <p className="text-yellow-900 text-sm whitespace-pre-wrap">
                                {shipment.observations}
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="border-t border-gray-100 p-4 bg-gray-50 rounded-b-2xl flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-white border border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
