import { describe, it, expect } from 'vitest';
import { calculateDailyAccount, parseAmount, isToday, isCashClient } from './accountLogic';

describe('accountLogic utilities', () => {
    describe('parseAmount', () => {
        it('should handle numbers correctly', () => {
            expect(parseAmount(10.5)).toBe(10.5);
        });
        it('should handle European comma format', () => {
            expect(parseAmount('10,50')).toBe(10.5);
            expect(parseAmount('1.250,75')).toBe(1250.75);
        });
        it('should handle currency symbols', () => {
            expect(parseAmount('€10.50')).toBe(10.5);
        });
        it('should return 0 for invalid values', () => {
            expect(parseAmount(null)).toBe(0);
            expect(parseAmount(undefined)).toBe(0);
            expect(parseAmount('abc')).toBe(0);
        });
    });

    describe('isToday', () => {
        it('should return true for today', () => {
            const today = new Date().toISOString();
            expect(isToday(today)).toBe(true);
        });
        it('should return false for yesterday', () => {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            expect(isToday(yesterday.toISOString())).toBe(false);
        });
    });

    describe('isCashClient', () => {
        const mockClients = [
            { name: 'Client A', billingType: 'Clientes Habituales' },
            { name: 'Client B', billingType: 'Facturación Mensual' },
            { name: 'Client C', billingType: 'Escritura Libre' }
        ];

        it('should return true for cash clients', () => {
            expect(isCashClient('Client A', mockClients)).toBe(true);
            expect(isCashClient('Client C', mockClients)).toBe(true);
        });
        it('should return false for invoice clients', () => {
            expect(isCashClient('Client B', mockClients)).toBe(false);
        });
        it('should return true for unknown clients (conservative safety)', () => {
            expect(isCashClient('Unknown', mockClients)).toBe(true);
        });
    });
});

