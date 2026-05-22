import React, { useState, useEffect } from 'react';
import { X, MapPin, Calendar, Clock, Package, User, Phone, FileText, Euro, CreditCard, Save, Edit2 } from 'lucide-react';

export default function ShipmentDetailsModal({ isOpen, onClose, shipment, onUpdate }) {
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({});

    useEffect(() => {
        if (shipment) {
            setFormData(shipment);
            setIsEditing(false);
        }
    }, [shipment, isOpen]);

    if (!isOpen || !shipment) return null;

    const handleSave = () => {
        if (onUpdate) {
            onUpdate(shipment.id, formData);
        }
        setIsEditing(false);
    };

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    // Helper to render field or input
    const renderField = (label, value, fieldName, icon = null, type = "text", fullWidth = false) => {
        return (
            <div className={`space-y-1 ${fullWidth ? 'col-span-full' : ''}`}>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                    {icon && React.cloneElement(icon, { size: 12 })}
                    {label}
                </span>
                {isEditing ? (
                    type === 'textarea' ? (
                        <textarea
                            value={formData[fieldName] || ''}
                            onChange={(e) => handleChange(fieldName, e.target.value)}
                            className="w-full text-sm border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            rows={3}
                        />
                    ) : (
                        <input
                            type={type}
                            value={formData[fieldName] || ''}
                            onChange={(e) => handleChange(fieldName, e.target.value)}
                            className="w-full text-sm border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                    )
                ) : (
                    <p className="text-gray-800 font-medium text-sm break-words whitespace-pre-wrap">
                        {value || <span className="text-gray-300 italic">No especificado</span>}
                    </p>
                )}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-gray-100 p-4 flex items-center justify-between z-10 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${shipment.type === 'Recogida' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                            <Package size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-800 leading-tight">
                                {shipment.type === 'Recogida' ? 'Detalles de Recogida' : 'Albarán de Entrega'}
                            </h2>
                            <p className="text-xs text-gray-500 font-mono">REF: {shipment.id}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {!isEditing && (
                            <button
                                onClick={() => setIsEditing(true)}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                                title="Editar"
                            >
                                <Edit2 size={20} />
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 rounded-full transition-colors"
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>

                <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                    {/* Client Information */}
                    <div className="bg-gray-50 p-4 rounded-xl space-y-4 border border-gray-100">
                        <h3 className="font-bold text-gray-900 flex items-center gap-2 text-sm border-b border-gray-200 pb-2">
                            <User size={16} className="text-gray-500" />
                            Datos del Cliente / Pagador
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            {renderField("Cliente", formData.client, "client", null, "text", true)}
                            {/* Previously 'clientName' was used, corrected to 'formData.client' */}
                        </div>
                    </div>

                    {/* Locations */}
                    <div className="space-y-4">
                        <div className="relative pl-4 border-l-2 border-dashed border-gray-300 space-y-6">
                            {/* Origin */}
                            <div className="relative">
                                <div className="absolute -left-[21px] top-0 w-3 h-3 rounded-full bg-blue-500 ring-4 ring-white"></div>
                                <h4 className="text-xs font-bold text-blue-600 mb-2 uppercase">Origen (Remitente)</h4>
                                <div className="grid grid-cols-1 gap-3">
                                    {renderField("Nombre", formData.originName || formData.senderName, "originName")}
                                    {renderField("Dirección", formData.originAddress || formData.origin, "originAddress", <MapPin />)}
                                    <div className="grid grid-cols-2 gap-3">
                                        {renderField("Teléfono", formData.originPhone, "originPhone", <Phone />)}
                                    </div>
                                </div>
                            </div>

                            {/* Destination */}
                            <div className="relative">
                                <div className="absolute -left-[21px] top-0 w-3 h-3 rounded-full bg-green-500 ring-4 ring-white"></div>
                                <h4 className="text-xs font-bold text-green-600 mb-2 uppercase">Destino (Entrega)</h4>
                                <div className="grid grid-cols-1 gap-3">
                                    {renderField("Nombre", formData.destinationName || formData.receiverName, "destinationName")}
                                    {renderField("Dirección", formData.destinationAddress || formData.destination || formData.address, "destinationAddress", <MapPin />)}
                                    <div className="grid grid-cols-2 gap-3">
                                        {renderField("Teléfono", formData.destinationPhone, "destinationPhone", <Phone />)}
                                        {renderField("Contacto", formData.destinationContact, "destinationContact", <User />)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Details (Amounts, Packages) */}
                    <div className="grid grid-cols-2 gap-4">
                        {renderField("Precio Final Porte", formData.amount, "amount", <Euro />)}
                        {renderField("Bultos", formData.packages, "packages", <Package />)}
                    </div>

                    {formData.hasCod && (
                        <div className="bg-red-50 p-3 rounded-lg border border-red-100 flex gap-4 animate-in fade-in slide-in-from-bottom-2">
                            <div className="flex-1">
                                <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider block mb-1">Valor Reembolso (A Cobrar)</span>
                                <span className="text-sm font-bold text-red-700">{formData.codAmount} €</span>
                            </div>
                            <div className="flex-1 border-l border-red-200 pl-4">
                                <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider block mb-1">Comisión (Incluida)</span>
                                <span className="text-sm font-bold text-red-700">{formData.codCommission} €</span>
                            </div>
                        </div>
                    )}

                    {/* Observations */}
                    <div className={`p-4 rounded-xl border ${isEditing ? 'bg-white border-gray-200' : 'bg-yellow-50 border-yellow-100'} transition-colors`}>
                        {renderField("Observaciones", formData.observations, "observations", <FileText />, "textarea", true)}
                    </div>

                </div>

                {/* Footer Buttons */}
                {isEditing ? (
                    <div className="border-t border-gray-100 p-4 bg-gray-50 shrink-0 flex gap-3 animate-in slide-in-from-bottom-2">
                        <button
                            onClick={() => {
                                setFormData(shipment);
                                setIsEditing(false);
                            }}
                            className="flex-1 py-3 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            className="flex-1 py-3 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
                        >
                            <Save size={18} />
                            Guardar Cambios
                        </button>
                    </div>
                ) : (
                    <div className="border-t border-gray-100 p-4 bg-gray-50 shrink-0">
                        <button
                            onClick={onClose}
                            className="w-full py-3 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-100"
                        >
                            Cerrar
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