describe('calculateDailyAccount logic - Los 7 Casos de Negocio', () => {
    const mockDriverId = 1;
    const today = new Date().toISOString();
    const mockClients = [
        { name: 'Invoice Client', billingType: 'Facturación' },
        { name: 'Cash Client', billingType: 'Clientes Habituales' }
    ];

    it('CASO 1: Facturación + Pagado -> Nada en caja', () => {
        const shipments = [{ 
            id: 'C1', porteType: 'Pagado', portePaid: true, client: 'Invoice Client', 
            assignedDriverId: 1, paidAt: today, amount: '50.00' 
        }];
        const result = calculateDailyAccount({ allShipments: shipments, driverId: mockDriverId, clients: mockClients, collectedCollections: [] });
        expect(result.collectedPorte).toBe(0);
        expect(result.dailyTotal).toBe(0);
    });

    it('CASO 2: Clientes Habituales + Pagado (Sin pagar) -> Nada en caja', () => {
        const shipments = [{ 
            id: 'C2', porteType: 'Pagado', portePaid: false, client: 'Cash Client', 
            assignedDriverId: 1, amount: '30.00' 
        }];
        const result = calculateDailyAccount({ allShipments: shipments, driverId: mockDriverId, clients: mockClients, collectedCollections: [] });
        expect(result.dailyTotal).toBe(0);
    });

    it('CASO 3: Debido + Clientes Habituales -> Porte en caja', () => {
        const shipments = [{ 
            id: 'C3', porteType: 'Debido', status: 'Entregado', portePaid: true, client: 'Cash Client', 
            assignedDriverId: 1, paidAt: today, amount: '25.00' 
        }];
        const result = calculateDailyAccount({ allShipments: shipments, driverId: mockDriverId, clients: mockClients, collectedCollections: [] });
        expect(result.collectedPorte).toBe(25);
    });

    it('CASO 4: Facturación + Pagado + Reembolso -> Solo Reembolso en caja', () => {
        const shipments = [{ 
            id: 'C4', porteType: 'Pagado', portePaid: true, client: 'Invoice Client', 
            assignedDriverId: 1, paidAt: today, amount: '40.00', hasCod: true, codAmount: '100.00', codPaid: true, status: 'Entregado'
        }];
        const result = calculateDailyAccount({ allShipments: shipments, driverId: mockDriverId, clients: mockClients, collectedCollections: [] });
        expect(result.collectedPorte).toBe(0);
        expect(result.collectedReembolsos).toBe(100);
    });

    it('CASO 5: Clientes Habituales + Pagado + Reembolso -> Solo Reembolso en caja (si porte sigue pendiente)', () => {
        const shipments = [{ 
            id: 'C5', porteType: 'Pagado', portePaid: false, client: 'Cash Client', 
            assignedDriverId: 1, amount: '35.00', hasCod: true, codAmount: '80.00', codPaid: true, status: 'Entregado', paidAt: today
        }];
        const result = calculateDailyAccount({ allShipments: shipments, driverId: mockDriverId, clients: mockClients, collectedCollections: [] });
        expect(result.collectedPorte).toBe(0);
        expect(result.collectedReembolsos).toBe(80);
    });

    it('CASO 6: Debido + Clientes Habituales + Reembolso -> Porte y Reembolso en caja', () => {
        const shipments = [{ 
            id: 'C6', porteType: 'Debido', status: 'Entregado', portePaid: true, client: 'Cash Client', 
            assignedDriverId: 1, paidAt: today, amount: '45.00', hasCod: true, codAmount: '120.00', codPaid: true
        }];
        const result = calculateDailyAccount({ allShipments: shipments, driverId: mockDriverId, clients: mockClients, collectedCollections: [] });
        expect(result.collectedPorte).toBe(45);
        expect(result.collectedReembolsos).toBe(120);
    });

    it('CASO 7: Debido + Facturación + Reembolso -> Solo Reembolso en caja', () => {
        const shipments = [{ 
            id: 'C7', porteType: 'Debido', status: 'Entregado', portePaid: true, client: 'Invoice Client', 
            assignedDriverId: 1, paidAt: today, amount: '50.00', hasCod: true, codAmount: '90.00', codPaid: true
        }];
        const result = calculateDailyAccount({ allShipments: shipments, driverId: mockDriverId, clients: mockClients, collectedCollections: [] });
        expect(result.collectedPorte).toBe(0);
        expect(result.collectedReembolsos).toBe(90);
    });

    it('should include manual collections', () => {
        const collected = [{ id: 'M1', type: 'Porte', amount: '20.00', date: today, client: 'Manual' }];
        const result = calculateDailyAccount({ allShipments: [], driverId: mockDriverId, clients: [], collectedCollections: collected });
        expect(result.collectedPorte).toBe(20);
    });

    it('should filter out other drivers collections', () => {
        const shipments = [{ id: 'S1', porteType: 'Debido', status: 'Entregado', portePaid: true, assignedDriverId: 2, paidAt: today, amount: '10.00' }];
        const result = calculateDailyAccount({ allShipments: shipments, driverId: mockDriverId, clients: [], collectedCollections: [] });
        expect(result.dailyTotal).toBe(0);
    });

    it('should filter out old collections', () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const shipments = [
            { id: 'S1', porteType: 'Pagado', portePaid: true, assignedDriverId: 1, paidAt: yesterday.toISOString(), amount: '10.00' }
        ];
        const result = calculateDailyAccount({
            allShipments: shipments,
            driverId: mockDriverId,
            clients: [],
            collectedCollections: []
        });
        expect(result.dailyTotal).toBe(0);
    });

    it('should calculate Case 5 (Porte Pagado + Reembolso) correctly', () => {
        const shipments = [
            { 
                id: 'CASE5', 
                porteType: 'Pagado', 
                portePaid: true, 
                assignedDriverId: 1, 
                paidAt: today, 
                amount: '12.00', 
                client: 'Miki Test',
                hasCod: true,
                codAmount: '100.00',
                codPaid: true,
                status: 'Entregado'
            }
        ];
        const result = calculateDailyAccount({
            allShipments: shipments,
            driverId: mockDriverId,
            clients: [],
            collectedCollections: []
        });
        expect(result.collectedPorte).toBe(12);
        expect(result.collectedReembolsos).toBe(100);
        expect(result.dailyTotal).toBe(112);
    });

    it('should calculate Case 6 (Porte Debido + Contado) correctly', () => {
        const shipments = [
            { 
                id: 'CASE6', 
                porteType: 'Debido', 
                status: 'Entregado',
                portePaid: true, 
                assignedDriverId: 1, 
                paidAt: today, 
                amount: '25.00', 
                client: 'Cash Client',
                destinationName: 'Destinatario Final'
            }
        ];
        const result = calculateDailyAccount({
            allShipments: shipments,
            driverId: mockDriverId,
            clients: [],
            collectedCollections: []
        });
        expect(result.collectedPorte).toBe(25);
        expect(result.dailyTotal).toBe(25);
    });

    it('should calculate Case 7 (Porte Debido Facturación + Reembolso Contado) correctly', () => {
        const mockClients = [{ name: 'Invoice Client', billingType: 'Facturación' }];
        const shipments = [
            { 
                id: 'CASE7', 
                porteType: 'Debido', 
                status: 'Entregado',
                portePaid: true, 
                assignedDriverId: 1, 
                paidAt: today, 
                amount: '50.00', 
                client: 'Invoice Client', // The payer
                hasCod: true,
                codAmount: '150.00',
                codPaid: true
            }
        ];
        const result = calculateDailyAccount({
            allShipments: shipments,
            driverId: mockDriverId,
            clients: mockClients,
            collectedCollections: []
        });
        // Porte (50) should be 0 because client is 'Facturación'
        expect(result.collectedPorte).toBe(0);
        // COD (150) should still be collected
        expect(result.collectedReembolsos).toBe(150);
        expect(result.dailyTotal).toBe(150);
    });
});
